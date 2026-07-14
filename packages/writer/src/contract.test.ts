import assert from "node:assert/strict"
import test from "node:test"
import {
  createWriterTask,
  parseWriterResult,
  renderWriterContract,
  routeWriterJob,
  WriterContractError,
} from "./contract.ts"

const context = [
  { ref: "ch01:p001", kind: "manuscript" as const, text: "The bell rang once." },
  { ref: "ch01:p002", kind: "manuscript" as const, text: "Mara waited at the locked door." },
]

test("routes conservatively and derives authority from the job", () => {
  assert.equal(routeWriterJob("Plan a revision of the final scene"), "plan")
  assert.equal(routeWriterJob("Tighten the final scene"), "revise")
  assert.equal(routeWriterJob("Diagnose the continuity problem"), "diagnose")
  assert.equal(routeWriterJob("What happened at the door?"), "explain")
  const task = createWriterTask({
    request: "Tighten the bell sentence",
    context,
    contextSpec: { focusRefs: ["ch01:p001"] },
  })
  assert.equal(task.job, "revise")
  assert.equal(task.authority, "propose")
})

test("renders the production contract without benchmark data", () => {
  const task = createWriterTask({ request: "Explain the bell", job: "explain", context })
  const contract = renderWriterContract(task)
  assert.match(contract, /selectedContext/)
  assert.match(contract, /ch01:p001/)
  assert.doesNotMatch(contract, /checks|criteria|gold/)
})

test("rejects edits from a read-only job", () => {
  const task = createWriterTask({ request: "Explain the bell", job: "explain", context })
  assert.throws(
    () => parseWriterResult(task, response({ edits: [{ target: "ch01:p001", replacement: "Changed." }] })),
    WriterContractError,
  )
  assert.throws(
    () => parseWriterResult(task, response({ answer: "I have committed the explanation." })),
    /claimed authority/,
  )
})

test("validates exact preservation literals at task admission", () => {
  assert.throws(
    () =>
      createWriterTask({
        request: "Tighten the bell",
        job: "revise",
        context,
        contextSpec: {
          focusRefs: ["ch01:p001"],
          preservationRefs: ["ch01:p002"],
          preservationLiterals: [{ ref: "ch01:p002", text: "A sentence that is not present." }],
        },
      }),
    /literal is absent/,
  )
})

test("rejects unsupported evidence and out-of-scope revisions", () => {
  const explain = createWriterTask({ request: "Explain the bell", job: "explain", context })
  assert.throws(() => parseWriterResult(explain, response({ evidence: ["ch99:p999"] })), /unsupported evidence/)
  const revise = createWriterTask({
    request: "Tighten the bell sentence",
    job: "revise",
    context,
    contextSpec: { focusRefs: ["ch01:p001"] },
  })
  assert.throws(
    () => parseWriterResult(revise, response({ edits: [{ target: "ch01:p002", replacement: "Changed." }] })),
    /outside the allowed focus/,
  )
})

test("seals a valid revision into an uncommitted immutable proposal", () => {
  const task = createWriterTask({
    request: "Tighten ch01:p001 and preserve the door sentence",
    job: "revise",
    context,
    contextSpec: {
      focusRefs: ["ch01:p001"],
      preservationRefs: ["ch01:p002"],
      preservationLiterals: [{ ref: "ch01:p002", text: "Mara waited at the locked door." }],
    },
  })
  const result = parseWriterResult(
    task,
    response({
      answer: "Proposed revision. Preservation: Mara waited at the locked door.",
      evidence: ["ch01:p001", "ch01:p002"],
      edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
      data: { preservation: ["Mara waited at the locked door."] },
    }),
  )
  assert.equal(result.proposal?.status, "proposed")
  assert.equal(result.proposal?.validation.valid, true)
  assert.match(result.proposal?.id ?? "", /^sha256:/)
})

function response(overrides: Record<string, unknown> = {}) {
  const data =
    overrides.data && typeof overrides.data === "object" && !Array.isArray(overrides.data)
      ? (overrides.data as Record<string, unknown>)
      : {}
  const { data: _data, ...rest } = overrides
  return {
    answer: "The bell establishes the signal [ch01:p001].",
    evidence: ["ch01:p001"],
    findings: [],
    edits: [],
    ...rest,
    data: { observations: [], inferences: [], unresolved: [], preservation: [], ...data },
  }
}
