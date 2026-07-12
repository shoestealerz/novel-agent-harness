import assert from "node:assert/strict"
import test from "node:test"
import type { ExecutionTask } from "../contracts.ts"
import { parseOpenCodeEvents } from "./opencode-events.ts"
import { citedEvidence, renderTask } from "./shared.ts"

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
