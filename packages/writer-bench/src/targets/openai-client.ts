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
  const usage = { inputTokens: 0, inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 }
  let cacheUsageReported = false
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
    if (typeof attemptUsage.prompt_cache_hit_tokens === "number") {
      usage.inputCacheHitTokens += attemptUsage.prompt_cache_hit_tokens
      cacheUsageReported = true
    }
    if (typeof attemptUsage.prompt_cache_miss_tokens === "number") {
      usage.inputCacheMissTokens += attemptUsage.prompt_cache_miss_tokens
      cacheUsageReported = true
    }
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
    return {
      text: content,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(cacheUsageReported ? {
          inputCacheHitTokens: usage.inputCacheHitTokens,
          inputCacheMissTokens: usage.inputCacheMissTokens,
        } : {}),
        ...pricedUsage(usage, cacheUsageReported),
      },
    }
  }
  throw new Error("chat completion recovery exhausted")
}

function pricedUsage(usage: typeof usageShape, cacheUsageReported: boolean) {
  const hit = optionalRate("WRITER_BENCH_INPUT_CACHE_HIT_USD_PER_M")
  const miss = optionalRate("WRITER_BENCH_INPUT_CACHE_MISS_USD_PER_M")
  const output = optionalRate("WRITER_BENCH_OUTPUT_USD_PER_M")
  if (hit === undefined && miss === undefined && output === undefined) return {}
  if (hit === undefined || miss === undefined || output === undefined) {
    throw new Error("raw-model pricing requires cache-hit, cache-miss, and output rates together")
  }
  if (!cacheUsageReported) throw new Error("raw-model pricing requires provider cache token telemetry")
  return {
    costUsd: (
      usage.inputCacheHitTokens * hit
      + usage.inputCacheMissTokens * miss
      + usage.outputTokens * output
    ) / 1_000_000,
  }
}

const usageShape = { inputTokens: 0, inputCacheHitTokens: 0, inputCacheMissTokens: 0, outputTokens: 0 }

function optionalRate(name: string) {
  const value = process.env[name]
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a nonnegative number`)
  return parsed
}
