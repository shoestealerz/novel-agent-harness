import { randomUUID } from "node:crypto"
import { basename, join } from "node:path"
import type { ExecutionRequest, ExecutionTask, JudgeRequest, RunFile, RunRecord, TargetFile, Task } from "./contracts.ts"
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
  out: string
  resume?: RunFile
}) {
  validateResume(input)
  const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  const records: RunRecord[] = []
  for (const target of input.targets.systems) {
    for (const task of input.tasks) {
      for (let trial = 0; trial < input.trials; trial++) {
        const previous = input.resume?.records.find((record) => record.targetId === target.id && record.task.id === task.id && record.trial === trial)
        if (previous?.response && !previous.error) {
          records.push({ task, targetId: target.id, trial, response: previous.response, ...scoreResponse(task, previous.response) })
          continue
        }
        const executionTask = publicTask(task)
        const request: ExecutionRequest = { protocolVersion, kind: "execute", runId, trial, task: executionTask }
        const started = performance.now()
        try {
          const response = await executeTarget(target, request)
          response.usage = { ...response.usage, latencyMs: response.usage?.latencyMs ?? performance.now() - started }
          const judgment = input.targets.judge && task.criteria?.length
            ? await executeJudge(input.targets.judge, {
                protocolVersion,
                kind: "judge",
                task: { ...executionTask, criteria: task.criteria },
                response,
              } satisfies JudgeRequest)
            : undefined
          records.push({ task, targetId: target.id, trial, response, ...scoreResponse(task, response, judgment) })
        } catch (error) {
          records.push({
            task,
            targetId: target.id,
            trial,
            components: [],
            score: null,
            safetyFailures: [],
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }
  const run: RunFile = {
    formatVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    suiteFiles: input.suiteFiles.map((path) => basename(path)),
    targets: input.targets.systems.map((target) => ({ ...target, env: undefined })),
    judge: input.targets.judge ? { ...input.targets.judge, env: undefined } : undefined,
    trials: input.trials,
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

function validateResume(input: {
  tasks: Task[]
  targets: TargetFile
  trials: number
  resume?: RunFile
}) {
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
    const latency = matching.flatMap((record) => typeof record.response?.usage?.latencyMs === "number" ? [record.response.usage.latencyMs] : [])
    return [
      ...(contextWords.length ? [{ targetId, suite, metric: "context_words", value: average(contextWords), direction: "lower" as const, source: "writer-bench:context-trace" }] : []),
      ...(inputTokens.length ? [{ targetId, suite, metric: "input_tokens", value: average(inputTokens), direction: "lower" as const, source: "writer-bench:provider-usage" }] : []),
      ...(latency.length ? [{ targetId, suite, metric: "latency_ms", value: average(latency), direction: "lower" as const, source: "writer-bench:provider-usage" }] : []),
    ]
  })
  return [...checks, ...operational]
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
