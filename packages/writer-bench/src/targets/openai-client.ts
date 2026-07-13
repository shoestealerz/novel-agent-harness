import { requireObject } from "../contracts.ts"
import { requiredEnvironment } from "./shared.ts"

export async function completion(
  messages: Array<{ role: string; content: string }>,
  model = requiredEnvironment("WRITER_BENCH_MODEL"),
  options: { json?: boolean; retryIncomplete?: boolean; validate?: (text: string) => void } = {},
) {
  const base = (process.env.WRITER_BENCH_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")
  const headers = new Headers({ "content-type": "application/json" })
  const apiKey = process.env.WRITER_BENCH_API_KEY ?? process.env.DEEPSEEK_API_KEY
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`)
  const usage = { inputTokens: 0, outputTokens: 0 }
  const attempts = options.retryIncomplete ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptMessages = attempt === 0 ? messages : [
      ...messages,
      {
        role: "user",
        content: "Your previous JSON response was incomplete. Retry once. Return the same requested object in the most compact valid JSON possible; do not restate instructions or context.",
      },
    ]
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: attemptMessages,
        temperature: Number(process.env.WRITER_BENCH_TEMPERATURE ?? "0.2"),
        max_tokens: Number(process.env.WRITER_BENCH_MAX_TOKENS ?? "4096"),
        seed: process.env.WRITER_BENCH_SEED ? Number(process.env.WRITER_BENCH_SEED) : undefined,
        response_format: options.json ? { type: "json_object" } : undefined,
      }),
    })
    if (!response.ok) throw new Error(`model endpoint returned ${response.status}: ${await response.text()}`)
    const body = requireObject(await response.json(), "chat completion")
    const choices = Array.isArray(body.choices) ? body.choices : []
    const first = requireObject(choices[0], "chat completion choice")
    const message = requireObject(first.message, "chat completion message")
    const attemptUsage = body.usage ? requireObject(body.usage, "chat completion usage") : {}
    usage.inputTokens += typeof attemptUsage.prompt_tokens === "number" ? attemptUsage.prompt_tokens : 0
    usage.outputTokens += typeof attemptUsage.completion_tokens === "number" ? attemptUsage.completion_tokens : 0
    const content = typeof message.content === "string" ? message.content : ""
    const incomplete = options.json && (first.finish_reason === "length" || !content.trim())
    if (incomplete && attempt + 1 < attempts) continue
    if (options.json && first.finish_reason === "length") throw new Error("JSON completion reached the output-token limit after recovery")
    if (!content.trim()) throw new Error("chat completion did not return text content after recovery")
    try {
      options.validate?.(content)
    } catch (error) {
      if (attempt + 1 < attempts) continue
      throw error
    }
    return { text: content, usage }
  }
  throw new Error("chat completion recovery exhausted")
}
