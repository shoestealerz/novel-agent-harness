import assert from "node:assert/strict"
import test from "node:test"
import { validateCorpus } from "./corpus.ts"

test("validates the Harbor Light pilot and context corpus", async () => {
  const result = await validateCorpus("corpora/harbor-light")
  assert.equal(result.corpus, "harbor-light")
  assert.ok(result.wordCount >= 2500)
  assert.equal(result.passages, 32)
  assert.equal(result.tasks, 19)
  assert.equal(result.jobs.diagnose, 5)
})
