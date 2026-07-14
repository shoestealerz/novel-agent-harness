import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  loadStoryStateProposal,
  proposedStoryState,
  renderStoryStateDiff,
  saveStoryStateProposal,
  sealStoryStateProposal,
  verifyStoryStateProposal,
} from "./state-proposal.ts"
import { parseStoryState, type StoryRecord, type StoryState } from "./state.ts"
import { loadWriterWorkspace } from "./workspace.ts"

test("seals, persists, and renders an immutable evidence-linked state proposal", async () => {
  const root = await fixture()
  const workspace = await loadWriterWorkspace(root)
  const current = baseState()
  const proposal = sealStoryStateProposal(
    workspace,
    current,
    { request: "Record what Mara learned at the door", authority: "propose" },
    {
      text: "I propose recording this knowledge.",
      upserts: [knowledge()],
    },
  )

  assert.equal(proposal.validation.valid, true)
  assert.match(proposal.id, /^sha256:[a-f0-9]{64}$/)
  const path = await saveStoryStateProposal(root, proposal)
  assert.match(path, /[\\/]\.novel-agent[\\/]state-proposals[\\/][a-f0-9]{64}\.json$/)
  assert.deepEqual(await loadStoryStateProposal(root, proposal.id), proposal)
  assert.equal(proposedStoryState(current, proposal).records.length, 4)
  const diff = renderStoryStateDiff(current, proposal)
  assert.match(diff, /@@ knowledge:mara-knows-door @@/)
  assert.match(diff, /\+  "claim": "The sealed door is locked\."/)
})

test("rejects reference-breaking, conflicting, no-op, and read-only proposals", async () => {
  const workspace = await loadWriterWorkspace(await fixture())
  const current = baseState()

  const missingEvidence = sealStoryStateProposal(
    workspace,
    current,
    { request: "Invent unsupported state", authority: "propose" },
    { text: "Proposed.", upserts: [{ ...knowledge(), evidence: ["ch01:missing"] }] },
  )
  assert.equal(missingEvidence.validation.checks.references, false)
  assert.equal(missingEvidence.validation.valid, false)

  const conflict = sealStoryStateProposal(
    workspace,
    current,
    { request: "Conflict", authority: "propose" },
    { text: "Proposed.", upserts: [knowledge()], removals: ["knowledge:mara-knows-door"] },
  )
  assert.equal(conflict.validation.checks.conflicts, false)

  const noOp = sealStoryStateProposal(
    workspace,
    current,
    { request: "No change", authority: "propose" },
    { text: "No change.", upserts: [current.records[0]] },
  )
  assert.equal(noOp.validation.checks.changed, false)

  const readOnly = sealStoryStateProposal(
    workspace,
    current,
    { request: "Explain only", authority: "read" },
    { text: "Proposed.", upserts: [knowledge()] },
  )
  assert.equal(readOnly.validation.checks.authority, false)
})

test("rejects removals that orphan references and false commit claims", async () => {
  const workspace = await loadWriterWorkspace(await fixture())
  const current = parseStoryState({ formatVersion: 1, records: [...baseState().records, knowledge()] })

  const orphan = sealStoryStateProposal(
    workspace,
    current,
    { request: "Remove Mara", authority: "propose" },
    { text: "Proposed removal.", removals: ["entity:mara"] },
  )
  assert.equal(orphan.validation.checks.references, false)

  const claimedCommit = sealStoryStateProposal(
    workspace,
    baseState(),
    { request: "Record knowledge", authority: "propose" },
    { text: "I have saved the state.", upserts: [knowledge()] },
  )
  assert.equal(claimedCommit.validation.checks.uncommitted, false)
})

test("detects stale bases and tampered persisted payloads", async () => {
  const workspace = await loadWriterWorkspace(await fixture())
  const current = baseState()
  const proposal = sealStoryStateProposal(
    workspace,
    current,
    { request: "Record knowledge", authority: "propose" },
    { text: "Proposed.", upserts: [knowledge()] },
  )
  const changed = parseStoryState({
    formatVersion: 1,
    records: [...current.records, { ...knowledge(), id: "knowledge:mara-suspects-door", state: "suspects" }],
  })
  assert.throws(() => proposedStoryState(changed, proposal), /stale story-state proposal/)
  assert.throws(
    () => verifyStoryStateProposal({ ...proposal, request: "Tampered request" }),
    /content address does not match/,
  )
})

test("canonicalizes operation order before assigning a content address", async () => {
  const workspace = await loadWriterWorkspace(await fixture())
  const current = baseState()
  const facts = [
    {
      kind: "fact",
      id: "fact:door-age",
      subject: "entity:door",
      predicate: "age in years",
      value: 80,
      certainty: "inferred",
      evidence: ["ch01:p002"],
    },
    {
      kind: "fact",
      id: "fact:door-material",
      subject: "entity:door",
      predicate: "material",
      value: "iron",
      certainty: "asserted",
      evidence: ["ch01:p002"],
    },
  ]
  const task = { request: "Record door facts", authority: "propose" } as const
  const first = sealStoryStateProposal(workspace, current, task, { text: "Proposed.", upserts: facts })
  const second = sealStoryStateProposal(workspace, current, task, {
    text: "Proposed.",
    upserts: facts.toReversed(),
  })

  assert.equal(first.id, second.id)
  assert.deepEqual(verifyStoryStateProposal(first), first)
})

function baseState(): StoryState {
  return parseStoryState({
    formatVersion: 1,
    records: [
      entity("entity:mara", "character", "Mara Venn", "ch01:p001"),
      entity("entity:door", "object", "The sealed door", "ch01:p002"),
      {
        kind: "fact",
        id: "fact:door-locked",
        subject: "entity:door",
        predicate: "is locked",
        value: true,
        certainty: "asserted",
        evidence: ["ch01:p002"],
      },
    ],
  })
}

function entity(
  id: `entity:${string}`,
  entityType: "character" | "object",
  name: string,
  evidence: string,
): StoryRecord {
  return { kind: "entity", id, entityType, name, aliases: [], evidence: [evidence] }
}

function knowledge(): StoryRecord {
  return {
    kind: "knowledge",
    id: "knowledge:mara-knows-door",
    character: "entity:mara",
    claim: "The sealed door is locked.",
    state: "knows",
    afterRef: "ch01:p002",
    evidence: ["ch01:p002"],
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "writer-state-proposal-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    JSON.stringify({
      formatVersion: 1,
      title: "Fixture",
      chapters: [{ id: "ch01", path: "manuscript/ch01.md" }],
    }),
  )
  await writeFile(
    join(root, "manuscript", "ch01.md"),
    `<!-- novel-agent:passage ch01:p001 -->\nMara entered alone.\n\n<!-- novel-agent:passage ch01:p002 -->\nThe sealed door would not move.\n`,
  )
  return root
}
