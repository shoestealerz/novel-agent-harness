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
}) {
  const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  const records: RunRecord[] = []
  for (const target of input.targets.systems) {
    for (const task of input.tasks) {
      for (let trial = 0; trial < input.trials; trial++) {
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
  }
  await writeJson(join(input.out, "run.json"), run)
  await writeJsonl(join(input.out, "records.jsonl"), records)
  await writeJson(join(input.out, "summary.json"), summarize(run))
  await BunCompat.writeText(join(input.out, "report.md"), renderRunReport(run))
  return run
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
    }
  })
}

function sumUsage(records: RunRecord[], key: "inputTokens" | "outputTokens" | "costUsd" | "latencyMs") {
  return records.reduce((total, record) => total + (record.response?.usage?.[key] ?? 0), 0)
}

const BunCompat = {
  async writeText(path: string, value: string) {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { dirname } = await import("node:path")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, value)
  },
}
