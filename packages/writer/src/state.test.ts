import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  initializeStoryState,
  loadStoryState,
  parseStoryState,
  storyRecord,
  storyStateDigest,
  validateStoryState,
  type StoryState,
} from "./state.ts"
import { loadWriterWorkspace } from "./workspace.ts"

test("loads absent story state as a deterministic empty store", async () => {
  const root = await fixture()
  const first = await loadStoryState(root)
  const second = await loadStoryState(root)

  assert.equal(first.exists, false)
  assert.deepEqual(first.state, { formatVersion: 1, records: [] })
  assert.equal(first.sha256, second.sha256)
  assert.equal(first.sha256, storyStateDigest(first.state))
})

test("initializes the fixed Git-friendly story state path without overwriting it", async () => {
  const root = await fixture()
  const initialized = await initializeStoryState(root)

  assert.equal(initialized.exists, true)
  assert.equal(initialized.path, join(await realpath(root), ".novel-agent", "story-state.json"))
  assert.deepEqual(JSON.parse(await readFile(initialized.path, "utf8")), initialized.state)

  await writeFile(initialized.path, JSON.stringify(validState()))
  const existing = await initializeStoryState(root)
  assert.equal(existing.state.records.length, 7)
})

test("validates typed facts, events, knowledge, and relationships against manuscript evidence", async () => {
  const root = await fixture()
  const workspace = await loadWriterWorkspace(root)
  const state = parseStoryState(validState())

  assert.equal(validateStoryState(workspace, state), state)
  assert.equal(storyRecord(state, "knowledge:mara-knows-door")?.kind, "knowledge")
  assert.deepEqual(
    state.records.map((record) => record.id),
    [...state.records.map((record) => record.id)].sort(),
  )
})

test("rejects malformed and duplicate record identities", () => {
  const state = validState()
  state.records.push(structuredClone(state.records[0]!))
  assert.throws(() => parseStoryState(state), /duplicate record IDs/)

  const mismatch = validState()
  ;(mismatch.records[0] as { id: string }).id = "fact:mara"
  assert.throws(() => parseStoryState(mismatch), /id does not match its kind/)
})

test("rejects missing evidence and invalid cross-record references", async () => {
  const workspace = await loadWriterWorkspace(await fixture())

  const missingEvidence = parseStoryState(validState())
  missingEvidence.records[0]!.evidence = ["ch01:missing"]
  assert.throws(() => validateStoryState(workspace, missingEvidence), /cites missing passages/)

  const missingEntity = parseStoryState(validState())
  const fact = missingEntity.records.find((record) => record.kind === "fact")!
  fact.subject = "entity:missing"
  assert.throws(() => validateStoryState(workspace, missingEntity), /cites missing entity/)

  const missingCause = parseStoryState(validState())
  const event = missingCause.records.find((record) => record.kind === "event")!
  event.causes = ["event:missing"]
  assert.throws(() => validateStoryState(workspace, missingCause), /cites missing causes/)
})

test("requires character knowledge and valid temporal anchors", async () => {
  const workspace = await loadWriterWorkspace(await fixture())
  const wrongOwner = parseStoryState(validState())
  const knowledge = wrongOwner.records.find((record) => record.kind === "knowledge")!
  knowledge.character = "entity:door"
  assert.throws(() => validateStoryState(workspace, wrongOwner), /knowledge owner is not a character/)

  const unknownAnchor = parseStoryState(validState())
  const relationship = unknownAnchor.records.find((record) => record.kind === "relationship")!
  relationship.atRef = "ch02:missing"
  assert.throws(() => validateStoryState(workspace, unknownAnchor), /unknown atRef/)
})

function validState(): StoryState {
  return {
    formatVersion: 1,
    records: [
      {
        kind: "entity",
        id: "entity:mara",
        entityType: "character",
        name: "Mara Venn",
        aliases: ["Mara"],
        evidence: ["ch01:p001"],
      },
      {
        kind: "entity",
        id: "entity:door",
        entityType: "object",
        name: "The sealed door",
        aliases: [],
        evidence: ["ch01:p002"],
      },
      {
        kind: "entity",
        id: "entity:orin",
        entityType: "character",
        name: "Orin",
        aliases: [],
        evidence: ["ch02:p001"],
      },
      {
        kind: "fact",
        id: "fact:door-locked",
        subject: "entity:door",
        predicate: "is locked",
        value: true,
        certainty: "asserted",
        evidence: ["ch01:p002"],
      },
      {
        kind: "event",
        id: "event:mara-tests-door",
        summary: "Mara tests the sealed door and finds it locked.",
        atRef: "ch01:p002",
        participants: ["entity:mara", "entity:door"],
        causes: ["fact:door-locked"],
        evidence: ["ch01:p002"],
      },
      {
        kind: "knowledge",
        id: "knowledge:mara-knows-door",
        character: "entity:mara",
        claim: "The sealed door is locked.",
        state: "knows",
        afterRef: "ch01:p002",
        evidence: ["ch01:p002"],
      },
      {
        kind: "relationship",
        id: "relationship:mara-distrusts-orin",
        from: "entity:mara",
        to: "entity:orin",
        relation: "trust",
        state: "distrusts",
        atRef: "ch02:p001",
        evidence: ["ch02:p001"],
      },
    ],
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "writer-state-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    JSON.stringify({
      formatVersion: 1,
      title: "Fixture",
      chapters: [
        { id: "ch01", path: "manuscript/ch01.md" },
        { id: "ch02", path: "manuscript/ch02.md" },
      ],
    }),
  )
  await writeFile(
    join(root, "manuscript", "ch01.md"),
    `<!-- novel-agent:passage ch01:p001 -->\nMara entered alone.\n\n<!-- novel-agent:passage ch01:p002 -->\nThe sealed door would not move.\n`,
  )
  await writeFile(
    join(root, "manuscript", "ch02.md"),
    `<!-- novel-agent:passage ch02:p001 -->\nOrin's explanation made Mara trust him less.\n`,
  )
  return root
}
