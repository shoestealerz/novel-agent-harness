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
