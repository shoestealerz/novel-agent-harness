import { requireObject } from "../contracts.ts"
import { requiredEnvironment } from "./shared.ts"

export async function completion(
  messages: Array<{ role: string; content: string }>,
  model = requiredEnvironment("WRITER_BENCH_MODEL"),
) {
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
