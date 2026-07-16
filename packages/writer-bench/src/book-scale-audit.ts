import type { CheckMetric, RunFile, RunRecord } from "./contracts.ts"

export type BookScaleTrack = "primary" | "controlled"

type Freeze = {
  model: { comparisonKey: string }
  targets: { ids: string[] }
  primaryTrack: { tasks: number; trials: number; targets: number; cells: number; contextMode: string }
  controlledTrack: { tasks: number; trials: number; targets: number; cells: number; contextMode: string }
  gates: {
    completionMinimum: number
    candidateDeterministicSafetyFailuresMaximum: number
    candidateSafetyFailureIncreaseMaximum: number
    proposalValidityMinimum: number
    proposalPreconditionsMinimum: number
    proposalPreservationMinimum: number
    proposalAuthorityMinimum: number
    groundingMinimum: number
    unsupportedClaimAvoidanceMinimum: number
    requiredEvidenceRecallMinimum: number
    longRangeRequiredEvidenceRecallMinimum: number
    meanReliabilityRegressionMaximum: number
    requireSameComparisonKey: boolean
  }
  telemetryGates: {
    requireCompleteUsage: boolean
    requireRawCacheBreakdown: boolean
    requireWriterPhases: boolean
    requirePhaseTotalReconciliation: boolean
  }
}

export function auditBookScaleRun(run: RunFile, value: unknown, trackName: BookScaleTrack) {
  const freeze = parseFreeze(value)
  const track = trackName === "primary" ? freeze.primaryTrack : freeze.controlledTrack
  const targetIds = freeze.targets.ids
  const candidateId = "production-writer"
  if (!targetIds.includes(candidateId)) throw new Error("book-scale freeze does not include production-writer")
  const targetReports = Object.fromEntries(targetIds.map((targetId) => {
    const records = run.records.filter((record) => record.targetId === targetId)
    const completed = records.filter(successful)
    const phaseRecords = completed.flatMap((record) => phases(targetId, record))
    return [targetId, {
      records: records.length,
      tasks: new Set(records.map((record) => record.task.id)).size,
      completed: completed.length,
      failed: records.length - completed.length,
      completion: records.length ? completed.length / records.length : 0,
      meanReliability: mean(records.flatMap((record) => record.score === null ? [] : [record.score])),
      deterministicSafetyFailures: records.reduce((sum, record) => sum + record.safetyFailures.length, 0),
      metrics: targetMetrics(records),
      usage: usageReport(completed),
      phases: phaseReport(phaseRecords),
      phaseCoverage: completed.length ? new Set(phaseRecords.map((phase) => phase.recordKey)).size / completed.length : 0,
    }]
  }))
  const candidate = targetReports[candidateId]!
  const gates: Gate[] = []
  gates.push(gate("record-count", run.records.length === track.cells, run.records.length, track.cells, "equal"))
  gates.push(gate("trial-count", run.trials === track.trials, run.trials, track.trials, "equal"))
  for (const targetId of targetIds) {
    const report = targetReports[targetId]!
    gates.push(gate(`completion:${targetId}`, report.completion >= freeze.gates.completionMinimum, report.completion, freeze.gates.completionMinimum, "minimum"))
    gates.push(gate(`tasks:${targetId}`, report.tasks === track.tasks, report.tasks, track.tasks, "equal"))
    if (freeze.telemetryGates.requireCompleteUsage) {
      gates.push(gate(`usage-complete:${targetId}`, report.usage.missingRecords === 0, report.usage.missingRecords, 0, "maximum"))
    }
    if (freeze.telemetryGates.requireWriterPhases || targetId !== candidateId) {
      gates.push(gate(`phase-telemetry:${targetId}`, report.phaseCoverage === 1, report.phaseCoverage, 1, "minimum"))
    }
  }
  if (freeze.gates.requireSameComparisonKey) {
    const configured = run.targets.filter((target) => targetIds.includes(target.id))
    const same = configured.length === targetIds.length
      && configured.every((target) => target.comparisonKey === freeze.model.comparisonKey)
    gates.push(gate("comparison-key", same, same ? 1 : 0, 1, "equal"))
  }
  gates.push(gate(
    "candidate-safety",
    candidate.deterministicSafetyFailures <= freeze.gates.candidateDeterministicSafetyFailuresMaximum,
    candidate.deterministicSafetyFailures,
    freeze.gates.candidateDeterministicSafetyFailuresMaximum,
    "maximum",
  ))
  const metricGates: [string, keyof typeof candidate.metrics, number][] = [
    ["proposal-validity", "proposal_validity", freeze.gates.proposalValidityMinimum],
    ["proposal-preconditions", "proposal_preconditions", freeze.gates.proposalPreconditionsMinimum],
    ["proposal-preservation", "proposal_preservation", freeze.gates.proposalPreservationMinimum],
    ["proposal-authority", "proposal_authority", freeze.gates.proposalAuthorityMinimum],
    ["grounding", "grounding", freeze.gates.groundingMinimum],
    ["unsupported-claim-avoidance", "unsupported_claim_avoidance", freeze.gates.unsupportedClaimAvoidanceMinimum],
    ["required-evidence-recall", "context_recall", freeze.gates.requiredEvidenceRecallMinimum],
    ["long-range-required-evidence-recall", "longRangeContextRecall", freeze.gates.longRangeRequiredEvidenceRecallMinimum],
  ]
  for (const [name, metric, minimum] of metricGates) {
    const actual = candidate.metrics[metric]
    gates.push(gate(name, Number.isFinite(actual) && actual >= minimum, actual, minimum, "minimum"))
  }
  const comparisons = Object.fromEntries(targetIds.filter((targetId) => targetId !== candidateId).map((baselineId) => {
    const result = pairedComparison(run, baselineId, candidateId)
    const baseline = targetReports[baselineId]!
    gates.push(gate(
      `safety-increase:${baselineId}`,
      candidate.deterministicSafetyFailures - baseline.deterministicSafetyFailures <= freeze.gates.candidateSafetyFailureIncreaseMaximum,
      candidate.deterministicSafetyFailures - baseline.deterministicSafetyFailures,
      freeze.gates.candidateSafetyFailureIncreaseMaximum,
      "maximum",
    ))
    gates.push(gate(
      `mean-reliability-regression:${baselineId}`,
      result.meanDelta >= -freeze.gates.meanReliabilityRegressionMaximum,
      result.meanDelta,
      -freeze.gates.meanReliabilityRegressionMaximum,
      "minimum",
    ))
    return [baselineId, result]
  }))
  const rawRecords = run.records.filter((record) => record.targetId === "raw-model" && successful(record))
  const rawCacheMissing = rawRecords.filter((record) =>
    typeof record.response?.usage?.inputCacheHitTokens !== "number"
    || typeof record.response?.usage?.inputCacheMissTokens !== "number"
    || typeof record.response.usage.inputTokens !== "number"
    || !near(record.response.usage.inputCacheHitTokens + record.response.usage.inputCacheMissTokens, record.response.usage.inputTokens)
  ).length
  if (freeze.telemetryGates.requireRawCacheBreakdown) {
    gates.push(gate("raw-cache-telemetry", rawCacheMissing === 0, rawCacheMissing, 0, "maximum"))
  }
  const writerPhaseMismatch = run.records.filter((record) => record.targetId === candidateId && successful(record))
    .filter((record) => !validWriterPhaseTotals(record)).length
  if (freeze.telemetryGates.requirePhaseTotalReconciliation) {
    gates.push(gate("writer-phase-totals", writerPhaseMismatch === 0, writerPhaseMismatch, 0, "maximum"))
  }
  return {
    formatVersion: 1 as const,
    runId: run.runId,
    track: trackName,
    contextMode: track.contextMode,
    expected: track,
    targets: targetReports,
    comparisons,
    gates,
    passed: gates.every((item) => item.passed),
  }
}

export function renderBookScaleAudit(audit: ReturnType<typeof auditBookScaleRun>) {
  const lines = [
    `# Alpha 3 ${audit.track} track audit`,
    "",
    `Run: \`${audit.runId}\``,
    "",
    `Result: **${audit.passed ? "PASS" : "FAIL"}**`,
    "",
    "## Targets",
    "",
    "| Target | Completed | Mean reliability | Safety failures | Cost | Latency p50 / p95 |",
    "|---|---:|---:|---:|---:|---:|",
  ]
  for (const [target, report] of Object.entries(audit.targets)) {
    lines.push(`| ${target} | ${report.completed}/${report.records} | ${format(report.meanReliability)} | ${report.deterministicSafetyFailures} | $${format(report.usage.costUsd.sum)} | ${format(report.usage.latencyMs.p50)} / ${format(report.usage.latencyMs.p95)} ms |`)
  }
  lines.push("", "## Paired comparisons", "")
  for (const [baseline, result] of Object.entries(audit.comparisons)) {
    lines.push(`- vs ${baseline}: delta ${format(result.meanDelta)} (task-clustered 95% CI ${format(result.confidence95.low)} to ${format(result.confidence95.high)}); ${result.wins}/${result.ties}/${result.losses} wins/ties/losses.`)
  }
  lines.push("", "## Gates", "", "| Gate | Actual | Threshold | Result |", "|---|---:|---:|:---:|")
  for (const item of audit.gates) {
    lines.push(`| ${item.name} | ${format(item.actual)} | ${item.direction} ${format(item.threshold)} | ${item.passed ? "PASS" : "FAIL"} |`)
  }
  lines.push("", "## Phase telemetry", "")
  for (const [target, report] of Object.entries(audit.targets)) {
    for (const [phase, usage] of Object.entries(report.phases)) {
      lines.push(`- ${target}/${phase}: $${format(usage.costUsd.sum)}; latency p50 ${format(usage.latencyMs.p50)} ms, p95 ${format(usage.latencyMs.p95)} ms; ${usage.records} cells.`)
    }
  }
  return lines.join("\n") + "\n"
}

type Gate = {
  name: string
  passed: boolean
  actual: number
  threshold: number
  direction: "minimum" | "maximum" | "equal"
}

function parseFreeze(value: unknown): Freeze {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("book-scale freeze must be an object")
  const input = value as Freeze
  if (!input.model?.comparisonKey || !Array.isArray(input.targets?.ids) || !input.primaryTrack || !input.controlledTrack || !input.gates || !input.telemetryGates) {
    throw new Error("book-scale freeze is incomplete")
  }
  return input
}

function successful(record: RunRecord) {
  return Boolean(record.response) && !record.error
}

function targetMetrics(records: RunRecord[]) {
  return {
    context_recall: componentMean(records, "context_recall"),
    longRangeContextRecall: componentMean(records.filter((record) => record.task.tags?.includes("long-range")), "context_recall"),
    grounding: componentMean(records, "grounding"),
    unsupported_claim_avoidance: componentMean(records, "unsupported_claim_avoidance"),
    proposal_validity: componentMean(records, "proposal_validity"),
    proposal_preconditions: componentMean(records, "proposal_preconditions"),
    proposal_preservation: componentMean(records, "proposal_preservation"),
    proposal_authority: componentMean(records, "proposal_authority"),
  }
}

function componentMean(records: RunRecord[], metric: CheckMetric) {
  return mean(records.flatMap((record) => record.components.filter((component) => component.metric === metric).map((component) => component.score)))
}

function usageReport(records: RunRecord[]) {
  const complete = records.filter((record) => ["inputTokens", "outputTokens", "costUsd", "latencyMs"].every((key) =>
    typeof record.response?.usage?.[key as keyof NonNullable<RunRecord["response"]>["usage"]] === "number"))
  return {
    missingRecords: records.length - complete.length,
    inputTokens: stats(complete.map((record) => record.response!.usage!.inputTokens!)),
    outputTokens: stats(complete.map((record) => record.response!.usage!.outputTokens!)),
    costUsd: stats(complete.map((record) => record.response!.usage!.costUsd!)),
    latencyMs: stats(complete.map((record) => record.response!.usage!.latencyMs!)),
  }
}

type PhaseRecord = {
  recordKey: string
  phase: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

function phases(targetId: string, record: RunRecord): PhaseRecord[] {
  const key = `${record.targetId}:${record.task.id}:${record.trial}`
  if (targetId !== "production-writer") {
    const usage = record.response?.usage
    return completeUsage(usage) ? [{ recordKey: key, phase: "execution", ...usage }] : []
  }
  const value = record.response?.metadata?.phaseUsage
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([phase, usage]) => completeUsage(usage)
    ? [{ recordKey: key, phase, ...usage }]
    : [])
}

function phaseReport(records: PhaseRecord[]) {
  return Object.fromEntries([...new Set(records.map((record) => record.phase))].map((phase) => {
    const matching = records.filter((record) => record.phase === phase)
    return [phase, {
      records: matching.length,
      inputTokens: stats(matching.map((record) => record.inputTokens)),
      outputTokens: stats(matching.map((record) => record.outputTokens)),
      costUsd: stats(matching.map((record) => record.costUsd)),
      latencyMs: stats(matching.map((record) => record.latencyMs)),
    }]
  }))
}

function completeUsage(value: unknown): value is { inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return [input.inputTokens, input.outputTokens, input.costUsd, input.latencyMs].every((item) => typeof item === "number" && Number.isFinite(item))
}

function validWriterPhaseTotals(record: RunRecord) {
  const total = record.response?.usage
  const phaseList = phases("production-writer", record)
  if (!completeUsage(total) || phaseList.length !== 2) return false
  return near(phaseList.reduce((sum, phase) => sum + phase.inputTokens, 0), total.inputTokens)
    && near(phaseList.reduce((sum, phase) => sum + phase.outputTokens, 0), total.outputTokens)
    && near(phaseList.reduce((sum, phase) => sum + phase.costUsd, 0), total.costUsd)
    && phaseList.reduce((sum, phase) => sum + phase.latencyMs, 0) <= total.latencyMs + 1
}

function pairedComparison(run: RunFile, baselineId: string, candidateId: string) {
  const aggregate = (targetId: string) => new Map([...new Set(run.records.filter((record) => record.targetId === targetId).map((record) => record.task.id))].map((taskId) => {
    const scores = run.records.filter((record) => record.targetId === targetId && record.task.id === taskId && record.score !== null).map((record) => record.score!)
    return [taskId, mean(scores)]
  }))
  const baseline = aggregate(baselineId)
  const candidate = aggregate(candidateId)
  const deltas = [...baseline.keys()].filter((task) => candidate.has(task)).map((task) => candidate.get(task)! - baseline.get(task)!)
  const confidence95 = bootstrap(deltas, 2_000, 31)
  return {
    tasks: deltas.length,
    meanDelta: mean(deltas),
    confidence95,
    wins: deltas.filter((value) => value > 0).length,
    ties: deltas.filter((value) => value === 0).length,
    losses: deltas.filter((value) => value < 0).length,
  }
}

function bootstrap(values: number[], iterations: number, seed: number) {
  if (!values.length) return { low: Number.NaN, high: Number.NaN }
  let state = seed >>> 0
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
  const samples = Array.from({ length: iterations }, () => mean(values.map(() => values[Math.floor(random() * values.length)]!))).sort((a, b) => a - b)
  return { low: quantile(samples, 0.025), high: quantile(samples, 0.975) }
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: values.length,
    sum: values.reduce((sum, value) => sum + value, 0),
    mean: mean(values),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    maximum: sorted.at(-1) ?? Number.NaN,
  }
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN
}

function quantile(values: number[], probability: number) {
  if (!values.length) return Number.NaN
  const index = (values.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return lower === upper ? values[lower]! : values[lower]! + (values[upper]! - values[lower]!) * (index - lower)
}

function gate(name: string, passed: boolean, actual: number, threshold: number, direction: Gate["direction"]): Gate {
  return { name, passed, actual, threshold, direction }
}

function near(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)
}

function format(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "n/a"
}
