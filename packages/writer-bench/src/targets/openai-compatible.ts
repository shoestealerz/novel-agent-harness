import { protocolVersion, requireObject, type Criterion, type ExecutionTask } from "../contracts.ts"
import { parseJsonText, plainArtifacts, readRequest, renderTask, requiredEnvironment } from "./shared.ts"

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

async function completion(messages: Array<{ role: string; content: string }>, model = requiredEnvironment("WRITER_BENCH_MODEL")) {
  const base = (process.env.WRITER_BENCH_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")
  const headers = new Headers({ "content-type": "application/json" })
  const apiKey = process.env.WRITER_BENCH_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`)
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(process.env.WRITER_BENCH_TEMPERATURE ?? "0.2"),
      max_tokens: Number(process.env.WRITER_BENCH_MAX_TOKENS ?? "4096"),
      seed: process.env.WRITER_BENCH_SEED ? Number(process.env.WRITER_BENCH_SEED) : undefined,
    }),
  })
  if (!response.ok) throw new Error(`model endpoint returned ${response.status}: ${await response.text()}`)
  const body = requireObject(await response.json(), "chat completion")
  const choices = Array.isArray(body.choices) ? body.choices : []
  const first = requireObject(choices[0], "chat completion choice")
  const message = requireObject(first.message, "chat completion message")
  if (typeof message.content !== "string") throw new Error("chat completion did not return text content")
  const usage = body.usage ? requireObject(body.usage, "chat completion usage") : {}
  return {
    text: message.content,
    usage: {
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    },
  }
}
