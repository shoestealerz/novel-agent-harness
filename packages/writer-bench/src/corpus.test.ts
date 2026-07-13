import assert from "node:assert/strict"
import test from "node:test"
import { validateCorpus } from "./corpus.ts"

test("validates the Harbor Light pilot, context, and retrieval corpus", async () => {
  const result = await validateCorpus("corpora/harbor-light")
  assert.equal(result.corpus, "harbor-light")
  assert.ok(result.wordCount >= 2500)
  assert.equal(result.passages, 32)
  assert.equal(result.tasks, 26)
  assert.equal(result.jobs.diagnose, 7)
})

test("validates the preregistered Quiet Meridian held-out corpus", async () => {
  const result = await validateCorpus("corpora/quiet-meridian")
  assert.equal(result.corpus, "quiet-meridian")
  assert.ok(result.wordCount >= 5000)
  assert.equal(result.passages, 64)
  assert.equal(result.tasks, 12)
  assert.equal(result.jobs.revise, 2)
})
