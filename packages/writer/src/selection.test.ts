import assert from "node:assert/strict"
import test from "node:test"
import {
  normalizeWriterContextSelection,
  parseWriterContextSelection,
  renderWriterSelectionAuditRequest,
  renderWriterSelectionRequest,
  writerSelectionAuditPrompt,
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
  assert.deepEqual(normalizeWriterContextSelection({ output: expected }), expected)
  assert.deepEqual(normalizeWriterContextSelection({ output: expected, reasoning: "done" }), expected)
  assert.deepEqual(parseWriterContextSelection({ input: expected }).focusRefs, ["ch02:p004"])
  assert.equal(parseWriterContextSelection({ ...expected, throughRef: "null" }).throughRef, undefined)
  assert.deepEqual(normalizeWriterContextSelection({ input: { focusRefs: [] } }), { input: { focusRefs: [] } })
})

test("canonicalizes singleton and comma-delimited reference lists from non-strict providers", () => {
  const selection = parseWriterContextSelection({
    focusRefs: "ch02:p004, ch03:p002",
    dependencyRefs: "ch01:p003",
    preservationRefs: [],
    preservationLiterals: [],
    excludeRefs: "ch04:p001",
    throughRef: "ch03:p002",
    rationale: "The selected contradiction and its setup are sufficient.",
  })
  assert.deepEqual(selection.focusRefs, ["ch02:p004", "ch03:p002"])
  assert.deepEqual(selection.dependencyRefs, ["ch01:p003"])
  assert.deepEqual(selection.excludeRefs, ["ch04:p001"])
})

test("canonicalizes provider list containers without inventing references", () => {
  const selection = parseWriterContextSelection({
    focusRefs: { items: [{ ref: "ch02:p004" }] },
    dependencyRefs: { 1: "ch03:p002", 0: "ch01:p003" },
    preservationRefs: { value: "ch02:p005" },
    preservationLiterals: { values: [{ ref: "ch02:p005", text: "She kept the key." }] },
    excludeRefs: { refs: [] },
    throughRef: "ch03:p002",
    rationale: "Container-shaped provider output.",
  })
  assert.deepEqual(selection.focusRefs, ["ch02:p004"])
  assert.deepEqual(selection.dependencyRefs, ["ch01:p003", "ch03:p002"])
  assert.deepEqual(selection.preservationRefs, ["ch02:p005"])
  assert.deepEqual(selection.preservationLiterals, [{ ref: "ch02:p005", text: "She kept the key." }])
  assert.deepEqual(selection.excludeRefs, [])
  assert.throws(
    () =>
      parseWriterContextSelection({
        focusRefs: { arbitrary: "ch02:p004" },
        dependencyRefs: [],
        preservationRefs: [],
        preservationLiterals: [],
        excludeRefs: [],
        throughRef: null,
        rationale: "Unknown containers remain invalid.",
      }),
    /focusRefs must be an array/,
  )
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

test("renders a full bounded manuscript selection request without benchmark material", () => {
  const request = renderWriterSelectionRequest({
    request: "Explain the bell",
    job: "explain",
    manuscript: [{ ref: "ch01:p001", text: "The bell rang once." }],
  })
  assert.match(request, /passage references/)
  assert.match(request, /The bell rang once/)
  assert.match(request, /ch01:p001/)
  assert.doesNotMatch(request, /checks|criteria|gold/)
  assert.match(writerSelectionSystemPrompt, /Do not infer throughRef from chapter order/)
  assert.match(writerSelectionSystemPrompt, /never turn motifs, voice, ideas/)
  assert.match(writerSelectionSystemPrompt, /Do not select passages merely because you inspected them/)
  assert.doesNotMatch(writerSelectionSystemPrompt, /novel_state|novel_proposal/)
})

test("renders a bounded coverage audit without evaluation material", () => {
  const request = renderWriterSelectionAuditRequest({
    request: "Trace the character arc and preserve the final choice",
    job: "explain",
    preliminary: {
      focusRefs: ["ch08:p004"],
      dependencyRefs: ["ch01:p003"],
      preservationRefs: [],
      preservationLiterals: [],
      excludeRefs: [],
      rationale: "Preliminary local evidence.",
    },
  })
  assert.match(request, /coverage-audit/)
  assert.match(request, /ch01:p003/)
  assert.doesNotMatch(request, /checks|criteria|gold/)
  assert.match(writerSelectionAuditPrompt, /earliest establishment/)
  assert.match(writerSelectionAuditPrompt, /distant setup/)
  assert.match(writerSelectionAuditPrompt, /substantive uncertainty/)
})
