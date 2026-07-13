import assert from "node:assert/strict"
import test from "node:test"
import type { ContextItem, ExecutionTask } from "./contracts.ts"
import { compileContext } from "./context-compiler.ts"

const catalog: ContextItem[] = [
  { ref: "ch01:p001", text: "one", kind: "manuscript" },
  { ref: "ch01:p002", text: "two words", kind: "manuscript" },
  { ref: "ch02:p001", text: "future passage", kind: "manuscript" },
]

test("maximum context includes every manuscript passage", () => {
  const result = compileContext(task(), catalog, "maximum")
  assert.deepEqual(result.trace.selectedRefs, ["ch01:p001", "ch01:p002", "ch02:p001"])
  assert.equal(result.trace.contextWords, 5)
})

test("supplied context remains byte-for-byte unchanged", () => {
  const input = { ...task(), contextSpec: { focusRefs: ["ch01:p001"] } }
  const result = compileContext(input, catalog, "supplied")
  assert.deepEqual(result.task.context, input.context)
  assert.equal(result.task.contextSpec, undefined)
  assert.equal(result.trace.contextItems, 1)
})

test("task-aware context assigns roles and enforces the temporal boundary", () => {
  const result = compileContext({
    ...task(),
    contextSpec: {
      focusRefs: ["ch01:p002"],
      dependencyRefs: ["ch01:p001", "ch02:p001"],
      preservationRefs: ["ch01:p002"],
      throughRef: "ch01:p002",
    },
  }, catalog, "task-aware")
  assert.deepEqual(result.trace.selectedRefs, ["ch01:p001", "ch01:p002"])
  assert.deepEqual(result.task.context?.[1]?.metadata?.contextRoles, ["focus", "preservation"])
  assert.ok(result.trace.excludedRefs.includes("ch02:p001"))
})

test("task-aware context retains non-manuscript supplied instructions", () => {
  const result = compileContext({
    ...task(),
    context: [{ ref: "author:voice", text: "Keep the restraint.", kind: "instruction" }],
    contextSpec: { focusRefs: ["ch01:p001"] },
  }, catalog, "task-aware")
  assert.deepEqual(result.trace.selectedRefs, ["ch01:p001", "author:voice"])
})

test("task-aware context without a specification preserves the v0.1 control prompt", () => {
  const input = task()
  const result = compileContext(input, catalog, "task-aware")
  assert.deepEqual(result.task.context, input.context)
})

test("task-aware context rejects unknown declared references", () => {
  assert.throws(() => compileContext({
    ...task(),
    contextSpec: { focusRefs: ["ch99:p999"] },
  }, catalog, "task-aware"), /missing passages/)
})

test("task-aware context validates exact preservation literals against their passage", () => {
  assert.throws(() => compileContext({
    ...task(),
    contextSpec: {
      focusRefs: ["ch01:p001"],
      preservationRefs: ["ch01:p002"],
      preservationLiterals: [{ ref: "ch01:p002", text: "missing words" }],
    },
  }, catalog, "task-aware"), /absent from ch01:p002/)
})

function task(): ExecutionTask {
  return {
    id: "context-test",
    suite: "test",
    suiteVersion: "1",
    source: "synthetic",
    job: "explain",
    prompt: "Explain.",
    context: [{ ref: "ch01:p001", text: "one", kind: "manuscript" }],
    authority: "read",
  }
}
