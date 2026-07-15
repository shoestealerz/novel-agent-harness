import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { claimsAppliedAuthority } from "./authority.ts"
import {
  parseStoryState,
  storyStateDigest,
  validateStoryState,
  type StoryRecord,
  type StoryRecordID,
  type StoryState,
} from "./state.ts"
import { digest, type WriterWorkspace } from "./workspace.ts"

export type StoryStateTask = {
  request: string
  authority: "read" | "propose"
}

export type StoryStateDraft = {
  text: string
  upserts?: unknown[]
  removals?: string[]
}

export type StoryStateProposal = {
  proposalVersion: 1
  id: `sha256:${string}`
  status: "proposed"
  request: string
  baseSha256: `sha256:${string}`
  upserts: StoryRecord[]
  removals: StoryRecordID[]
  validation: {
    valid: boolean
    checks: {
      authority: boolean
      references: boolean
      conflicts: boolean
      changed: boolean
      uncommitted: boolean
    }
  }
}

const proposalIdPattern = /^sha256:[a-f0-9]{64}$/
const recordIdPattern = /^(entity|fact|event|knowledge|relationship):[a-z0-9][a-z0-9_-]*$/

export function sealStoryStateProposal(
  workspace: WriterWorkspace,
  current: StoryState,
  task: StoryStateTask,
  draft: StoryStateDraft,
): StoryStateProposal {
  validateStoryState(workspace, current)
  const upserts = (draft.upserts ?? [])
    .map((value, index) => {
      try {
        return parseStoryState({ formatVersion: 1, records: [value] }).records[0]!
      } catch (error) {
        throw new Error(`invalid story-state upsert[${index}]: ${message(error)}`)
      }
    })
    .toSorted((left, right) => left.id.localeCompare(right.id))
  const removals = (draft.removals ?? []).map((id, index) => storyRecordId(id, `removals[${index}]`)).toSorted()
  const upsertIds = upserts.map((record) => record.id)
  const conflicts =
    new Set(upsertIds).size === upsertIds.length &&
    new Set(removals).size === removals.length &&
    !upsertIds.some((id) => removals.includes(id)) &&
    removals.every((id) => current.records.some((record) => record.id === id))
  const prospective = mergeStoryState(current, upserts, removals)
  let references = true
  try {
    validateStoryState(workspace, prospective)
  } catch {
    references = false
  }
  const claimedCommit = claimsAppliedAuthority(draft.text)
  const checks = {
    authority: task.authority === "propose",
    references,
    conflicts,
    changed: upserts.length + removals.length > 0 && storyStateDigest(prospective) !== storyStateDigest(current),
    uncommitted: !claimedCommit,
  }
  const payload = {
    proposalVersion: 1 as const,
    status: "proposed" as const,
    request: task.request,
    baseSha256: storyStateDigest(current),
    upserts,
    removals,
    validation: { valid: Object.values(checks).every(Boolean), checks },
  }
  return { ...payload, id: storyStateProposalContentId(payload) }
}

export function verifyStoryStateProposal(value: unknown): StoryStateProposal {
  const input = object(value, "story-state proposal")
  if (input.proposalVersion !== 1) throw new Error("story-state proposal.proposalVersion must be 1")
  if (input.status !== "proposed") throw new Error("story-state proposal.status must be proposed")
  const id = text(input.id, "story-state proposal.id")
  if (!proposalIdPattern.test(id)) throw new Error("story-state proposal.id must be a SHA-256 content address")
  const request = text(input.request, "story-state proposal.request")
  const baseSha256 = sha(input.baseSha256, "story-state proposal.baseSha256")
  if (!Array.isArray(input.upserts)) throw new Error("story-state proposal.upserts must be an array")
  const upserts = parseStoryState({ formatVersion: 1, records: input.upserts }).records
  if (!Array.isArray(input.removals)) throw new Error("story-state proposal.removals must be an array")
  const removals = input.removals.map((item, index) => storyRecordId(item, `story-state proposal.removals[${index}]`))
  const validation = object(input.validation, "story-state proposal.validation")
  const rawChecks = object(validation.checks, "story-state proposal.validation.checks")
  const names = ["authority", "references", "conflicts", "changed", "uncommitted"] as const
  const checks = Object.fromEntries(
    names.map((name) => {
      if (typeof rawChecks[name] !== "boolean") {
        throw new Error(`story-state proposal.validation.checks.${name} must be boolean`)
      }
      return [name, rawChecks[name]]
    }),
  ) as StoryStateProposal["validation"]["checks"]
  const valid = names.every((name) => checks[name])
  if (validation.valid !== valid) throw new Error("story-state proposal.validation.valid does not match its checks")
  const payload = {
    proposalVersion: 1 as const,
    status: "proposed" as const,
    request,
    baseSha256,
    upserts,
    removals,
    validation: { valid, checks },
  }
  if (storyStateProposalContentId(payload) !== id) {
    throw new Error("story-state proposal content address does not match its payload")
  }
  return { ...payload, id: id as `sha256:${string}` }
}

export function proposedStoryState(current: StoryState, value: StoryStateProposal) {
  const proposal = verifyStoryStateProposal(value)
  if (!proposal.validation.valid) throw new Error("cannot materialize an invalid story-state proposal")
  const currentSha = storyStateDigest(current)
  if (currentSha !== proposal.baseSha256) {
    throw new Error(`stale story-state proposal: expected ${proposal.baseSha256}, found ${currentSha}`)
  }
  return mergeStoryState(current, proposal.upserts, proposal.removals)
}

export async function saveStoryStateProposal(root: string, value: StoryStateProposal) {
  const proposal = verifyStoryStateProposal(value)
  if (!proposal.validation.valid) throw new Error("cannot persist an invalid story-state proposal")
  const directory = await proposalDirectory(root, true)
  const path = resolve(directory, proposalFileName(proposal.id))
  const serialized = `${JSON.stringify(proposal, null, 2)}\n`
  try {
    const existingPath = await realpath(path)
    ensureContained(directory, existingPath)
    const existing = verifyStoryStateProposal(JSON.parse(await readFile(existingPath, "utf8")))
    if (existing.id !== proposal.id) throw new Error(`story-state proposal path contains another address: ${path}`)
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

export async function loadStoryStateProposal(root: string, id: string) {
  const path = await storyStateProposalPath(root, id)
  const proposal = verifyStoryStateProposal(JSON.parse(await readFile(path, "utf8")))
  if (proposal.id !== id) throw new Error(`story-state proposal content address does not match requested id: ${id}`)
  return proposal
}

export async function storyStateProposalPath(root: string, id: string) {
  if (!proposalIdPattern.test(id)) throw new Error("story-state proposal id must be a SHA-256 content address")
  const directory = await proposalDirectory(root, false)
  const lexical = resolve(directory, proposalFileName(id))
  const path = await realpath(lexical)
  ensureContained(directory, path)
  return path
}

export function renderStoryStateDiff(current: StoryState, value: StoryStateProposal) {
  const proposal = verifyStoryStateProposal(value)
  const next = proposedStoryState(current, proposal)
  const before = new Map(current.records.map((record) => [record.id, record]))
  const after = new Map(next.records.map((record) => [record.id, record]))
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
  const output = [
    `Story-state proposal ${proposal.id}`,
    `Request: ${proposal.request}`,
    `Base: ${proposal.baseSha256}`,
    "",
  ]
  for (const id of ids) {
    const left = before.get(id)
    const right = after.get(id)
    if (stableJson(left) === stableJson(right)) continue
    output.push(`@@ ${id} @@`)
    if (left)
      output.push(
        ...JSON.stringify(left, null, 2)
          .split("\n")
          .map((line) => `-${line}`),
      )
    if (right)
      output.push(
        ...JSON.stringify(right, null, 2)
          .split("\n")
          .map((line) => `+${line}`),
      )
    output.push("")
  }
  return output.join("\n")
}

export function storyStateProposalContentId(value: Omit<StoryStateProposal, "id">): `sha256:${string}` {
  return digest(stableJson(value))
}

function mergeStoryState(current: StoryState, upserts: StoryRecord[], removals: StoryRecordID[]) {
  const records = new Map(current.records.map((record) => [record.id, record]))
  removals.forEach((id) => records.delete(id))
  upserts.forEach((record) => records.set(record.id, record))
  return parseStoryState({ formatVersion: 1, records: [...records.values()] })
}

function proposalFileName(id: string) {
  return `${id.slice("sha256:".length)}.json`
}

async function proposalDirectory(root: string, create: boolean) {
  const workspaceRoot = await realpath(resolve(root))
  const lexical = resolve(workspaceRoot, ".novel-agent", "state-proposals")
  if (create) await mkdir(lexical, { recursive: true })
  const directory = await realpath(lexical)
  ensureContained(workspaceRoot, directory)
  return directory
}

function ensureContained(root: string, candidate: string) {
  const inside = relative(root, candidate)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside)) {
    throw new Error(`story-state proposal path escapes the writer workspace: ${candidate}`)
  }
}

function storyRecordId(value: unknown, label: string) {
  const id = text(value, label)
  if (!recordIdPattern.test(id)) throw new Error(`${label} must be a story record ID`)
  return id as StoryRecordID
}

function sha(value: unknown, label: string) {
  const result = text(value, label)
  if (!proposalIdPattern.test(result)) throw new Error(`${label} must be a SHA-256 hash`)
  return result as `sha256:${string}`
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
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

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
