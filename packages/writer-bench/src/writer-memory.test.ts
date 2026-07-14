import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { parseTask } from "./contracts.ts"
import { readJsonl } from "./io.ts"
import { renderMemoryPrompt } from "./writer-memory.ts"

test("writer memory preserves narrative state categories absent from coding compaction", () => {
  const writer = renderMemoryPrompt("writer", "Author: preserve uncertainty.")
  const coding = renderMemoryPrompt("coding", "Author: preserve uncertainty.")
  assert.match(writer, /Character Knowledge/)
  assert.match(writer, /Object and Location State/)
  assert.match(writer, /Rejected/)
  assert.doesNotMatch(coding, /Character Knowledge/)
  assert.match(coding, /Relevant Files/)
})

test("validates writer-memory tasks and source histories", async () => {
  const tasks = (await readJsonl("experiments/writer-memory/tasks.jsonl")).map(parseTask)
  assert.equal(tasks.length, 6)
  for (const task of tasks) {
    const filename = task.context?.[0]?.text
    assert.ok(filename)
    const history = await readFile(`experiments/writer-memory/histories/${filename}`, "utf8")
    assert.ok(history.trim().split(/\s+/).length >= 500)
  }
})
