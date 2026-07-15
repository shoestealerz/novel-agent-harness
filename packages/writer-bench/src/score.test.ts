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

test("labels context metrics and scores citation precision without a recall requirement", () => {
  const task: Task = {
    id: "task",
    suite: "suite",
    suiteVersion: "1",
    source: "native",
    job: "explain",
    prompt: "explain",
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
