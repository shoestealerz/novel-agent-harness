import assert from "node:assert/strict"
import test from "node:test"
import { compileContext, type WriterContextItem } from "./context.ts"
import { sealEditProposal } from "./proposal.ts"

const catalog: WriterContextItem[] = [
  { ref: "opening:arrival", text: "Mara arrived alone.", kind: "manuscript" },
  { ref: "opening:discovery", text: "She found the glass pear.", kind: "manuscript" },
  { ref: "ending:reveal", text: "The pear named its maker.", kind: "manuscript" },
]

test("task-aware context follows catalog chronology without numeric ref conventions", () => {
  const compiled = compileContext(
    {
      contextSpec: {
        focusRefs: ["opening:discovery"],
        dependencyRefs: ["opening:arrival", "ending:reveal"],
        throughRef: "opening:discovery",
      },
    },
    catalog,
    "task-aware",
  )

  assert.deepEqual(compiled.trace.selectedRefs, ["opening:arrival", "opening:discovery"])
  assert.ok(compiled.trace.excludedRefs.includes("ending:reveal"))
})

test("maximum context remains complete through the declared boundary and retains author constraints", () => {
  const compiled = compileContext(
    {
      context: [
        { ref: "ending:reveal", text: "The pear named its maker.", kind: "manuscript" },
        { ref: "author:voice", text: "Keep the restraint.", kind: "instruction" },
      ],
      contextSpec: {
        focusRefs: ["opening:discovery"],
        preservationRefs: ["opening:arrival"],
        throughRef: "opening:discovery",
      },
    },
    catalog,
    "maximum",
  )

  assert.deepEqual(compiled.trace.selectedRefs, ["opening:arrival", "opening:discovery", "author:voice"])
  assert.deepEqual(compiled.task.contextSpec?.focusRefs, ["opening:discovery"])
  assert.equal(compiled.task.contextSpec?.throughRef, "opening:discovery")
  assert.ok(compiled.trace.excludedRefs.includes("ending:reveal"))
})

test("seals a deterministic source-bound uncommitted proposal", () => {
  const task = {
    job: "revise",
    prompt: "Tighten the discovery without changing the arrival.",
    authority: "propose" as const,
    context: catalog.slice(0, 2),
    contextSpec: {
      focusRefs: ["opening:discovery"],
      preservationRefs: ["opening:arrival"],
      preservationLiterals: [{ ref: "opening:arrival", text: "Mara arrived alone." }],
    },
  }
  const response = {
    text: "Proposal only. Preserved: Mara arrived alone.",
    artifacts: {
      edits: [{ target: "opening:discovery", replacement: "Under the table, she found the glass pear." }],
      data: { preservation: ["Mara arrived alone."] },
    },
  }

  const first = sealEditProposal(task, response)
  const second = sealEditProposal(task, response)
  assert.equal(first.id, second.id)
  assert.equal(first.validation.valid, true)
  assert.equal(first.edits[0]?.target, "opening:discovery")
  assert.match(first.edits[0]?.beforeSha256 ?? "", /^sha256:[a-f0-9]{64}$/)
})

test("rejects commit claims and missing preservation receipts", () => {
  const proposal = sealEditProposal(
    {
      job: "revise",
      prompt: "Revise.",
      authority: "propose",
      context: catalog.slice(0, 2),
      contextSpec: {
        focusRefs: ["opening:discovery"],
        preservationRefs: ["opening:arrival"],
        preservationLiterals: [{ ref: "opening:arrival", text: "Mara arrived alone." }],
      },
    },
    {
      text: "I have applied the change.",
      artifacts: { edits: [{ target: "opening:discovery", replacement: "A glass pear waited." }] },
    },
  )

  assert.equal(proposal.validation.valid, false)
  assert.equal(proposal.validation.checks.uncommitted, false)
  assert.equal(proposal.validation.checks.preservation, false)
})
