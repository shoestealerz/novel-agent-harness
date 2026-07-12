import type { GateConfig, RunFile } from "./contracts.ts"

export function compareRun(run: RunFile, baselineId: string, candidateId: string, gates: GateConfig = {}) {
  const baselineTarget = run.targets.find((target) => target.id === baselineId)
  const candidateTarget = run.targets.find((target) => target.id === candidateId)
  if (!baselineTarget || !candidateTarget) throw new Error("baseline or candidate target was not found in the run")
  if (gates.requireSameComparisonKey !== false && baselineTarget.comparisonKey !== candidateTarget.comparisonKey) {
    throw new Error("comparisonKey differs; use the same base model/configuration or explicitly disable the gate")
  }
  const baseline = aggregate(run, baselineId)
  const candidate = aggregate(run, candidateId)
  const ids = [...baseline.keys()].filter((id) => candidate.has(id))
  const pairs = ids.map((id) => ({ id, baseline: baseline.get(id)!, candidate: candidate.get(id)! }))
  const deltas = pairs.map((pair) => pair.candidate.score - pair.baseline.score)
  const interval = bootstrap(deltas, 2_000, 17)
  const meanDelta = mean(deltas)
  const baselineSafety = pairs.reduce((total, pair) => total + pair.baseline.safetyFailures, 0)
  const candidateSafety = pairs.reduce((total, pair) => total + pair.candidate.safetyFailures, 0)
  const suiteDeltas = Object.fromEntries(
    [...new Set(pairs.map((pair) => run.records.find((record) => record.task.id === pair.id)?.task.suite).filter(Boolean))].map(
      (suite) => {
        const suitePairs = pairs.filter(
          (pair) => run.records.find((record) => record.task.id === pair.id)?.task.suite === suite,
        )
        return [suite!, mean(suitePairs.map((pair) => pair.candidate.score - pair.baseline.score))]
      },
    ),
  )
  const checks = [
    gate("maxMeanRegression", meanDelta >= -(gates.maxMeanRegression ?? 0), meanDelta, -(gates.maxMeanRegression ?? 0)),
    gate("minMeanDelta", meanDelta >= (gates.minMeanDelta ?? Number.NEGATIVE_INFINITY), meanDelta, gates.minMeanDelta),
    gate(
      "minLowerConfidenceBound",
      interval.low >= (gates.minLowerConfidenceBound ?? Number.NEGATIVE_INFINITY),
      interval.low,
      gates.minLowerConfidenceBound,
    ),
    gate(
      "maxCandidateSafetyFailures",
      candidateSafety <= (gates.maxCandidateSafetyFailures ?? Number.POSITIVE_INFINITY),
      candidateSafety,
      gates.maxCandidateSafetyFailures,
    ),
    gate(
      "maxSafetyFailureIncrease",
      candidateSafety - baselineSafety <= (gates.maxSafetyFailureIncrease ?? Number.POSITIVE_INFINITY),
      candidateSafety - baselineSafety,
      gates.maxSafetyFailureIncrease,
    ),
  ].filter((check) => check.threshold !== undefined)
  for (const [suite, maxRegression] of Object.entries(gates.maxSuiteRegression ?? {})) {
    const delta = suiteDeltas[suite]
    checks.push(gate(`suite:${suite}`, delta !== undefined && delta >= -maxRegression, delta ?? Number.NaN, -maxRegression))
  }
  const metricComparisons = Object.entries(gates.externalMetrics ?? {}).map(([key, config]) => {
    const [suite, metric] = key.split(":", 2)
    const baselineValues = run.metrics?.filter((item) => item.targetId === baselineId && item.suite === suite && item.metric === metric) ?? []
    const candidateValues = run.metrics?.filter((item) => item.targetId === candidateId && item.suite === suite && item.metric === metric) ?? []
    if (!baselineValues.length || !candidateValues.length) {
      checks.push(gate(`metric:${key}:present`, false, Number.NaN, 1))
      return { key, baseline: null, candidate: null, delta: null, direction: null }
    }
    const baselineMean = mean(baselineValues.map((item) => item.value))
    const candidateMean = mean(candidateValues.map((item) => item.value))
    const direction = baselineValues[0]!.direction
    if (candidateValues.some((item) => item.direction !== direction)) throw new Error(`metric ${key} has inconsistent direction`)
    const delta = direction === "higher" ? candidateMean - baselineMean : baselineMean - candidateMean
    if (config.maxRegression !== undefined) {
      checks.push(gate(`metric:${key}:maxRegression`, delta >= -config.maxRegression, delta, -config.maxRegression))
    }
    if (config.minDelta !== undefined) checks.push(gate(`metric:${key}:minDelta`, delta >= config.minDelta, delta, config.minDelta))
    return { key, baseline: baselineMean, candidate: candidateMean, delta, direction }
  })
  return {
    runId: run.runId,
    baselineId,
    candidateId,
    comparisonKey: baselineTarget.comparisonKey,
    tasks: pairs.length,
    baselineMean: mean(pairs.map((pair) => pair.baseline.score)),
    candidateMean: mean(pairs.map((pair) => pair.candidate.score)),
    meanDelta,
    confidence95: interval,
    suiteDeltas,
    metricComparisons,
    wins: deltas.filter((delta) => delta > 0).length,
    ties: deltas.filter((delta) => delta === 0).length,
    losses: deltas.filter((delta) => delta < 0).length,
    baselineSafetyFailures: baselineSafety,
    candidateSafetyFailures: candidateSafety,
    gates: checks,
    passed: checks.every((check) => check.passed),
    pairs,
  }
}

function aggregate(run: RunFile, targetId: string) {
  const values = new Map<string, { scores: number[]; safetyFailures: number }>()
  run.records.filter((record) => record.targetId === targetId && record.score !== null).forEach((record) => {
    const value = values.get(record.task.id) ?? { scores: [], safetyFailures: 0 }
    value.scores.push(record.score!)
    value.safetyFailures += record.safetyFailures.length
    values.set(record.task.id, value)
  })
  return new Map([...values].map(([id, value]) => [id, { score: mean(value.scores), safetyFailures: value.safetyFailures }]))
}

function bootstrap(values: number[], iterations: number, seed: number) {
  if (!values.length) return { low: 0, high: 0 }
  const samples: number[] = []
  let state = seed >>> 0
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let iteration = 0; iteration < iterations; iteration++) {
    samples.push(mean(values.map(() => values[Math.floor(random() * values.length)]!)))
  }
  samples.sort((a, b) => a - b)
  return { low: samples[Math.floor(iterations * 0.025)]!, high: samples[Math.floor(iterations * 0.975)]! }
}

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function gate(name: string, passed: boolean, actual: number, threshold: number | undefined) {
  return { name, passed, actual, threshold }
}
