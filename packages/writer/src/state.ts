import { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { digest, loadWriterWorkspace, type WriterWorkspace } from "./workspace.ts"

export const storyStateFormatVersion = 1 as const

export type StoryEntityID = `entity:${string}`
export type StoryRecordID = `${"entity" | "fact" | "event" | "knowledge" | "relationship"}:${string}`
export type StoryValue = string | number | boolean | null

type StoryRecordBase = {
  id: StoryRecordID
  evidence: string[]
}

export type StoryEntity = StoryRecordBase & {
  kind: "entity"
  id: StoryEntityID
  entityType: "character" | "object" | "location" | "organization" | "concept"
  name: string
  aliases: string[]
}

export type StoryFact = StoryRecordBase & {
  kind: "fact"
  id: `fact:${string}`
  subject: StoryEntityID
  predicate: string
  value: StoryValue
  certainty: "asserted" | "world_rule" | "inferred" | "uncertain"
}

export type StoryEvent = StoryRecordBase & {
  kind: "event"
  id: `event:${string}`
  summary: string
  atRef: string
  participants: StoryEntityID[]
  causes: StoryRecordID[]
}

export type StoryKnowledge = StoryRecordBase & {
  kind: "knowledge"
  id: `knowledge:${string}`
  character: StoryEntityID
  claim: string
  state: "knows" | "believes" | "suspects" | "does_not_know" | "uncertain"
  afterRef: string
}

export type StoryRelationship = StoryRecordBase & {
  kind: "relationship"
  id: `relationship:${string}`
  from: StoryEntityID
  to: StoryEntityID
  relation: string
  state: string
  atRef: string
}

export type StoryRecord = StoryEntity | StoryFact | StoryEvent | StoryKnowledge | StoryRelationship

export type StoryState = {
  formatVersion: typeof storyStateFormatVersion
  records: StoryRecord[]
}

export type LoadedStoryState = {
  state: StoryState
  sha256: `sha256:${string}`
  path: string
  exists: boolean
}

const recordIdPattern = /^(entity|fact|event|knowledge|relationship):[a-z0-9][a-z0-9_-]*$/
const stateDirectory = ".novel-agent"
const stateFile = "story-state.json"

export async function loadStoryState(root: string): Promise<LoadedStoryState> {
  const workspace = await loadWriterWorkspace(root)
  const path = await resolveStoryStatePath(workspace.root, false)
  const source = await readFile(path, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return undefined
    throw error
  })
  const state =
    source === undefined ? { formatVersion: storyStateFormatVersion, records: [] } : parseStoryState(JSON.parse(source))
  validateStoryState(workspace, state)
  return { state, sha256: storyStateDigest(state), path, exists: source !== undefined }
}

export async function initializeStoryState(root: string): Promise<LoadedStoryState> {
  const workspace = await loadWriterWorkspace(root)
  const path = await resolveStoryStatePath(workspace.root, true)
  const state = { formatVersion: storyStateFormatVersion, records: [] } satisfies StoryState
  try {
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" })
  } catch (error) {
    if (!isExists(error)) throw error
  }
  return loadStoryState(workspace.root)
}

export function parseStoryState(value: unknown): StoryState {
  const input = record(value, "story state")
  if (input.formatVersion !== storyStateFormatVersion) {
    throw new Error(`story state formatVersion must be ${storyStateFormatVersion}`)
  }
  if (!Array.isArray(input.records)) throw new Error("story state records must be an array")
  const records = input.records.map((value, index) => parseStoryRecord(value, `story state records[${index}]`))
  const ids = records.map((record) => record.id)
  if (new Set(ids).size !== ids.length) throw new Error("story state contains duplicate record IDs")
  return {
    formatVersion: storyStateFormatVersion,
    records: records.toSorted((left, right) => left.id.localeCompare(right.id)),
  }
}

export function validateStoryState(workspace: WriterWorkspace, state: StoryState) {
  const ids = new Set(state.records.map((record) => record.id))
  const entities = new Map(
    state.records
      .filter((record): record is StoryEntity => record.kind === "entity")
      .map((record) => [record.id, record]),
  )
  state.records.forEach((record) => {
    const missingEvidence = record.evidence.filter((ref) => !workspace.passages.has(ref))
    if (missingEvidence.length) throw new Error(`${record.id} cites missing passages: ${missingEvidence.join(", ")}`)
    if (record.kind === "fact") requireEntity(entities, record.subject, record.id)
    if (record.kind === "event") {
      if (!workspace.passages.has(record.atRef)) throw new Error(`${record.id} has an unknown atRef: ${record.atRef}`)
      record.participants.forEach((entity) => requireEntity(entities, entity, record.id))
      const missingCauses = record.causes.filter((id) => !ids.has(id))
      if (missingCauses.length) throw new Error(`${record.id} cites missing causes: ${missingCauses.join(", ")}`)
    }
    if (record.kind === "knowledge") {
      const character = requireEntity(entities, record.character, record.id)
      if (character.entityType !== "character") throw new Error(`${record.id} knowledge owner is not a character`)
      if (!workspace.passages.has(record.afterRef))
        throw new Error(`${record.id} has an unknown afterRef: ${record.afterRef}`)
    }
    if (record.kind === "relationship") {
      requireEntity(entities, record.from, record.id)
      requireEntity(entities, record.to, record.id)
      if (!workspace.passages.has(record.atRef)) throw new Error(`${record.id} has an unknown atRef: ${record.atRef}`)
    }
  })
  return state
}

export function storyStateDigest(state: StoryState): `sha256:${string}` {
  return digest(stableJson(parseStoryState(state)))
}

export function storyRecord(state: StoryState, id: string) {
  return state.records.find((record) => record.id === id)
}

async function resolveStoryStatePath(root: string, create: boolean) {
  const workspaceRoot = await realpath(resolve(root))
  const lexicalDirectory = resolve(workspaceRoot, stateDirectory)
  if (create) await mkdir(lexicalDirectory, { recursive: true })
  const directory = await realpath(lexicalDirectory).catch((error: unknown) => {
    if (!isMissing(error) || create) throw error
    return lexicalDirectory
  })
  ensureContained(workspaceRoot, directory)
  const lexical = resolve(directory, stateFile)
  const path = await realpath(lexical).catch((error: unknown) => {
    if (!isMissing(error)) throw error
    return lexical
  })
  ensureContained(directory, path)
  return path
}

function parseStoryRecord(value: unknown, label: string): StoryRecord {
  const input = record(value, label)
  const kind = text(input.kind, `${label}.kind`)
  if (!["entity", "fact", "event", "knowledge", "relationship"].includes(kind)) {
    throw new Error(`${label}.kind is unsupported: ${kind}`)
  }
  const id = text(input.id, `${label}.id`)
  if (!recordIdPattern.test(id) || !id.startsWith(`${kind}:`)) throw new Error(`${label}.id does not match its kind`)
  const evidence = strings(input.evidence, `${label}.evidence`, true)
  const base = { id, kind, evidence }
  if (kind === "entity") {
    const entityType = text(input.entityType, `${label}.entityType`)
    if (!["character", "object", "location", "organization", "concept"].includes(entityType)) {
      throw new Error(`${label}.entityType is unsupported: ${entityType}`)
    }
    return {
      ...base,
      kind,
      id: id as StoryEntityID,
      entityType: entityType as StoryEntity["entityType"],
      name: text(input.name, `${label}.name`),
      aliases: strings(input.aliases, `${label}.aliases`),
    }
  }
  if (kind === "fact") {
    const certainty = text(input.certainty, `${label}.certainty`)
    if (!["asserted", "world_rule", "inferred", "uncertain"].includes(certainty)) {
      throw new Error(`${label}.certainty is unsupported: ${certainty}`)
    }
    const factValue = input.value
    if (factValue !== null && !["string", "number", "boolean"].includes(typeof factValue)) {
      throw new Error(`${label}.value must be a string, number, boolean, or null`)
    }
    return {
      ...base,
      kind,
      id: id as StoryFact["id"],
      subject: entityId(input.subject, `${label}.subject`),
      predicate: text(input.predicate, `${label}.predicate`),
      value: factValue as StoryValue,
      certainty: certainty as StoryFact["certainty"],
    }
  }
  if (kind === "event") {
    return {
      ...base,
      kind,
      id: id as StoryEvent["id"],
      summary: text(input.summary, `${label}.summary`),
      atRef: text(input.atRef, `${label}.atRef`),
      participants: strings(input.participants, `${label}.participants`).map((id) =>
        entityId(id, `${label}.participants`),
      ),
      causes: strings(input.causes, `${label}.causes`).map((id) => storyRecordId(id, `${label}.causes`)),
    }
  }
  if (kind === "knowledge") {
    const state = text(input.state, `${label}.state`)
    if (!["knows", "believes", "suspects", "does_not_know", "uncertain"].includes(state)) {
      throw new Error(`${label}.state is unsupported: ${state}`)
    }
    return {
      ...base,
      kind,
      id: id as StoryKnowledge["id"],
      character: entityId(input.character, `${label}.character`),
      claim: text(input.claim, `${label}.claim`),
      state: state as StoryKnowledge["state"],
      afterRef: text(input.afterRef, `${label}.afterRef`),
    }
  }
  return {
    ...base,
    kind: "relationship",
    id: id as StoryRelationship["id"],
    from: entityId(input.from, `${label}.from`),
    to: entityId(input.to, `${label}.to`),
    relation: text(input.relation, `${label}.relation`),
    state: text(input.state, `${label}.state`),
    atRef: text(input.atRef, `${label}.atRef`),
  }
}

function requireEntity(entities: Map<StoryEntityID, StoryEntity>, id: StoryEntityID, owner: StoryRecordID) {
  const entity = entities.get(id)
  if (!entity) throw new Error(`${owner} cites missing entity: ${id}`)
  return entity
}

function storyRecordId(value: unknown, label: string): StoryRecordID {
  const id = text(value, label)
  if (!recordIdPattern.test(id)) throw new Error(`${label} must be a story record ID`)
  return id as StoryRecordID
}

function entityId(value: unknown, label: string): StoryEntityID {
  const id = storyRecordId(value, label)
  if (!id.startsWith("entity:")) throw new Error(`${label} must be an entity ID`)
  return id as StoryEntityID
}

function strings(value: unknown, label: string, required = false) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
  const result = value.map((item) => item.trim())
  if (required && !result.length) throw new Error(`${label} must contain at least one item`)
  if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates`)
  return result
}

function record(value: unknown, label: string): Record<string, unknown> {
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

function ensureContained(root: string, result: string) {
  const inside = relative(root, result)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside)) {
    throw new Error("story-state path escapes the writer workspace")
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT"
}

function isExists(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error && error.code === "EEXIST"
}
