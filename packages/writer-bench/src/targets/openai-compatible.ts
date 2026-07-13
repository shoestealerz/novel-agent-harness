import { protocolVersion, requireObject, type Criterion, type ExecutionTask } from "../contracts.ts"
import { parseJsonText, plainArtifacts, readRequest, renderTask, requiredEnvironment } from "./shared.ts"
import { completion } from "./openai-client.ts"

const request = await readRequest()
const task = request.task as ExecutionTask & { criteria?: Criterion[] }
const started = performance.now()
const result = request.kind === "judge" ? await judge() : await execute()
console.log(JSON.stringify(result))

async function execute() {
  const response = await completion([
    {
      role: "system",
      content: "You are responding directly to a fiction writer. Follow the request and authority exactly. When making factual claims, cite supplied passage references in square brackets. Do not imply that proposed edits were committed.",
    },
    { role: "user", content: renderTask(task) },
  ])
  return {
    protocolVersion,
    taskId: task.id,
    text: response.text,
    artifacts: plainArtifacts(task, response.text),
    usage: { ...response.usage, latencyMs: performance.now() - started },
    metadata: { adapter: "openai-compatible", model: requiredEnvironment("WRITER_BENCH_MODEL") },
  }
}

async function judge() {
  const responseInput = requireObject(request.response, "judge request.response")
  const criteria = Array.isArray(task.criteria) ? task.criteria : []
  const response = await completion([
    {
      role: "system",
      content: "You are a blinded writing evaluator. Return JSON only: {\"scores\":{criterion_id:number},\"rationale\":{criterion_id:string}}. Scores must be between 0 and 1. Judge only the supplied criteria and do not reward unsupported claims.",
    },
    {
      role: "user",
      content: JSON.stringify({
        request: task.prompt,
        context: task.context,
        authority: task.authority,
        criteria,
        candidate: responseInput.text,
        artifacts: responseInput.artifacts,
      }),
    },
  ], process.env.WRITER_BENCH_JUDGE_MODEL)
  const parsed = parseJsonText(response.text)
  return {
    protocolVersion,
    taskId: task.id,
    scores: parsed.scores,
    rationale: parsed.rationale,
  }
}
