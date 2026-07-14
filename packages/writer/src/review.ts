import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { type EditProposal, verifyEditProposal } from "./proposal.ts"
import { passage, type WriterWorkspace } from "./workspace.ts"

const proposalIdPattern = /^sha256:[a-f0-9]{64}$/

export async function saveEditProposal(root: string, value: EditProposal) {
  const proposal = verifyEditProposal(value)
  if (!proposal.validation.valid) throw new Error("cannot persist an invalid edit proposal")
  const directory = await proposalDirectory(root, true)
  const path = resolve(directory, proposalFileName(proposal.id))
  const serialized = `${JSON.stringify(proposal, null, 2)}\n`

  try {
    const existingPath = await realpath(path)
    ensureContained(directory, existingPath)
    const existing = verifyEditProposal(JSON.parse(await readFile(existingPath, "utf8")))
    if (existing.id !== proposal.id) throw new Error(`proposal path contains a different content address: ${path}`)
    return path
  } catch (error) {
    if (!isMissing(error)) throw error
  }

  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, serialized, { flag: "wx" })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
  return path
}

export async function loadEditProposal(root: string, id: string) {
  if (!proposalIdPattern.test(id)) throw new Error("proposal id must be a SHA-256 content address")
  const directory = await proposalDirectory(root, false)
  const lexical = resolve(directory, proposalFileName(id))
  const path = await realpath(lexical)
  ensureContained(directory, path)
  const proposal = verifyEditProposal(JSON.parse(await readFile(path, "utf8")))
  if (proposal.id !== id) throw new Error(`proposal content address does not match requested id: ${id}`)
  return proposal
}

export function renderProposalDiff(workspace: WriterWorkspace, value: EditProposal) {
  const proposal = verifyEditProposal(value)
  if (!proposal.validation.valid) throw new Error("cannot render an invalid edit proposal")
  const output = [`Proposal ${proposal.id}`, `Request: ${proposal.request}`, ""]
  for (const edit of proposal.edits) {
    const current = passage(workspace, edit.target)
    if (current.sha256 !== edit.beforeSha256) {
      throw new Error(
        `stale proposal precondition for ${edit.target}: expected ${edit.beforeSha256}, found ${current.sha256}`,
      )
    }
    output.push(
      `diff --novel a/${current.path} b/${current.path}`,
      `--- ${edit.target} ${edit.beforeSha256}`,
      `+++ ${edit.target} proposed`,
      `@@ ${edit.target} @@`,
      ...lines(current.text).map((line) => `-${line}`),
      ...lines(edit.replacement).map((line) => `+${line}`),
      "",
    )
  }
  return output.join("\n")
}

function proposalFileName(id: string) {
  return `${id.slice("sha256:".length)}.json`
}

async function proposalDirectory(root: string, create: boolean) {
  const workspaceRoot = await realpath(resolve(root))
  const lexical = resolve(workspaceRoot, ".novel-agent", "proposals")
  if (create) await mkdir(lexical, { recursive: true })
  const directory = await realpath(lexical)
  ensureContained(workspaceRoot, directory)
  return directory
}

function ensureContained(root: string, candidate: string) {
  const inside = relative(root, candidate)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside)) {
    throw new Error(`proposal path escapes the writer workspace: ${candidate}`)
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function lines(value: string) {
  return value.replaceAll("\r\n", "\n").split("\n")
}
