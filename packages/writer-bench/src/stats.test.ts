import assert from "node:assert/strict"
import test from "node:test"
import type { RunFile, RunRecord, Task } from "./contracts.ts"
import { compareRun } from "./stats.ts"

const task: Task = {
  id: "task",
  suite: "native",
  suiteVersion: "1",
  source: "native",
  job: "explain",
  prompt: "prompt",
}

test("compares only paired tasks and enforces suite gates", () => {
  const run: RunFile = {
    formatVersion: 1,
    runId: "run",
    createdAt: "now",
    suiteFiles: ["suite.jsonl"],
    targets: [
      { id: "base", command: ["base"], comparisonKey: "model" },
      { id: "candidate", command: ["candidate"], comparisonKey: "model" },
    ],
    trials: 1,
    records: [record("base", 0.4), record("candidate", 0.8)],
    metrics: [
      { targetId: "base", suite: "constory", metric: "ced", value: 1.2, direction: "lower" },
      { targetId: "candidate", suite: "constory", metric: "ced", value: 1, direction: "lower" },
    ],
  }
  const result = compareRun(run, "base", "candidate", {
    minMeanDelta: 0.1,
    maxSuiteRegression: { native: 0 },
    externalMetrics: { "constory:ced": { maxRegression: 0 } },
  })
  assert.equal(result.passed, true)
  assert.equal(result.meanDelta, 0.4)
  assert.equal(result.suiteDeltas.native, 0.4)
  assert.ok(Math.abs((result.metricComparisons[0]?.delta ?? 0) - 0.2) < 0.0001)
})

test("refuses comparisons that change the base model", () => {
  const run: RunFile = {
    formatVersion: 1,
    runId: "run",
    createdAt: "now",
    suiteFiles: [],
    targets: [
      { id: "base", command: ["base"], comparisonKey: "model-a" },
      { id: "candidate", command: ["candidate"], comparisonKey: "model-b" },
    ],
    trials: 1,
    records: [record("base", 0.4), record("candidate", 0.8)],
  }
  assert.throws(() => compareRun(run, "base", "candidate"), /comparisonKey differs/)
})

function record(targetId: string, score: number): RunRecord {
  return { task, targetId, trial: 0, components: [], score, safetyFailures: [] }
}
