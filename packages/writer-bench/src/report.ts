import type { RunFile } from "./contracts.ts"
import { summarize } from "./runner.ts"

export function renderRunReport(run: RunFile) {
  const summaries = summarize(run)
  const rows = summaries.map((summary) =>
    `| ${summary.targetId} | ${summary.completed}/${summary.completed + summary.failed} | ${format(summary.meanScore)} | ${summary.safetyFailures} | ${summary.inputTokens + summary.outputTokens} | $${summary.costUsd.toFixed(4)} |`,
  )
  const failures = run.records.filter((record) => record.error)
  return `# Writer benchmark run

- Run: \`${run.runId}\`
- Created: ${run.createdAt}
- Suites: ${run.suiteFiles.join(", ")}
- Trials: ${run.trials}

| Target | Completed | Mean score | Safety failures | Tokens | Cost |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.join("\n")}

## Context strategy metrics

| Target | Context recall | Grounding | Unsupported-claim avoidance | Mean context items | Mean context words | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${summaries.map((summary) => `| ${summary.targetId} | ${format(summary.metrics.context_recall)} | ${format(summary.metrics.grounding)} | ${format(summary.metrics.unsupported_claim_avoidance)} | ${format(summary.contextItems)} | ${format(summary.contextWords)} | ${format(summary.latencyMs / Math.max(summary.completed, 1))} ms |`).join("\n")}

## Execution failures

${failures.length ? failures.map((record) => `- ${record.targetId} / ${record.task.id} / trial ${record.trial}: ${record.error}`).join("\n") : "None."}
`
}

export function renderComparisonReport(comparison: ReturnType<typeof import("./stats.ts").compareRun>) {
  return `# Writer benchmark comparison

${comparison.passed ? "**PASS**" : "**FAIL**"}

| Field | Value |
| --- | ---: |
| Baseline | ${comparison.baselineId} |
| Candidate | ${comparison.candidateId} |
| Matched tasks | ${comparison.tasks} |
| Baseline mean | ${format(comparison.baselineMean)} |
| Candidate mean | ${format(comparison.candidateMean)} |
| Mean delta | ${signed(comparison.meanDelta)} |
| 95% paired bootstrap CI | ${signed(comparison.confidence95.low)} to ${signed(comparison.confidence95.high)} |
| Win / tie / loss | ${comparison.wins} / ${comparison.ties} / ${comparison.losses} |
| Baseline safety failures | ${comparison.baselineSafetyFailures} |
| Candidate safety failures | ${comparison.candidateSafetyFailures} |

## Suite deltas

| Suite | Mean delta |
| --- | ---: |
${Object.entries(comparison.suiteDeltas).map(([suite, delta]) => `| ${suite} | ${signed(delta)} |`).join("\n")}

## Regression gates

| Gate | Result | Actual | Threshold |
| --- | --- | ---: | ---: |
${comparison.gates.map((gate) => `| ${gate.name} | ${gate.passed ? "PASS" : "FAIL"} | ${format(gate.actual)} | ${format(gate.threshold)} |`).join("\n")}

## Attached official metrics

| Metric | Direction | Baseline | Candidate | Improvement delta |
| --- | --- | ---: | ---: | ---: |
${comparison.metricComparisons.length ? comparison.metricComparisons.map((metric) => `| ${metric.key} | ${metric.direction ?? "missing"} | ${format(metric.baseline)} | ${format(metric.candidate)} | ${metric.delta === null ? "n/a" : signed(metric.delta)} |`).join("\n") : "| None | — | — | — | — |"}
`
}

function format(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(4)
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`
}
