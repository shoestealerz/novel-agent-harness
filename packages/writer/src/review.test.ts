import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { sealEditProposal, verifyEditProposal } from "./proposal.ts"
import { loadEditProposal, renderProposalDiff, saveEditProposal } from "./review.ts"
import { loadWriterWorkspace } from "./workspace.ts"

test("persists and reloads validated content-addressed proposals", async () => {
  const { root, proposal } = await fixture()
  const path = await saveEditProposal(root, proposal)
  const loaded = await loadEditProposal(root, proposal.id)

  assert.match(path.replaceAll("\\", "/"), /\.novel-agent\/proposals\/[a-f0-9]{64}\.json$/)
  assert.deepEqual(loaded, proposal)
  assert.equal(await saveEditProposal(root, proposal), path)
})

test("rejects tampered proposal payloads", async () => {
  const { proposal } = await fixture()
  assert.throws(() => verifyEditProposal({ ...proposal, request: "A different request." }), /content address/)
})

test("renders a passage-scoped review diff without changing the workspace", async () => {
  const { root, proposal } = await fixture()
  const workspace = await loadWriterWorkspace(root)
  const before = workspace.chapters[0]?.source
  const diff = renderProposalDiff(workspace, proposal)

  assert.match(diff, /diff --novel a\/manuscript\/ch01\.md b\/manuscript\/ch01\.md/)
  assert.match(diff, /-She found the glass pear\./)
  assert.match(diff, /\+Under the table, she found the glass pear\./)
  assert.equal((await loadWriterWorkspace(root)).chapters[0]?.source, before)
})

test("refuses to render a proposal after its source passage changes", async () => {
  const { root, proposal } = await fixture()
  await writeFile(
    join(root, "manuscript", "ch01.md"),
    `# One\n\n<!-- novel-agent:passage ch01:p001 -->\nShe had already moved the glass pear.\n`,
  )
  const changed = await loadWriterWorkspace(root)
  assert.throws(() => renderProposalDiff(changed, proposal), /stale proposal precondition for ch01:p001/)
})

test("refuses to persist invalid proposals", async () => {
  const { root, proposal } = await fixture()
  const invalid = sealEditProposal(
    {
      job: "revise",
      prompt: "Revise.",
      authority: "propose",
      context: [{ ref: "ch01:p001", text: "She found the glass pear.", kind: "manuscript" }],
      contextSpec: { focusRefs: ["ch01:p001"] },
    },
    { text: "I have applied the change.", artifacts: { edits: [{ target: "ch01:p001", replacement: "Changed." }] } },
  )
  assert.equal(invalid.validation.valid, false)
  await assert.rejects(saveEditProposal(root, invalid), /cannot persist an invalid/)
  assert.equal(proposal.validation.valid, true)
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "writer-review-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    JSON.stringify({
      formatVersion: 1,
      title: "Review Fixture",
      chapters: [{ id: "ch01", path: "manuscript/ch01.md" }],
    }),
  )
  await writeFile(
    join(root, "manuscript", "ch01.md"),
    `# One\n\n<!-- novel-agent:passage ch01:p001 -->\nShe found the glass pear.\n`,
  )
  const proposal = sealEditProposal(
    {
      job: "revise",
      prompt: "Tighten the discovery.",
      authority: "propose",
      context: [{ ref: "ch01:p001", text: "She found the glass pear.", kind: "manuscript" }],
      contextSpec: { focusRefs: ["ch01:p001"] },
    },
    {
      text: "Proposal only.",
      artifacts: {
        edits: [{ target: "ch01:p001", replacement: "Under the table, she found the glass pear." }],
      },
    },
  )
  return { root, proposal }
}
