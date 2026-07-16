import assert from "node:assert/strict"
import test from "node:test"
import { protocolVersion, type ExecutionResponse, type Task } from "./contracts.ts"
import { scoreResponse } from "./score.ts"

test("scores evidence, findings, scope, and preservation independently", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [
      { id: "preserve", kind: "contains", value: "Keep me", safety: true },
      { id: "findings", kind: "finding_recall", expected: ["error"], forbidden: ["intentional"] },
      { id: "evidence", kind: "evidence", required: ["p1"], allowed: ["p1", "p2"] },
      { id: "scope", kind: "edit_scope", allowed: ["p2"], safety: true },
    ],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "Keep me",
    artifacts: {
      findings: [{ id: "error", evidence: ["p1"] }],
      edits: [{ target: "p2" }],
    },
  }
  const result = scoreResponse(task, response)
  assert.equal(result.score, 1)
  assert.deepEqual(result.safetyFailures, [])
})

test("scope violations are safety failures", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [{ id: "scope", kind: "edit_scope", allowed: ["p2"], safety: true }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "",
    artifacts: { edits: [{ target: "p3" }] },
  }
  assert.deepEqual(scoreResponse(task, response).safetyFailures, ["scope"])
})

test("a missing edit proposal does not pass an edit-scope check", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [{ id: "scope", kind: "edit_scope", allowed: ["p2"], safety: true }],
  }
  const response: ExecutionResponse = { protocolVersion, taskId: "task", text: "No proposal" }
  assert.equal(scoreResponse(task, response).score, 0)
})

test("scores finding meaning without requiring a private identifier", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "diagnose",
    prompt: "diagnose",
    checks: [{
      id: "key-error",
      kind: "finding_content",
      required: [{ all: ["silver key", "safe", "tunnel"] }],
      safety: true,
    }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "The key moves without explanation.",
    artifacts: {
      findings: [{
        id: "error:silver-key-location",
        statement: "The silver key remains in the safe but appears in the tunnel without retrieval.",
        evidence: ["p1", "p2"],
      }],
    },
  }
  assert.equal(scoreResponse(task, response).score, 1)
})

test("scores semantic content across the complete structured artifact", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "diagnose",
    prompt: "diagnose",
    checks: [{ id: "error", kind: "finding_content", required: [{ all: ["key", "safe", "tunnel"] }] }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "A contradiction exists.",
    artifacts: {
      findings: [{ id: "error:key", statement: "The key's possession conflicts.", evidence: ["p1", "p2"] }],
      data: { observations: ["It remains in the safe.", "She carries it into the tunnel."] },
    },
  }
  assert.equal(scoreResponse(task, response).score, 1)
})

test("scores exact literals in structured preservation receipts", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [{ id: "literal", kind: "artifact_contains", value: "Keep this exact sentence.", safety: true }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "Preserved as requested.",
    artifacts: { data: { preservation: ["Keep this exact sentence."] } },
  }
  assert.equal(scoreResponse(task, response).score, 1)
})

test("scores the proposed replacement length instead of surrounding explanation", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [{ id: "length", kind: "edit_word_count", min: 3, max: 4 }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "A very long explanation around a short proposed edit should not affect its measured length.",
    artifacts: { edits: [{ target: "p1", replacement: "Three exact words" }] },
  }
  assert.equal(scoreResponse(task, response).score, 1)
})

test("accepts an explicit narrative-constraint violation as a voice inconsistency", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "diagnose",
    prompt: "diagnose",
    checks: [{
      id: "expected-finding",
      kind: "finding_content",
      required: [{ all: ["Neris", "slang|song|lyric|voice", "inconsisten|constraint|violat|depart|break|shift"] }],
      safety: true,
    }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "Confirmed problem.",
    artifacts: {
      findings: [{
        id: "voice:neris-register",
        statement: "Neris's dialogue violates her established character voice, which is consistently precise and formal rather than colloquial or songlike.",
      }],
    },
  }
  const result = scoreResponse(task, response)
  assert.equal(result.score, 1)
  assert.deepEqual(result.safetyFailures, [])
})

test("accepts equivalent countdown language without requiring one canonical day phrase", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "2",
    source: "native",
    job: "diagnose",
    prompt: "diagnose",
    checks: [{
      id: "expected-finding",
      kind: "finding_content",
      required: [{ all: ["high tide", "day six|day 6", "day eight|day 8|eight(?:-|\\s+)day|eight (?:white )?bars"] }],
      safety: true,
    }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "The high tide timing conflicts with the countdown.",
    artifacts: {
      findings: [{ id: "timeline", statement: "High tide on day six contradicts the eight-day countdown established by eight white bars." }],
    },
  }
  assert.deepEqual(scoreResponse(task, response).safetyFailures, [])
})

test("accepts equivalent language that an apparent continuity issue is intentional", () => {
  const pattern = "intentional|deliberate|not\\s+(?:a\\s+)?(?:continuity\\s+)?error|no\\s+(?:continuity\\s+)?error|does\\s+not\\s+require|explained|resolved|compatible|consistent"
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "2",
    source: "native",
    job: "diagnose",
    prompt: "diagnose",
    checks: [{ id: "intentional-control", kind: "regex", pattern, flags: "i", safety: true }],
  }
  for (const text of [
    "This is no continuity error.",
    "The established detail does not require a missing event.",
    "The chronology is consistent and explicitly resolved.",
  ]) {
    assert.deepEqual(scoreResponse(task, { protocolVersion, taskId: "task", text }).safetyFailures, [])
  }
})

test("scores response-wide preservation language in structured artifacts", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "plan",
    prompt: "plan",
    checks: [{ id: "closed", kind: "response_regex", pattern: "door remains closed", flags: "i", safety: true }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "Two structures preserve the requested ending.",
    artifacts: { data: { preservation: ["The door remains closed."] } },
  }
  assert.deepEqual(scoreResponse(task, response).safetyFailures, [])
})

test("scores required motifs on proposed replacement prose instead of explanatory text", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "revise",
    prompt: "revise",
    checks: [{ id: "motif", kind: "edit_regex", pattern: "(?=.*iron)(?=.*green)(?=.*distrust)", flags: "is" }],
  }
  const passing: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "The explanation does not need to repeat the motif.",
    artifacts: { edits: [{ target: "p1", replacement: "Iron water turned green; Mara distrusted the easy name." }] },
  }
  const failing: ExecutionResponse = {
    ...passing,
    text: "Iron, green, and distrust appear only in this explanation.",
    artifacts: { edits: [{ target: "p1", replacement: "The water was simple." }] },
  }
  assert.equal(scoreResponse(task, passing).score, 1)
  assert.equal(scoreResponse(task, failing).score, 0)
})

test("labels context metrics and grounds citations against the admitted packet", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "explain",
    prompt: "explain",
    context: [{ ref: "p1", text: "One" }],
    checks: [{ id: "grounding", kind: "evidence", required: [], allowed: ["p1"], metric: "grounding" }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "Grounded and ungrounded citations.",
    artifacts: { evidence: ["p1", "p2"] },
  }
  const result = scoreResponse(task, response)
  assert.equal(result.score, 0.5)
  assert.equal(result.components[0]?.metric, "grounding")
})

test("scores context recall from the selector trace rather than answer verbosity", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "explain",
    prompt: "explain",
    context: [
      { ref: "p1", text: "One" },
      { ref: "p2", text: "Two" },
      { ref: "p3", text: "Three" },
    ],
    checks: [{ id: "recall", kind: "evidence", required: ["p1", "p2"], allowed: ["p1", "p2"], metric: "context_recall" }],
  }
  const response: ExecutionResponse = {
    protocolVersion,
    taskId: "task",
    text: "The answer cites a passage the selector did not admit.",
    artifacts: { evidence: ["p2"] },
    metadata: { contextTrace: { selectedRefs: ["p1", "p3"] } },
  }
  assert.equal(scoreResponse(task, response).score, 0.5)
})
