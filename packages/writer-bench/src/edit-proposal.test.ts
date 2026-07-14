import assert from "node:assert/strict"
import test from "node:test"
import { compileContext, loadManuscriptContext } from "./context-compiler.ts"
import type { ExecutionResponse, ExecutionTask } from "./contracts.ts"
import { parseTask } from "./contracts.ts"
import { createEditProposal } from "./edit-proposal.ts"
import { readJsonl } from "./io.ts"

const task: ExecutionTask = {
  id: "proposal-test",
  suite: "test",
  suiteVersion: "1",
  source: "synthetic",
  job: "revise",
  prompt: "Tighten ch01:p001 and preserve the next line.",
  authority: "propose",
  contextSpec: {
    focusRefs: ["ch01:p001"],
    preservationRefs: ["ch01:p002"],
    preservationLiterals: [{ ref: "ch01:p002", text: "Keep this exact." }],
  },
  context: [
    { ref: "ch01:p001", kind: "manuscript", text: "The original sentence was long." },
    { ref: "ch01:p002", kind: "manuscript", text: "Keep this exact." },
  ],
}

test("seals a deterministic valid proposal with source preconditions", () => {
  const response = result("Proposed only. Keep this exact.", "The sentence was long.")
  const first = createEditProposal(task, response)
  const second = createEditProposal(task, response)
  assert.deepEqual(first, second)
  assert.match(first.id, /^sha256:[a-f0-9]{64}$/)
  assert.equal(first.status, "proposed")
  assert.equal(first.validation.valid, true)
  assert.equal(first.edits[0]?.beforeSha256, first.base.find((item) => item.ref === "ch01:p001")?.sha256)
})

test("marks missing preservation receipts and commit claims invalid", () => {
  const proposal = createEditProposal(task, result("I have applied the change.", "The sentence was long."))
  assert.equal(proposal.validation.valid, false)
  assert.equal(proposal.validation.checks.preservation, false)
  assert.equal(proposal.validation.checks.uncommitted, false)
})

test("validates exact preservation receipts containing quotation marks", () => {
  const quoted = {
    ...task,
    contextSpec: {
      ...task.contextSpec!,
      preservationLiterals: [{ ref: "ch01:p002", text: "She said, \"Keep this exact.\"" }],
    },
    context: [
      task.context![0]!,
      { ref: "ch01:p002", kind: "manuscript" as const, text: "She said, \"Keep this exact.\"" },
    ],
  }
  const proposal = createEditProposal(quoted, {
    ...result("Receipt recorded.", "The sentence was long."),
    artifacts: {
      edits: [{ target: "ch01:p001", replacement: "The sentence was long." }],
      data: { preservation: ["She said, \"Keep this exact.\""] },
    },
  })
  assert.equal(proposal.validation.checks.preservation, true)
  assert.equal(proposal.validation.valid, true)
})

test("validates every immutable-proposal task against Glass Orchard", async () => {
  const catalog = await loadManuscriptContext("corpora/glass-orchard/manuscript")
  const tasks = (await readJsonl("experiments/immutable-proposals/tasks.jsonl")).map(parseTask)
  assert.equal(tasks.length, 12)
  tasks.forEach((item) => {
    const compiled = compileContext(item, catalog, "task-aware")
    assert.ok(compiled.task.context?.length)
    assert.equal(compiled.task.job, "revise")
    assert.equal(compiled.task.authority, "propose")
  })
})

function result(text: string, replacement: string): ExecutionResponse {
  return {
    protocolVersion: 1,
    taskId: task.id,
    text,
    artifacts: { edits: [{ target: "ch01:p001", replacement }] },
  }
}
