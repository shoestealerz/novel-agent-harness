import { randomUUID } from "node:crypto"
import { basename, join } from "node:path"
import type { ExecutionRequest, ExecutionTask, JudgeRequest, RunFile, RunRecord, Target, TargetFile, Task } from "./contracts.ts"
import { protocolVersion } from "./contracts.ts"
import { writeJson, writeJsonl } from "./io.ts"
import { executeJudge, executeTarget } from "./process.ts"
import { renderRunReport } from "./report.ts"
import { scoreResponse } from "./score.ts"

export async function runBenchmark(input: {
  tasks: Task[]
  suiteFiles: string[]
  targets: TargetFile
  trials: number
  concurrency?: number
  rerunCells?: string[]
  out: string
  resume?: RunFile
}) {
  validateResume(input)
  const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  const cells = input.targets.systems.flatMap((target) => input.tasks.flatMap((task) =>
    Array.from({ length: input.trials }, (_, trial) => ({ target, task, trial })),
  ))
  const records = await mapConcurrent(cells, input.concurrency ?? 1, (cell) => executeCell(input, runId, cell))
  const run: RunFile = {
    formatVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    suiteFiles: input.suiteFiles.map((path) => basename(path)),
    targets: input.targets.systems.map((target) => ({ ...target, env: undefined })),
    judge: input.targets.judge ? { ...input.targets.judge, env: undefined } : undefined,
    trials: input.trials,
    concurrency: input.concurrency ?? 1,
    records,
    resumedFromRunId: input.resume?.runId,
    metrics: nativeMetrics(records),
  }
  await writeJson(join(input.out, "run.json"), run)
  await writeJsonl(join(input.out, "records.jsonl"), records)
  await writeJson(join(input.out, "summary.json"), summarize(run))
  await BunCompat.writeText(join(input.out, "report.md"), renderRunReport(run))
  return run
}

async function executeCell(
  input: { targets: TargetFile; resume?: RunFile; rerunCells?: string[] },
  runId: string,
  cell: { target: Target; task: Task; trial: number },
) {
  const previous = input.resume?.records.find((record) =>
    record.targetId === cell.target.id && record.task.id === cell.task.id && record.trial === cell.trial)
  const rerun = input.rerunCells?.includes(`${cell.target.id}:${cell.task.id}`)
  if (previous?.response && !previous.error && !rerun) {
    return { task: cell.task, targetId: cell.target.id, trial: cell.trial, response: previous.response, ...evaluateResponse(cell.target, cell.task, previous.response) }
  }
  const executionTask = publicTask(cell.task)
  const request: ExecutionRequest = { protocolVersion, kind: "execute", runId, trial: cell.trial, task: executionTask }
  const started = performance.now()
  try {
    const response = await executeTarget(cell.target, request)
    response.usage = { ...response.usage, latencyMs: response.usage?.latencyMs ?? performance.now() - started }
    const judgment = input.targets.judge && cell.task.criteria?.length
      ? await executeJudge(input.targets.judge, {
          protocolVersion,
          kind: "judge",
          task: { ...executionTask, criteria: cell.task.criteria },
          response,
        } satisfies JudgeRequest)
      : undefined
    return { task: cell.task, targetId: cell.target.id, trial: cell.trial, response, ...evaluateResponse(cell.target, cell.task, response, judgment) }
  } catch (error) {
    return {
      task: cell.task,
      targetId: cell.target.id,
      trial: cell.trial,
      components: [],
      score: null,
      safetyFailures: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function mapConcurrent<T, R>(values: T[], requested: number, execute: (value: T) => Promise<R>) {
  const queue = values.map((value, index) => ({ value, index }))
  const workers = Math.min(Math.max(1, Math.floor(requested)), Math.max(queue.length, 1))
  const lanes = await Promise.all(Array.from({ length: workers }, async () => {
    const output: { index: number; result: R }[] = []
    while (queue.length) {
      const item = queue.shift()!
      output.push({ index: item.index, result: await execute(item.value) })
    }
    return output
  }))
  return lanes.flat().sort((left, right) => left.index - right.index).map((item) => item.result)
}

function validateResume(input: {
  tasks: Task[]
  targets: TargetFile
  trials: number
  concurrency?: number
  rerunCells?: string[]
  resume?: RunFile
}) {
  if (input.concurrency !== undefined && (!Number.isInteger(input.concurrency) || input.concurrency < 1)) {
    throw new Error("concurrency must be a positive integer")
  }
  if (input.rerunCells?.length && !input.resume) throw new Error("rerun-cell requires --resume")
  input.rerunCells?.forEach((cell) => {
    const [targetId, taskId, extra] = cell.split(":")
    if (!targetId || !taskId || extra || !input.targets.systems.some((target) => target.id === targetId) || !input.tasks.some((task) => task.id === taskId)) {
      throw new Error(`rerun-cell must identify a configured target and task: ${cell}`)
    }
  })
  if (!input.resume) return
  if (input.targets.judge || input.resume.judge) throw new Error("resume is not supported for judged runs")
  if (input.resume.trials !== input.trials) throw new Error("resume trials must match the requested trials")
  for (const target of input.targets.systems) {
    const previous = input.resume.targets.find((item) => item.id === target.id)
    if (!previous || previous.comparisonKey !== target.comparisonKey || previous.baseModel !== target.baseModel) {
      throw new Error(`resume target mismatch: ${target.id}`)
    }
  }
  for (const task of input.tasks) {
    const previous = input.resume.records.find((record) => record.task.id === task.id)
    if (!previous || previous.task.suiteVersion !== task.suiteVersion) throw new Error(`resume task mismatch: ${task.id}`)
  }
}

function publicTask(task: Task): ExecutionTask {
  return {
    id: task.id,
    suite: task.suite,
    suiteVersion: task.suiteVersion,
    source: task.source,
    job: task.job,
    language: task.language,
    prompt: task.prompt,
    context: task.context,
    contextSpec: task.contextSpec,
    retrievalSpec: task.retrievalSpec,
    authority: task.authority,
    tags: task.tags,
  }
}

export function summarize(run: RunFile) {
  return run.targets.map((target) => {
    const records = run.records.filter((record) => record.targetId === target.id)
    const scored = records.filter((record) => record.score !== null)
    return {
      targetId: target.id,
      tasks: new Set(records.map((record) => record.task.id)).size,
      completed: records.filter((record) => !record.error).length,
      failed: records.filter((record) => record.error).length,
      meanScore: scored.length ? scored.reduce((total, record) => total + record.score!, 0) / scored.length : null,
      safetyFailures: records.reduce((total, record) => total + record.safetyFailures.length, 0),
      inputTokens: sumUsage(records, "inputTokens"),
      outputTokens: sumUsage(records, "outputTokens"),
      costUsd: sumUsage(records, "costUsd"),
      latencyMs: sumUsage(records, "latencyMs"),
      contextItems: averageMetadata(records, "contextItems"),
      contextWords: averageMetadata(records, "contextWords"),
      metrics: Object.fromEntries(
        [...new Set(records.flatMap((record) => record.components.flatMap((component) => component.metric ?? [])))].map((metric) => {
          const components = records.flatMap((record) => record.components).filter((component) => component.metric === metric)
          return [metric, components.reduce((total, component) => total + component.score, 0) / components.length]
        }),
      ),
    }
  })
}

function averageMetadata(records: RunRecord[], key: "contextItems" | "contextWords") {
  const values = records.flatMap((record) => {
    const trace = record.response?.metadata?.contextTrace
    if (!trace || typeof trace !== "object" || Array.isArray(trace)) return []
    const value = (trace as Record<string, unknown>)[key]
    return typeof value === "number" ? [value] : []
  })
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function sumUsage(records: RunRecord[], key: "inputTokens" | "outputTokens" | "costUsd" | "latencyMs") {
  return records.reduce((total, record) => total + (record.response?.usage?.[key] ?? 0), 0)
}

function nativeMetrics(records: RunRecord[]) {
  const keys = unique(records.flatMap((record) => record.components.flatMap((component) => component.metric
    ? [`${record.targetId}\u0000${record.task.suite}\u0000${component.metric}`]
    : [])))
  const checks = keys.map((key) => {
    const [targetId, suite, metric] = key.split("\u0000") as [string, string, NonNullable<RunRecord["components"][number]["metric"]>]
    const values = records.flatMap((record) => record.targetId === targetId && record.task.suite === suite
      ? record.components.filter((component) => component.metric === metric).map((component) => component.score)
      : [])
    return { targetId, suite, metric, value: average(values), direction: "higher" as const, source: "writer-bench:deterministic-checks" }
  })
  const operational = unique(records.map((record) => `${record.targetId}\u0000${record.task.suite}`)).flatMap((key) => {
    const [targetId, suite] = key.split("\u0000") as [string, string]
    const matching = records.filter((record) => record.targetId === targetId && record.task.suite === suite)
    const contextWords = matching.flatMap((record) => metadataNumber(record, "contextWords"))
    const inputTokens = matching.flatMap((record) => typeof record.response?.usage?.inputTokens === "number" ? [record.response.usage.inputTokens] : [])
    const outputTokens = matching.flatMap((record) => typeof record.response?.usage?.outputTokens === "number" ? [record.response.usage.outputTokens] : [])
    const latency = matching.flatMap((record) => typeof record.response?.usage?.latencyMs === "number" ? [record.response.usage.latencyMs] : [])
    return [
      ...(contextWords.length ? [{ targetId, suite, metric: "context_words", value: average(contextWords), direction: "lower" as const, source: "writer-bench:context-trace" }] : []),
      ...(inputTokens.length ? [{ targetId, suite, metric: "input_tokens", value: average(inputTokens), direction: "lower" as const, source: "writer-bench:provider-usage" }] : []),
      ...(outputTokens.length ? [{ targetId, suite, metric: "output_tokens", value: average(outputTokens), direction: "lower" as const, source: "writer-bench:provider-usage" }] : []),
      ...(latency.length ? [{ targetId, suite, metric: "latency_ms", value: average(latency), direction: "lower" as const, source: "writer-bench:provider-usage" }] : []),
    ]
  })
  return [...checks, ...operational, ...retrievalMetrics(records)]
}

function evaluateResponse(target: Target, task: Task, response: RunRecord["response"], judgment?: Parameters<typeof scoreResponse>[2]) {
  if (target.metadata?.mode === "retrieval-only") return { components: [], score: null, safetyFailures: [] }
  return scoreResponse(task, response!, judgment)
}

function retrievalMetrics(records: RunRecord[]) {
  const values = records.flatMap((record) => {
    const gold = record.task.metadata?.retrievalGold
    const trace = record.response?.metadata?.retrievalTrace
    if (!gold || typeof gold !== "object" || Array.isArray(gold) || !trace || typeof trace !== "object" || Array.isArray(trace)) return []
    const required = stringArray((gold as Record<string, unknown>).requiredRefs)
    const relevant = stringArray((gold as Record<string, unknown>).relevantRefs)
    const selected = stringArray((trace as Record<string, unknown>).selectedRefs)
    const through = record.task.retrievalSpec?.throughRef
    const recall = required.length ? required.filter((ref) => selected.includes(ref)).length / required.length : 1
    const precision = selected.length ? selected.filter((ref) => relevant.includes(ref)).length / selected.length : 0
    const temporal = through ? selected.filter((ref) => referenceOrder(ref) > referenceOrder(through)).length === 0 ? 1 : 0 : 1
    const latency = (trace as Record<string, unknown>).latencyMs
    return [{ targetId: record.targetId, suite: record.task.suite, recall, precision, temporal, selected: selected.length, latency }]
  })
  return unique(values.map((value) => `${value.targetId}\u0000${value.suite}`)).flatMap((key) => {
    const [targetId, suite] = key.split("\u0000") as [string, string]
    const matching = values.filter((value) => value.targetId === targetId && value.suite === suite)
    const latency = matching.flatMap((value) => typeof value.latency === "number" ? [value.latency] : [])
    return [
      { targetId, suite, metric: "retrieval_recall", value: average(matching.map((value) => value.recall)), direction: "higher" as const, source: "writer-bench:hidden-relevance" },
      { targetId, suite, metric: "retrieval_precision", value: average(matching.map((value) => value.precision)), direction: "higher" as const, source: "writer-bench:hidden-relevance" },
      { targetId, suite, metric: "retrieval_temporal_safety", value: average(matching.map((value) => value.temporal)), direction: "higher" as const, source: "writer-bench:public-boundary" },
      { targetId, suite, metric: "retrieval_items", value: average(matching.map((value) => value.selected)), direction: "lower" as const, source: "writer-bench:retrieval-trace" },
      ...(latency.length ? [{ targetId, suite, metric: "retrieval_latency_ms", value: average(latency), direction: "lower" as const, source: "writer-bench:retrieval-trace" }] : []),
    ]
  })
}

function metadataNumber(record: RunRecord, key: string) {
  const trace = record.response?.metadata?.contextTrace
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return []
  const value = (trace as Record<string, unknown>)[key]
  return typeof value === "number" ? [value] : []
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function referenceOrder(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  return match ? Number(match[1]) * 1_000_000 + Number(match[2]) : Number.POSITIVE_INFINITY
}

function unique(values: string[]) {
  return [...new Set(values)]
}

const BunCompat = {
  async writeText(path: string, value: string) {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { dirname } = await import("node:path")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, value)
  },
}
