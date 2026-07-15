import assert from "node:assert/strict"
import test from "node:test"
import {
  normalizeWriterContextSelection,
  parseWriterContextSelection,
  renderWriterSelectionRequest,
  writerSelectionSystemPrompt,
} from "./selection.ts"

test("parses a structured context selection", () => {
  const selection = parseWriterContextSelection({
    focusRefs: ["ch02:p004"],
    dependencyRefs: ["ch01:p003"],
    preservationRefs: ["ch02:p005"],
    preservationLiterals: [{ ref: "ch02:p005", text: "She kept the key." }],
    excludeRefs: [],
    throughRef: "ch02:p005",
    rationale: "The focus, setup, and protected consequence are sufficient.",
  })
  assert.equal(selection.throughRef, "ch02:p005")
  assert.deepEqual(selection.focusRefs, ["ch02:p004"])
})

test("unwraps complete selector responses from non-strict tool providers", () => {
  const expected = {
    focusRefs: ["ch02:p004"],
    dependencyRefs: [],
    preservationRefs: [],
    preservationLiterals: [],
    excludeRefs: ["ch03:p001"],
    throughRef: "ch02:p005",
    rationale: "The focus and boundary are sufficient.",
  }
  assert.deepEqual(normalizeWriterContextSelection({ input: expected }), expected)
  assert.deepEqual(normalizeWriterContextSelection({ answer: JSON.stringify(expected) }), expected)
  assert.deepEqual(parseWriterContextSelection({ input: expected }).focusRefs, ["ch02:p004"])
  assert.equal(parseWriterContextSelection({ ...expected, throughRef: "null" }).throughRef, undefined)
  assert.deepEqual(normalizeWriterContextSelection({ input: { focusRefs: [] } }), { input: { focusRefs: [] } })
})

test("rejects empty focus, exclusion overlap, and unbound literals", () => {
  const base = {
    focusRefs: ["ch01:p001"],
    dependencyRefs: [],
    preservationRefs: [],
    preservationLiterals: [],
    excludeRefs: [],
    throughRef: null,
    rationale: "Focused request.",
  }
  assert.throws(() => parseWriterContextSelection({ ...base, focusRefs: [] }), /at least one focus/)
  assert.throws(() => parseWriterContextSelection({ ...base, excludeRefs: ["ch01:p001"] }), /excludes focus passages/)
  assert.throws(
    () =>
      parseWriterContextSelection({
        ...base,
        preservationLiterals: [{ ref: "ch01:p002", text: "Keep this." }],
      }),
    /must reference a preservation passage/,
  )
})

test("renders a selection request without manuscript prose or benchmark material", () => {
  const request = renderWriterSelectionRequest({ request: "Explain the bell", job: "explain" })
  assert.match(request, /passage references/)
  assert.doesNotMatch(request, /checks|criteria|gold/)
  assert.match(writerSelectionSystemPrompt, /Do not infer throughRef from chapter order/)
  assert.match(writerSelectionSystemPrompt, /never turn motifs, voice, ideas/)
})
