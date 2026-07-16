import assert from "node:assert/strict"
import test from "node:test"
import type { ExecutionTask } from "../contracts.ts"
import { completion } from "./openai-client.ts"
import { parseOpenCodeEvents } from "./opencode-events.ts"
import { citedEvidence, parseJsonText, renderTask } from "./shared.ts"

const task: ExecutionTask = {
  id: "task",
  suite: "suite",
  suiteVersion: "1",
  source: "native",
  job: "explain",
  prompt: "What happened?",
  authority: "read",
  context: [{ ref: "ch01:p001", text: "The bell rang." }],
}

test("renders only public task material and extracts explicit citations", () => {
  const prompt = renderTask(task)
  assert.match(prompt, /What happened/)
  assert.match(prompt, /ch01:p001/)
  assert.deepEqual(citedEvidence(task, "It rang [ch01:p001]."), ["ch01:p001"])
})

test("parses completed OpenCode JSON events", () => {
  const output = [
    JSON.stringify({ type: "text", part: { type: "text", text: "Answer [ch01:p001]" } }),
    JSON.stringify({ type: "step_finish", part: { cost: 0.01, tokens: { input: 10, output: 4 } } }),
  ].join("\n")
  assert.deepEqual(parseOpenCodeEvents(output), {
    text: "Answer [ch01:p001]",
    usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.01 },
  })
})

test("extracts one JSON object from fenced or trailing model text", () => {
  assert.deepEqual(parseJsonText('```json\n{"answer":"brace } in a string"}\n```'), { answer: "brace } in a string" })
  assert.deepEqual(parseJsonText('Result:\n{"answer":"ok"}\nSchema notes follow.'), { answer: "ok" })
})

test("retries incomplete JSON once and accounts for both calls", async () => {
  const originalFetch = globalThis.fetch
  const requests: unknown[] = []
  const responses = [
    { choices: [{ finish_reason: "length", message: { content: "{\"answer\":" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } },
    { choices: [{ finish_reason: "stop", message: { content: "{\"answer\":\"ok\"}" } }], usage: { prompt_tokens: 5, completion_tokens: 2 } },
  ]
  globalThis.fetch = (async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  try {
    const result = await completion([{ role: "system", content: "Return JSON." }], "model", { json: true, retryIncomplete: true })
    assert.equal(result.text, '{"answer":"ok"}')
    assert.deepEqual(result.usage, { inputTokens: 8, outputTokens: 6 })
    assert.equal(requests.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("records DeepSeek cache telemetry and computes pinned raw-model cost", async () => {
  const originalFetch = globalThis.fetch
  const previous = {
    hit: process.env.WRITER_BENCH_INPUT_CACHE_HIT_USD_PER_M,
    miss: process.env.WRITER_BENCH_INPUT_CACHE_MISS_USD_PER_M,
    output: process.env.WRITER_BENCH_OUTPUT_USD_PER_M,
  }
  process.env.WRITER_BENCH_INPUT_CACHE_HIT_USD_PER_M = "0.003625"
  process.env.WRITER_BENCH_INPUT_CACHE_MISS_USD_PER_M = "0.435"
  process.env.WRITER_BENCH_OUTPUT_USD_PER_M = "0.87"
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    usage: {
      prompt_tokens: 1_000_000,
      prompt_cache_hit_tokens: 750_000,
      prompt_cache_miss_tokens: 250_000,
      completion_tokens: 100_000,
    },
  }), { status: 200 })) as typeof fetch
  try {
    const result = await completion([{ role: "user", content: "hello" }], "deepseek-v4-pro")
    assert.deepEqual(result.usage, {
      inputTokens: 1_000_000,
      inputCacheHitTokens: 750_000,
      inputCacheMissTokens: 250_000,
      outputTokens: 100_000,
      costUsd: 0.19846875,
    })
  } finally {
    globalThis.fetch = originalFetch
    restore("WRITER_BENCH_INPUT_CACHE_HIT_USD_PER_M", previous.hit)
    restore("WRITER_BENCH_INPUT_CACHE_MISS_USD_PER_M", previous.miss)
    restore("WRITER_BENCH_OUTPUT_USD_PER_M", previous.output)
  }
})

test("retries syntactically invalid JSON when a validator rejects it", async () => {
  const originalFetch = globalThis.fetch
  const responses = [
    { choices: [{ finish_reason: "stop", message: { content: '{"answer": number}' } }], usage: { prompt_tokens: 2, completion_tokens: 3 } },
    { choices: [{ finish_reason: "stop", message: { content: '{"answer":"ok"}' } }], usage: { prompt_tokens: 4, completion_tokens: 2 } },
  ]
  globalThis.fetch = (async () => new Response(JSON.stringify(responses.shift()), { status: 200 })) as typeof fetch
  try {
    const result = await completion([{ role: "system", content: "Return JSON." }], "model", {
      json: true,
      retryIncomplete: true,
      validate: (text) => parseJsonText(text),
    })
    assert.equal(result.text, '{"answer":"ok"}')
    assert.deepEqual(result.usage, { inputTokens: 6, outputTokens: 5 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
