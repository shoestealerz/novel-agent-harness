import assert from "node:assert/strict"
import test from "node:test"
import type { CheckMetric, RunFile, RunRecord, Task } from "./contracts.ts"
import { auditBookScaleRun, renderBookScaleAudit } from "./book-scale-audit.ts"

const task: Task = {
  id: "task-1",
  suite: "book",
  suiteVersion: "1",
  source: "native:book",
  job: "revise",
  prompt: "Revise the line.",
  tags: ["long-range"],
}

const freeze = {
  model: { comparisonKey: "same-model" },
  targets: { ids: ["raw-model", "stock-opencode", "production-writer"] },
  primaryTrack: { tasks: 1, trials: 1, targets: 3, cells: 3, contextMode: "full" },
  controlledTrack: { tasks: 1, trials: 1, targets: 3, cells: 3, contextMode: "controlled" },
  gates: {
    completionMinimum: 0.95,
    candidateDeterministicSafetyFailuresMaximum: 0,
    candidateSafetyFailureIncreaseMaximum: 0,
    proposalValidityMinimum: 1,
    proposalPreconditionsMinimum: 1,
    proposalPreservationMinimum: 1,
    proposalAuthorityMinimum: 1,
    groundingMinimum: 0.95,
    unsupportedClaimAvoidanceMinimum: 0.95,
    requiredEvidenceRecallMinimum: 0.85,
    longRangeRequiredEvidenceRecallMinimum: 0.75,
    meanReliabilityRegressionMaximum: 0,
    requireSameComparisonKey: true,
  },
  telemetryGates: {
    requireCompleteUsage: true,
    requireRawCacheBreakdown: true,
    requireWriterPhases: true,
    requirePhaseTotalReconciliation: true,
  },
}

const run: RunFile = {
  formatVersion: 1,
  runId: "run",
  createdAt: "now",
  suiteFiles: ["sealed.jsonl"],
  targets: ["raw-model", "stock-opencode", "production-writer"].map((id) => ({
    id,
    command: [id],
    baseModel: "model",
    comparisonKey: "same-model",
  })),
  trials: 1,
  concurrency: 3,
  records: [
    record("raw-model", 0.8),
    record("stock-opencode", 0.7),
    record("production-writer", 1),
  ],
}

test("audits every frozen reliability, safety, telemetry, and comparison gate", () => {
  const audit = auditBookScaleRun(run, freeze, "primary")
  assert.equal(audit.passed, true)
  assert.ok(audit.gates.every((gate) => gate.passed))
  assert.equal(audit.targets["production-writer"]?.phases.contextSelection?.records, 1)
  assert.equal(audit.targets["production-writer"]?.phases.execution?.records, 1)
  assert.equal(audit.comparisons["raw-model"]?.meanDelta, 0.19999999999999996)
  assert.equal(audit.comparisons["raw-model"]?.wins, 1)
  assert.match(renderBookScaleAudit(audit), /Result: \*\*PASS\*\*/)
  assert.match(renderBookScaleAudit(audit), /Phase telemetry/)
})

test("fails closed on missing phase, raw cache, metric, or reliability evidence", () => {
  const missingPhase = structuredClone(run)
  delete missingPhase.records[2]!.response!.metadata!.phaseUsage
  let audit = auditBookScaleRun(missingPhase, freeze, "primary")
  assert.equal(audit.passed, false)
  assert.equal(audit.gates.find((gate) => gate.name === "phase-telemetry:production-writer")?.passed, false)

  const missingCache = structuredClone(run)
  delete missingCache.records[0]!.response!.usage!.inputCacheHitTokens
  audit = auditBookScaleRun(missingCache, freeze, "primary")
  assert.equal(audit.gates.find((gate) => gate.name === "raw-cache-telemetry")?.passed, false)

  const missingMetric = structuredClone(run)
  missingMetric.records[2]!.components = missingMetric.records[2]!.components.filter((item) => item.metric !== "proposal_authority")
  audit = auditBookScaleRun(missingMetric, freeze, "primary")
  assert.equal(audit.gates.find((gate) => gate.name === "proposal-authority")?.passed, false)

  const regression = structuredClone(run)
  regression.records[2]!.score = 0.5
  audit = auditBookScaleRun(regression, freeze, "primary")
  assert.equal(audit.gates.find((gate) => gate.name === "mean-reliability-regression:raw-model")?.passed, false)
})

test("detects incomplete target cells and mismatched comparison identities", () => {
  const incomplete = structuredClone(run)
  incomplete.records[2]!.error = "provider failed"
  incomplete.records[2]!.response = undefined
  incomplete.records[2]!.score = null
  const audit = auditBookScaleRun(incomplete, freeze, "primary")
  assert.equal(audit.gates.find((gate) => gate.name === "completion:production-writer")?.passed, false)
  assert.equal(audit.gates.find((gate) => gate.name === "usage-complete:production-writer")?.passed, true)

  const mismatch = structuredClone(run)
  mismatch.targets[2]!.comparisonKey = "different-model"
  assert.equal(auditBookScaleRun(mismatch, freeze, "primary").gates.find((gate) => gate.name === "comparison-key")?.passed, false)
})

function record(targetId: string, score: number): RunRecord {
  const metrics: CheckMetric[] = [
    "context_recall",
    "grounding",
    "unsupported_claim_avoidance",
    "proposal_validity",
    "proposal_preconditions",
    "proposal_preservation",
    "proposal_authority",
  ]
  const usage = {
    inputTokens: 100,
    outputTokens: 20,
    costUsd: 0.02,
    latencyMs: 30,
    ...(targetId === "raw-model" ? { inputCacheHitTokens: 60, inputCacheMissTokens: 40 } : {}),
  }
  return {
    task,
    targetId,
    trial: 0,
    response: {
      protocolVersion: 1,
      taskId: task.id,
      text: "response",
      usage,
      metadata: targetId === "production-writer" ? {
        phaseUsage: {
          contextSelection: { inputTokens: 30, outputTokens: 5, costUsd: 0.005, latencyMs: 10 },
          execution: { inputTokens: 70, outputTokens: 15, costUsd: 0.015, latencyMs: 15 },
        },
      } : {},
    },
    components: targetId === "production-writer"
      ? metrics.map((metric) => ({ id: metric, kind: "check", score: 1, weight: 1, safety: true, metric }))
      : [],
    score,
    safetyFailures: [],
  }
}
