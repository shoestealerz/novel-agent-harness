import { spawn } from "node:child_process"
import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import type { EditProposal } from "./proposal.ts"
import { editProposalPath, loadEditProposal } from "./review.ts"
import { digest, loadWriterWorkspace, passage, type WriterWorkspace } from "./workspace.ts"

export type AuthorConfirmation = {
  confirmationVersion: 1
  proposalId: EditProposal["id"]
  decision: "approve"
  confirmedBy: string
  confirmedAt: string
}

export type CommitReceipt = {
  receiptVersion: 1
  id: `sha256:${string}`
  status: "committed"
  proposalId: EditProposal["id"]
  confirmation: AuthorConfirmation
  baseCommit: string
  changes: {
    target: string
    path: string
    beforeSha256: `sha256:${string}`
    afterSha256: `sha256:${string}`
  }[]
}

export type ProposalCommit = {
  commit: string
  receipt: CommitReceipt
  receiptPath: string
}

export type ProposalCommitOptions = {
  git?: string
  message?: string
}

type GitOutput = {
  stdout: string
  stderr: string
}

type ChapterUpdate = {
  path: string
  relativePath: string
  before: string
  after: string
}

const contentIdPattern = /^sha256:[a-f0-9]{64}$/
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

export async function commitEditProposal(
  root: string,
  id: string,
  value: AuthorConfirmation,
  options: ProposalCommitOptions = {},
): Promise<ProposalCommit> {
  const proposal = await loadEditProposal(root, id)
  if (!proposal.validation.valid) throw new Error("cannot commit an invalid edit proposal")
  const confirmation = verifyAuthorConfirmation(value, proposal.id)
  const workspace = await loadWriterWorkspace(root)
  const executable = options.git ?? "git"
  const repository = resolve((await runGit(workspace.root, ["rev-parse", "--show-toplevel"], executable)).stdout.trim())
  if (relative(workspace.root, repository)) throw new Error("writer workspace must be the Git repository root")
  await runGit(workspace.root, ["symbolic-ref", "--quiet", "HEAD"], executable)
  const baseCommit = await head(workspace.root, executable)

  await rejectCommittedProposal(workspace.root, baseCommit, proposal.id, executable)
  verifyFreshProposal(workspace, proposal)

  const proposalPath = await editProposalPath(workspace.root, proposal.id)
  const proposalRelative = repositoryPath(workspace.root, proposalPath)
  const initialStatus = (
    await runGit(workspace.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable)
  ).stdout
  const untrackedProposal = `?? ${proposalRelative}\0`
  if (initialStatus !== "" && initialStatus !== untrackedProposal) {
    throw new Error("writer workspace must be clean except for the saved proposal")
  }

  const updates = chapterUpdates(workspace, proposal)
  const receipt = createReceipt(workspace, proposal, confirmation, baseCommit)
  const receiptPath = await commitReceiptPath(workspace.root, receipt.id, true)
  const receiptRelative = repositoryPath(workspace.root, receiptPath)
  const changed = [
    ...updates.map((item) => item.relativePath),
    receiptRelative,
    ...(initialStatus === untrackedProposal ? [proposalRelative] : []),
  ].sort()
  const staged = [...new Set([...updates.map((item) => item.relativePath), proposalRelative, receiptRelative])]
  let receiptCreated = false
  let blobs: Map<string, string> | undefined

  try {
    for (const update of updates) await atomicWrite(update.path, update.after)
    verifyAppliedProposal(await loadWriterWorkspace(workspace.root), workspace, proposal, updates)
    await atomicCreate(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    receiptCreated = true
    await runGit(workspace.root, ["add", "--", ...staged], executable)
    await verifyStagedScope(workspace.root, changed, executable)
    blobs = await stagedBlobIds(workspace.root, staged, executable)
    if ((await head(workspace.root, executable)) !== baseCommit)
      throw new Error("Git HEAD changed during proposal commit")

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
      throw new Error(`proposal commit may have succeeded as ${current}; automatic rollback was not attempted`, {
        cause: error,
      })
    }
    await rollback(workspace.root, updates, receiptPath, receiptCreated, staged, initialStatus, executable)
    throw new Error(`proposal commit failed and manuscript changes were restored: ${message(error)}`, { cause: error })
  }

  const commit = await head(workspace.root, executable)
  if (commit === baseCommit) throw new Error("Git did not create a proposal commit")
  if (!blobs) throw new Error(`proposal commit ${commit} was created without staged blob receipts`)
  await verifyCreatedCommit(workspace.root, commit, changed, receiptRelative, receipt, blobs, executable).catch(
    (error) => {
      throw new Error(`proposal commit ${commit} was created but verification failed: ${message(error)}`, {
        cause: error,
      })
    },
  )
  return { commit, receipt, receiptPath }
}

export function verifyAuthorConfirmation(value: unknown, proposalId?: string): AuthorConfirmation {
  const confirmation = record(value, "confirmation")
  if (confirmation.confirmationVersion !== 1) throw new Error("confirmation.confirmationVersion must be 1")
  if (confirmation.decision !== "approve") throw new Error("confirmation.decision must be approve")
  const id = contentId(confirmation.proposalId, "confirmation.proposalId")
  if (proposalId !== undefined && id !== proposalId) throw new Error("confirmation is bound to a different proposal")
  const confirmedBy = singleLine(confirmation.confirmedBy, "confirmation.confirmedBy")
  const confirmedAt = text(confirmation.confirmedAt, "confirmation.confirmedAt")
  const timestamp = new Date(confirmedAt)
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.toISOString() !== confirmedAt) {
    throw new Error("confirmation.confirmedAt must be a normalized ISO timestamp")
  }
  return {
    confirmationVersion: 1,
    proposalId: id,
    decision: "approve",
    confirmedBy,
    confirmedAt,
  }
}

export function verifyCommitReceipt(value: unknown): CommitReceipt {
  const receipt = record(value, "receipt")
  if (receipt.receiptVersion !== 1) throw new Error("receipt.receiptVersion must be 1")
  if (receipt.status !== "committed") throw new Error("receipt.status must be committed")
  const id = contentId(receipt.id, "receipt.id")
  const proposalId = contentId(receipt.proposalId, "receipt.proposalId")
  const confirmation = verifyAuthorConfirmation(receipt.confirmation, proposalId)
  const baseCommit = text(receipt.baseCommit, "receipt.baseCommit")
  if (!commitPattern.test(baseCommit)) throw new Error("receipt.baseCommit must be a Git commit id")
  if (!Array.isArray(receipt.changes) || receipt.changes.length === 0) {
    throw new Error("receipt.changes must contain at least one change")
  }
  const targets = new Set<string>()
  const changes = receipt.changes.map((value, index) => {
    const change = record(value, `receipt.changes[${index}]`)
    const target = text(change.target, `receipt.changes[${index}].target`)
    if (targets.has(target)) throw new Error(`duplicate receipt target: ${target}`)
    targets.add(target)
    const path = repositoryRelativePath(change.path, `receipt.changes[${index}].path`)
    return {
      target,
      path,
      beforeSha256: contentId(change.beforeSha256, `receipt.changes[${index}].beforeSha256`),
      afterSha256: contentId(change.afterSha256, `receipt.changes[${index}].afterSha256`),
    }
  })
  const result = {
    receiptVersion: 1 as const,
    id,
    status: "committed" as const,
    proposalId,
    confirmation,
    baseCommit,
    changes,
  }
  const { id: _stored, ...payload } = result
  if (receiptContentId(payload) !== id) throw new Error("receipt content address does not match its payload")
  return result
}

export async function loadCommitReceipt(root: string, id: string) {
  const path = await commitReceiptPath(root, id, false)
  const receipt = verifyCommitReceipt(JSON.parse(await readFile(path, "utf8")))
  if (receipt.id !== id) throw new Error(`receipt content address does not match requested id: ${id}`)
  return receipt
}

export function receiptContentId(value: Omit<CommitReceipt, "id">): `sha256:${string}` {
  return digest(stableJson(value))
}

function createReceipt(
  workspace: WriterWorkspace,
  proposal: EditProposal,
  confirmation: AuthorConfirmation,
  baseCommit: string,
): CommitReceipt {
  const changes = proposal.edits
    .map((edit) => ({
      target: edit.target,
      path: passage(workspace, edit.target).path,
      beforeSha256: edit.beforeSha256,
      afterSha256: digest(edit.replacement),
    }))
    .sort((left, right) => left.target.localeCompare(right.target))
  const payload = {
    receiptVersion: 1 as const,
    status: "committed" as const,
    proposalId: proposal.id,
    confirmation,
    baseCommit,
    changes,
  }
  return { ...payload, id: receiptContentId(payload) }
}

function verifyFreshProposal(workspace: WriterWorkspace, proposal: EditProposal) {
  for (const binding of proposal.base) verifyBinding(workspace, binding.ref, binding.sha256)
  for (const edit of proposal.edits) verifyBinding(workspace, edit.target, edit.beforeSha256)
  for (const item of proposal.preservation) verifyBinding(workspace, item.ref, item.sha256)
}

function verifyBinding(workspace: WriterWorkspace, ref: string, expected: string) {
  const current = passage(workspace, ref)
  if (current.sha256 !== expected) {
    throw new Error(`stale proposal precondition for ${ref}: expected ${expected}, found ${current.sha256}`)
  }
}

function chapterUpdates(workspace: WriterWorkspace, proposal: EditProposal): ChapterUpdate[] {
  const edits = new Map<string, { start: number; end: number; replacement: string }[]>()
  for (const edit of proposal.edits) {
    const current = passage(workspace, edit.target)
    const list = edits.get(current.path) ?? []
    list.push({ start: current.textStart, end: current.textEnd, replacement: edit.replacement })
    edits.set(current.path, list)
  }
  return workspace.chapters.flatMap((chapter) => {
    const replacements = edits.get(chapter.path)
    if (!replacements) return []
    const after = replacements
      .sort((left, right) => right.start - left.start)
      .reduce(
        (source, replacement) =>
          `${source.slice(0, replacement.start)}${replacement.replacement}${source.slice(replacement.end)}`,
        chapter.source,
      )
    return [{ path: chapter.absolutePath, relativePath: chapter.path, before: chapter.source, after }]
  })
}

function verifyAppliedProposal(
  current: WriterWorkspace,
  previous: WriterWorkspace,
  proposal: EditProposal,
  updates: ChapterUpdate[],
) {
  const expected = new Map(proposal.edits.map((edit) => [edit.target, digest(edit.replacement)]))
  if (current.passages.size !== previous.passages.size) throw new Error("proposal changed the workspace passage set")
  for (const [ref, before] of previous.passages) {
    const after = passage(current, ref)
    const replacement = expected.get(ref)
    if (replacement !== undefined && after.sha256 !== replacement) {
      throw new Error(`proposal replacement did not apply exactly for ${ref}`)
    }
    if (replacement === undefined && after.sha256 !== before.sha256) {
      throw new Error(`proposal changed an unapproved passage: ${ref}`)
    }
  }
  for (const item of proposal.preservation) {
    const currentText = passage(current, item.ref).text
    if (!item.literals.every((literal) => currentText.includes(literal))) {
      throw new Error(`proposal failed a preservation requirement for ${item.ref}`)
    }
  }
  for (const update of updates) {
    const chapter = current.chapters.find((item) => item.path === update.relativePath)
    if (chapter?.source !== update.after) throw new Error(`proposal changed unexpected bytes in ${update.relativePath}`)
  }
}

async function rejectCommittedProposal(root: string, commit: string, proposalId: string, executable: string) {
  const output = await runGit(
    root,
    ["ls-tree", "-r", "--name-only", "-z", commit, "--", ".novel-agent/receipts"],
    executable,
  )
  for (const path of paths(output.stdout)) {
    if (!/^\.novel-agent\/receipts\/[a-f0-9]{64}\.json$/.test(path)) continue
    const stored = await runGit(root, ["show", `${commit}:${path}`], executable)
    const receipt = verifyCommitReceipt(JSON.parse(stored.stdout))
    if (receipt.proposalId === proposalId) throw new Error(`proposal was already committed with receipt ${receipt.id}`)
  }
}

async function verifyStagedScope(root: string, expected: string[], executable: string) {
  const staged = paths((await runGit(root, ["diff", "--cached", "--name-only", "-z"], executable)).stdout).sort()
  if (!equalPaths(staged, expected)) throw new Error("Git staged files outside the approved proposal scope")
  if ((await runGit(root, ["diff", "--name-only", "-z"], executable)).stdout) {
    throw new Error("writer workspace changed while the proposal was being staged")
  }
  if ((await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], executable)).stdout) {
    throw new Error("untracked files appeared while the proposal was being staged")
  }
}

async function verifyCreatedCommit(
  root: string,
  commit: string,
  expected: string[],
  receiptPath: string,
  receipt: CommitReceipt,
  blobs: Map<string, string>,
  executable: string,
) {
  const changed = paths(
    (await runGit(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit], executable)).stdout,
  ).sort()
  if (!equalPaths(changed, expected))
    throw new Error("created Git commit contains files outside the approved proposal scope")
  if ((await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable)).stdout) {
    throw new Error(`proposal commit ${commit} was created but the writer workspace is not clean`)
  }
  const stored = verifyCommitReceipt(
    JSON.parse((await runGit(root, ["show", `${commit}:${receiptPath}`], executable)).stdout),
  )
  if (stored.id !== receipt.id) throw new Error("created Git commit contains a different receipt")
  for (const [path, blob] of blobs) {
    const stored = (await runGit(root, ["rev-parse", `${commit}:${path}`], executable)).stdout.trim()
    if (stored !== blob) throw new Error(`created Git commit contains a different staged blob for ${path}`)
  }
}

async function stagedBlobIds(root: string, paths: string[], executable: string) {
  const entries = await Promise.all(
    paths.map(
      async (path) => [path, (await runGit(root, ["rev-parse", `:${path}`], executable)).stdout.trim()] as const,
    ),
  )
  return new Map(entries)
}

async function rollback(
  root: string,
  updates: ChapterUpdate[],
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
  for (const update of updates)
    await atomicWrite(update.path, update.before).catch((error) => failures.push(message(error)))
  if (receiptCreated) await rm(receiptPath, { force: true }).catch((error) => failures.push(message(error)))
  const status = await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], executable).catch(
    (error) => {
      failures.push(message(error))
      return undefined
    },
  )
  if (status && status.stdout !== initialStatus)
    failures.push("writer workspace did not return to its original Git state")
  if (failures.length > 0) throw new Error(`proposal rollback failed: ${failures.join("; ")}`)
}

async function atomicWrite(path: string, value: string) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, value, { flag: "wx", mode: (await stat(path)).mode })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
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

async function commitReceiptPath(root: string, id: string, create: boolean) {
  contentId(id, "receipt id")
  const workspaceRoot = await realpath(resolve(root))
  const lexical = resolve(workspaceRoot, ".novel-agent", "receipts")
  if (create) await mkdir(lexical, { recursive: true })
  const directory = await realpath(lexical)
  ensureContained(workspaceRoot, directory)
  const path = resolve(directory, `${id.slice("sha256:".length)}.json`)
  ensureContained(directory, path)
  if (!create) {
    const result = await realpath(path)
    ensureContained(directory, result)
    return result
  }
  return path
}

function commitMessage(proposal: EditProposal, receipt: CommitReceipt, value?: string) {
  const subject = value === undefined ? "Apply approved novel revision" : singleLine(value, "commit message")
  return `${subject}\n\nProposal-ID: ${proposal.id}\nReceipt-ID: ${receipt.id}\nConfirmed-By: ${receipt.confirmation.confirmedBy}`
}

function repositoryPath(root: string, path: string) {
  const result = relative(root, path).replaceAll("\\", "/")
  return repositoryRelativePath(result, "repository path")
}

function repositoryRelativePath(value: unknown, label: string) {
  const result = text(value, label)
  if (
    isAbsolute(result) ||
    result.includes(":") ||
    result.includes("\\") ||
    /[\0\r\n]/.test(result) ||
    result.split("/").some((part) => part === "." || part === ".." || !part)
  ) {
    throw new Error(`${label} must be a normalized relative path`)
  }
  return result
}

function ensureContained(root: string, candidate: string) {
  const inside = relative(root, candidate)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside)) {
    throw new Error(`receipt path escapes the writer workspace: ${candidate}`)
  }
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

function runGit(root: string, args: string[], executable: string, input = "") {
  return new Promise<GitOutput>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
    const stdout: string[] = []
    const stderr: string[] = []
    child.stdout.setEncoding("utf8").on("data", (value: string) => stdout.push(value))
    child.stderr.setEncoding("utf8").on("data", (value: string) => stderr.push(value))
    child.on("error", reject)
    child.on("close", (code) => {
      const result = { stdout: stdout.join(""), stderr: stderr.join("") }
      if (code === 0) return resolve(result)
      reject(new Error(`git ${args[0] ?? "command"} failed: ${result.stderr.trim() || `exit ${code}`}`))
    })
    child.stdin.end(input)
  })
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function contentId(value: unknown, label: string): `sha256:${string}` {
  const result = text(value, label)
  if (!isContentId(result)) throw new Error(`${label} must be a SHA-256 content address`)
  return result
}

function isContentId(value: string): value is `sha256:${string}` {
  return contentIdPattern.test(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return Object.fromEntries(Object.entries(value))
}

function singleLine(value: unknown, label: string) {
  const result = text(value, label)
  if (result.includes("\n") || result.includes("\r") || result.includes("\0")) {
    throw new Error(`${label} must be a single line`)
  }
  return result
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function message(value: unknown) {
  return value instanceof Error ? value.message : String(value)
}
