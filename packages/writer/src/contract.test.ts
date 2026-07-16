import assert from "node:assert/strict"
import test from "node:test"
import {
  createWriterTask,
  normalizeWriterResponse,
  parseWriterResult,
  renderWriterContract,
  routeWriterJob,
  WriterContractError,
  writerResponseSchemaFor,
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

  const diagnose = createWriterTask({ request: "Diagnose the bell", job: "diagnose", context })
  const diagnoseContract = renderWriterContract(diagnose)
  assert.match(diagnoseContract, /not a continuity error because it is explained or intentional/)
  assert.match(diagnoseContract, /return findings empty when there is no defect/)
  const diagnoseSchema = writerResponseSchemaFor(diagnose)
  assert.match(diagnoseSchema.properties.findings.description ?? "", /Actual narrative defects only/)
  const statement = diagnoseSchema.properties.findings.items.properties.statement
  assert.ok("description" in statement)
  if ("description" in statement) assert.match(statement.description, /voice inconsistency/)
})

test("constrains structured evidence and edit targets to admitted passage references", () => {
  const explain = createWriterTask({ request: "Explain the bell", job: "explain", context })
  const explainSchema = writerResponseSchemaFor(explain)
  assert.deepEqual(explainSchema.properties.evidence.items.enum, ["ch01:p001", "ch01:p002"])
  assert.deepEqual(explainSchema.properties.findings.items.properties.evidence.items.enum, [
    "ch01:p001",
    "ch01:p002",
  ])
  assert.equal(explainSchema.properties.edits.maxItems, 0)

  const revise = createWriterTask({
    request: "Tighten the bell",
    job: "revise",
    context,
    contextSpec: { focusRefs: ["ch01:p001"] },
  })
  const reviseSchema = writerResponseSchemaFor(revise)
  assert.deepEqual(reviseSchema.properties.edits.items.properties.target.enum, ["ch01:p001"])
  assert.equal("maxItems" in reviseSchema.properties.edits, false)
})

test("unwraps complete Writer responses nested by non-strict tool providers", () => {
  const expected = response()
  assert.deepEqual(normalizeWriterResponse({ answer: expected }), expected)
  assert.deepEqual(normalizeWriterResponse({ answer: JSON.stringify(expected) }), expected)
  assert.deepEqual(
    normalizeWriterResponse({ answer: `${JSON.stringify(expected)},"findingCount":1,"editCount":0}` }),
    expected,
  )
  assert.deepEqual(normalizeWriterResponse({ answer: "ordinary answer" }), { answer: "ordinary answer" })
  assert.deepEqual(normalizeWriterResponse({ answer: { answer: "incomplete" } }), {
    answer: { answer: "incomplete" },
  })
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

test("distinguishes committed-change claims from explicit proposal disclaimers", () => {
  const task = createWriterTask({
    request: "Tighten the bell",
    job: "revise",
    context,
    contextSpec: { focusRefs: ["ch01:p001"] },
  })
  const proposed = response({
    answer: "This is a proposal only — no changes have been applied or committed.",
    edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
  })
  assert.doesNotThrow(() => parseWriterResult(task, proposed))
  assert.throws(() => parseWriterResult(task, response({ answer: "I applied the revision." })), /claimed authority/)
  assert.throws(
    () => parseWriterResult(task, response({ answer: "The change has been committed." })),
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

test("includes finding evidence in the result-level audit receipt", () => {
  const result = parseWriterResult(
    createWriterTask({
      request: "Explain the bell and the locked door",
      job: "explain",
      context: [
        { ref: "ch01:p001", text: "The bell rang once." },
        { ref: "ch01:p002", text: "Mara waited at the locked door." },
      ],
      contextSpec: { focusRefs: ["ch01:p001"], dependencyRefs: ["ch01:p002"] },
    }),
    response({
      evidence: ["ch01:p001"],
      findings: [
        {
          id: "F1",
          statement: "The locked door explains why the bell matters.",
          evidence: ["ch01:p002"],
        },
      ],
    }),
  )

  assert.deepEqual(result.evidence, ["ch01:p001", "ch01:p002"])
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
