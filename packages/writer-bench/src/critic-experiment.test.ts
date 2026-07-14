import assert from "node:assert/strict"
import test from "node:test"
import { compileContext, loadManuscriptContext } from "./context-compiler.ts"
import { parseTask } from "./contracts.ts"
import { readJsonl } from "./io.ts"

test("validates critic fixtures against Glass Orchard without leaking checks", async () => {
  const tasks = (await readJsonl("experiments/proposal-critics/tasks.jsonl")).map(parseTask)
  const catalog = await loadManuscriptContext("corpora/glass-orchard/manuscript")
  assert.equal(tasks.length, 8)
  tasks.forEach((task) => {
    const compiled = compileContext(task, catalog, "task-aware")
    assert.ok(compiled.task.context?.some((item) => item.ref.startsWith("proposal:")))
    assert.equal(compiled.task.authority, "read")
  })
})
