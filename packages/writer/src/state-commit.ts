import { spawn } from "node:child_process"
import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import { verifyAuthorConfirmation, type AuthorConfirmation } from "./commit.ts"
import {
  loadStoryStateProposal,
  proposedStoryState,
  storyStateProposalPath,
  type StoryStateProposal,
} from "./state-proposal.ts"
import { loadStoryState, storyStateDigest, validateStoryState } from "./state.ts"
import { digest, loadWriterWorkspace } from "./workspace.ts"

export type StoryStateCommitReceipt = {
  receiptVersion: 1
  id: `sha256:${string}`
  status: "committed"
  kind: "story-state"
  proposalId: StoryStateProposal["id"]
  confirmation: AuthorConfirmation
  baseCommit: string
  state: {
    path: ".novel-agent/story-state.json"
    beforeSha256: `sha256:${string}`
    afterSha256: `sha256:${string}`
  }
}

export type StoryStateCommit = {
  commit: string
  receipt: StoryStateCommitReceipt
  receiptPath: string
}

export type StoryStateCommitOptions = {
  git?: string
  message?: string
}

type GitOutput = { stdout: string; stderr: string }

const contentIdPattern = /^sha256:[a-f0-9]{64}$/
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const stateRelative = ".novel-agent/story-state.json" as const

export async function commitStoryStateProposal(
  root: string,
  id: string,
  value: AuthorConfirmation,
  options: StoryStateCommitOptions = {},
): Promise<StoryStateCommit> {
  const workspace = await loadWriterWorkspace(root)
  const proposal = await loadStoryStateProposal(workspace.root, id)
  if (!proposal.validation.valid) throw new Error("cannot commit an invalid story-state proposal")
  const confirmation = verifyAuthorConfirmation(value, proposal.id)
  const loaded = await loadStoryState(workspace.root)

  const executable = options.git ?? "git"
  const repository = resolve((await runGit(workspace.root, ["rev-parse", "--show-toplevel"], executable)).stdout.trim())
  if (relative(workspace.root, repository)) throw new Error("writer workspace must be the Git repository root")
  await runGit(workspace.root, ["symbolic-ref", "--quiet", "HEAD"], executable)
  const baseCommit = await head(workspace.root, executable)
  await rejectCommittedProposal(workspace.root, baseCommit, proposal.id, executable)
  const next = proposedStoryState(loaded.state, proposal)
  validateStoryState(workspace, next)

  const proposalPath = await storyStateProposalPath(workspace.root, proposal.id)
  const proposalRelative = repositoryPath(workspace.root, proposalPath)
  const initialStatus = (
    await runGit(workspace.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable)
  ).stdout
  const untrackedProposal = `?? ${proposalRelative}\0`
  if (initialStatus !== "" && initialStatus !== untrackedProposal) {
    throw new Error("writer workspace must be clean except for the saved story-state proposal")
  }

  const previousBytes = loaded.exists ? await readFile(loaded.path, "utf8") : undefined
  const nextBytes = `${JSON.stringify(next, null, 2)}\n`
  const receipt = createReceipt(proposal, confirmation, baseCommit, loaded.sha256, storyStateDigest(next))
  const receiptPath = await stateReceiptPath(workspace.root, receipt.id, true)
  const receiptRelative = repositoryPath(workspace.root, receiptPath)
  const changed = [
    stateRelative,
    receiptRelative,
    ...(initialStatus === untrackedProposal ? [proposalRelative] : []),
  ].sort()
  const staged = [stateRelative, proposalRelative, receiptRelative]
  let stateWritten = false
  let receiptCreated = false
  let blobs: Map<string, string> | undefined

  try {
    await atomicStateWrite(loaded.path, nextBytes, loaded.exists)
    stateWritten = true
    const applied = await loadStoryState(workspace.root)
    if (applied.sha256 !== receipt.state.afterSha256) throw new Error("story-state proposal did not apply exactly")
    validateStoryState(await loadWriterWorkspace(workspace.root), applied.state)
    await atomicCreate(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    receiptCreated = true
    await runGit(workspace.root, ["add", "--", ...staged], executable)
    await verifyStagedScope(workspace.root, changed, executable)
    blobs = await stagedBlobIds(workspace.root, staged, executable)
    if ((await head(workspace.root, executable)) !== baseCommit) throw new Error("Git HEAD changed during state commit")
    const hooks = await mkdtemp(join(tmpdir(), "novel-agent-hooks-"))
    try {
      await runGit(
        workspace.root,
        ["-c", `core.hooksPath=${hooks}`, "commit", "--quiet", "-m", commitMessage(proposal, receipt, options.message)],
        executable,
      )
    } finally {
      await rm(hooks, { recursive: true, force: true })
    }
  } catch (error) {
    const current = await head(workspace.root, executable).catch(() => baseCommit)
    if (current !== baseCommit) {
      throw new Error(`story-state commit may have succeeded as ${current}; automatic rollback was not attempted`, {
        cause: error,
      })
    }
    await rollback(
      workspace.root,
      loaded.path,
      previousBytes,
      stateWritten,
      receiptPath,
      receiptCreated,
      staged,
      initialStatus,
      executable,
    )
    throw new Error(`story-state commit failed and prior state was restored: ${message(error)}`, { cause: error })
  }

  const commit = await head(workspace.root, executable)
  if (commit === baseCommit) throw new Error("Git did not create a story-state commit")
  if (!blobs) throw new Error(`story-state commit ${commit} was created without staged blob receipts`)
  await verifyCreatedCommit(workspace.root, commit, changed, receiptRelative, receipt, blobs, executable)
  return { commit, receipt, receiptPath }
}

export function verifyStoryStateCommitReceipt(value: unknown): StoryStateCommitReceipt {
  const input = record(value, "story-state receipt")
  if (input.receiptVersion !== 1) throw new Error("story-state receipt.receiptVersion must be 1")
  if (input.status !== "committed") throw new Error("story-state receipt.status must be committed")
  if (input.kind !== "story-state") throw new Error("story-state receipt.kind must be story-state")
  const id = contentId(input.id, "story-state receipt.id")
  const proposalId = contentId(input.proposalId, "story-state receipt.proposalId")
  const confirmation = verifyAuthorConfirmation(input.confirmation, proposalId)
  const baseCommit = text(input.baseCommit, "story-state receipt.baseCommit")
  if (!commitPattern.test(baseCommit)) throw new Error("story-state receipt.baseCommit must be a Git commit id")
  const state = record(input.state, "story-state receipt.state")
  if (state.path !== stateRelative) throw new Error(`story-state receipt.state.path must be ${stateRelative}`)
  const result = {
    receiptVersion: 1 as const,
    id,
    status: "committed" as const,
    kind: "story-state" as const,
    proposalId,
    confirmation,
    baseCommit,
    state: {
      path: stateRelative,
      beforeSha256: contentId(state.beforeSha256, "story-state receipt.state.beforeSha256"),
      afterSha256: contentId(state.afterSha256, "story-state receipt.state.afterSha256"),
    },
  }
  const { id: _stored, ...payload } = result
  if (storyStateReceiptContentId(payload) !== id) throw new Error("story-state receipt content address is invalid")
  return result
}

export async function loadStoryStateCommitReceipt(root: string, id: string) {
  const path = await stateReceiptPath(root, id, false)
  const receipt = verifyStoryStateCommitReceipt(JSON.parse(await readFile(path, "utf8")))
  if (receipt.id !== id) throw new Error(`story-state receipt content address does not match requested id: ${id}`)
  return receipt
}

export function storyStateReceiptContentId(value: Omit<StoryStateCommitReceipt, "id">): `sha256:${string}` {
  return digest(stableJson(value))
}

function createReceipt(
  proposal: StoryStateProposal,
  confirmation: AuthorConfirmation,
  baseCommit: string,
  beforeSha256: `sha256:${string}`,
  afterSha256: `sha256:${string}`,
) {
  const payload = {
    receiptVersion: 1 as const,
    status: "committed" as const,
    kind: "story-state" as const,
    proposalId: proposal.id,
    confirmation,
    baseCommit,
    state: { path: stateRelative, beforeSha256, afterSha256 },
  }
  return { ...payload, id: storyStateReceiptContentId(payload) }
}

async function rejectCommittedProposal(root: string, commit: string, proposalId: string, executable: string) {
  const output = await runGit(
    root,
    ["ls-tree", "-r", "--name-only", "-z", commit, "--", ".novel-agent/state-receipts"],
    executable,
  )
  for (const path of paths(output.stdout)) {
    if (!/^\.novel-agent\/state-receipts\/[a-f0-9]{64}\.json$/.test(path)) continue
    const receipt = verifyStoryStateCommitReceipt(
      JSON.parse((await runGit(root, ["show", `${commit}:${path}`], executable)).stdout),
    )
    if (receipt.proposalId === proposalId)
      throw new Error(`story-state proposal was already committed with receipt ${receipt.id}`)
  }
}

async function verifyStagedScope(root: string, expected: string[], executable: string) {
  const staged = paths((await runGit(root, ["diff", "--cached", "--name-only", "-z"], executable)).stdout).sort()
  if (!equalPaths(staged, expected)) throw new Error("Git staged files outside the approved story-state scope")
  if ((await runGit(root, ["diff", "--name-only", "-z"], executable)).stdout)
    throw new Error("workspace changed while story state was staged")
  if ((await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], executable)).stdout)
    throw new Error("untracked files appeared while story state was staged")
}

async function verifyCreatedCommit(
  root: string,
  commit: string,
  expected: string[],
  receiptPath: string,
  receipt: StoryStateCommitReceipt,
  blobs: Map<string, string>,
  executable: string,
) {
  const changed = paths(
    (await runGit(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit], executable)).stdout,
  ).sort()
  if (!equalPaths(changed, expected))
    throw new Error("created Git commit contains files outside the approved story-state scope")
  if ((await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable)).stdout)
    throw new Error(`story-state commit ${commit} left a dirty workspace`)
  const stored = verifyStoryStateCommitReceipt(
    JSON.parse((await runGit(root, ["show", `${commit}:${receiptPath}`], executable)).stdout),
  )
  if (stored.id !== receipt.id) throw new Error("created Git commit contains a different story-state receipt")
  for (const [path, blob] of blobs) {
    if ((await runGit(root, ["rev-parse", `${commit}:${path}`], executable)).stdout.trim() !== blob)
      throw new Error(`created commit contains a different staged blob for ${path}`)
  }
}

async function rollback(
  root: string,
  statePath: string,
  previousBytes: string | undefined,
  stateWritten: boolean,
  receiptPath: string,
  receiptCreated: boolean,
  staged: string[],
  initialStatus: string,
  executable: string,
) {
  const failures: string[] = []
  await runGit(root, ["reset", "--quiet", "HEAD", "--", ...staged], executable).catch((error) =>
    failures.push(message(error)),
  )
  if (stateWritten) {
    if (previousBytes === undefined)
      await rm(statePath, { force: true }).catch((error) => failures.push(message(error)))
    else await atomicStateWrite(statePath, previousBytes, true).catch((error) => failures.push(message(error)))
  }
  if (receiptCreated) await rm(receiptPath, { force: true }).catch((error) => failures.push(message(error)))
  const status = await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable).catch(
    (error) => {
      failures.push(message(error))
      return undefined
    },
  )
  if (status && status.stdout !== initialStatus) failures.push("workspace did not return to its original Git state")
  if (failures.length) throw new Error(`story-state rollback failed: ${failures.join("; ")}`)
}

async function atomicStateWrite(path: string, value: string, exists: boolean) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, value, { flag: "wx", ...(exists ? { mode: (await stat(path)).mode } : {}) })
    if (exists) await rename(temporary, path)
    else await link(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function atomicCreate(path: string, value: string) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, value, { flag: "wx" })
    await link(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function stateReceiptPath(root: string, id: string, create: boolean) {
  contentId(id, "story-state receipt id")
  const workspaceRoot = await realpath(resolve(root))
  const lexical = resolve(workspaceRoot, ".novel-agent", "state-receipts")
  if (create) await mkdir(lexical, { recursive: true })
  const directory = await realpath(lexical)
  ensureContained(workspaceRoot, directory)
  const candidate = resolve(directory, `${id.slice("sha256:".length)}.json`)
  ensureContained(directory, candidate)
  if (!create) {
    const result = await realpath(candidate)
    ensureContained(directory, result)
    return result
  }
  return candidate
}

function commitMessage(proposal: StoryStateProposal, receipt: StoryStateCommitReceipt, value?: string) {
  const subject = value === undefined ? "Apply approved story-state update" : singleLine(value, "commit message")
  return `${subject}\n\nProposal-ID: ${proposal.id}\nReceipt-ID: ${receipt.id}\nConfirmed-By: ${receipt.confirmation.confirmedBy}`
}

function repositoryPath(root: string, path: string) {
  return normalizedRelative(relative(root, path).replaceAll("\\", "/"), "repository path")
}
function normalizedRelative(value: unknown, label: string) {
  const result = text(value, label)
  if (
    isAbsolute(result) ||
    result.includes(":") ||
    result.includes("\\") ||
    /[\0\r\n]/.test(result) ||
    result.split("/").some((part) => part === "." || part === ".." || !part)
  )
    throw new Error(`${label} must be a normalized relative path`)
  return result
}
function ensureContained(root: string, candidate: string) {
  const inside = relative(root, candidate)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside))
    throw new Error(`story-state receipt path escapes the writer workspace: ${candidate}`)
}
function equalPaths(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
function paths(value: string) {
  return value.split("\0").filter(Boolean)
}
function head(root: string, executable: string) {
  return runGit(root, ["rev-parse", "HEAD"], executable).then((result) => result.stdout.trim())
}
function stagedBlobIds(root: string, paths: string[], executable: string) {
  return Promise.all(
    paths.map(
      async (path) => [path, (await runGit(root, ["rev-parse", `:${path}`], executable)).stdout.trim()] as const,
    ),
  ).then((entries) => new Map(entries))
}
function runGit(root: string, args: string[], executable: string) {
  return new Promise<GitOutput>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    const stdout: string[] = []
    const stderr: string[] = []
    child.stdout.setEncoding("utf8").on("data", (value: string) => stdout.push(value))
    child.stderr.setEncoding("utf8").on("data", (value: string) => stderr.push(value))
    child.on("error", reject)
    child.on("close", (code) => {
      const result = { stdout: stdout.join(""), stderr: stderr.join("") }
      code === 0
        ? resolve(result)
        : reject(new Error(`git ${args[0] ?? "command"} failed: ${result.stderr.trim() || `exit ${code}`}`))
    })
  })
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
function contentId(value: unknown, label: string) {
  const result = text(value, label)
  if (!contentIdPattern.test(result)) throw new Error(`${label} must be a SHA-256 content address`)
  return result as `sha256:${string}`
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return Object.fromEntries(Object.entries(value))
}
function singleLine(value: unknown, label: string) {
  const result = text(value, label)
  if (/[\0\r\n]/.test(result)) throw new Error(`${label} must be a single line`)
  return result
}
function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
