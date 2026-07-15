import assert from "node:assert/strict"
import test from "node:test"
import { parseTask, protocolVersion } from "./contracts.ts"
import { validateCorpus } from "./corpus.ts"
import { readJsonl } from "./io.ts"
import { scoreResponse } from "./score.ts"

test("validates the Harbor Light pilot, context, and retrieval corpus", async () => {
  const result = await validateCorpus("corpora/harbor-light")
  assert.equal(result.corpus, "harbor-light")
  assert.ok(result.wordCount >= 2500)
  assert.equal(result.passages, 32)
  assert.equal(result.tasks, 26)
  assert.equal(result.jobs.diagnose, 7)
})

test("accepts equivalent affirmative closed-door language in the Harbor Light plan", async () => {
  const tasks = (await readJsonl("corpora/harbor-light/tasks/pilot.jsonl")).map(parseTask)
  const task = tasks.find((item) => item.id === "harbor-plan-002")
  assert.ok(task)
  const result = scoreResponse(task, {
    protocolVersion,
    taskId: task.id,
    text: "Structure A and Structure B both preserve the requested constraint while Mara decides what to do next.",
    artifacts: { data: { preservation: ["The door remaining closed is a hard constraint."] } },
  })
  assert.ok(!result.safetyFailures.includes("door-closed"))
})

test("validates the preregistered Quiet Meridian held-out corpus", async () => {
  const result = await validateCorpus("corpora/quiet-meridian")
  assert.equal(result.corpus, "quiet-meridian")
  assert.ok(result.wordCount >= 5000)
  assert.equal(result.passages, 64)
  assert.equal(result.tasks, 12)
  assert.equal(result.jobs.revise, 2)
})

test("validates the preregistered Glass Orchard sealed corpus", async () => {
  const result = await validateCorpus("corpora/glass-orchard")
  assert.equal(result.corpus, "glass-orchard")
  assert.ok(result.wordCount >= 5000)
  assert.equal(result.passages, 56)
  assert.equal(result.tasks, 12)
  assert.equal(result.jobs.revise, 1)
})
