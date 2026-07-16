import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { parseTask, protocolVersion } from "./contracts.ts"
import { validateCorpus, validateCorpusArchitecture, validateCorpusDraft } from "./corpus.ts"
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

test("validates the frozen Saltglass Vigil book-scale architecture", async () => {
  const result = await validateCorpusArchitecture("corpora/saltglass-vigil")
  assert.equal(result.corpus, "saltglass-vigil")
  assert.deepEqual(result.targetWords, [36_000, 44_000])
  assert.equal(result.chapters, 14)
  assert.equal(result.povs, 2)
  assert.equal(result.characters, 9)
  assert.equal(result.intentionalAmbiguities, 12)
  assert.equal(result.longRangeDependencies, 9)
  assert.deepEqual(result.variantDefects, {
    factual: 2,
    temporal: 2,
    spatial: 2,
    causal: 2,
    emotional: 2,
    knowledge: 2,
    voice: 2,
  })
})

test("rejects a changed architecture with a stale freeze receipt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "saltglass-stale-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const architecture = await readFile("corpora/saltglass-vigil/architecture.json")
  await writeFile(join(root, "architecture.json"), Buffer.concat([architecture, Buffer.from("\n")]))
  await writeFile(join(root, "architecture.sha256"), await readFile("corpora/saltglass-vigil/architecture.sha256"))
  await assert.rejects(validateCorpusArchitecture(root), /does not match/)
})

test("rejects an architecture whose long-range payoff is too close", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "saltglass-distance-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const architecture = JSON.parse(await readFile("corpora/saltglass-vigil/architecture.json", "utf8"))
  architecture.dependencies[0].payoffChapter = "ch04"
  const bytes = Buffer.from(`${JSON.stringify(architecture, null, 2)}\n`)
  await writeFile(join(root, "architecture.json"), bytes)
  await writeFile(join(root, "architecture.sha256"), createHash("sha256").update(bytes).digest("hex"))
  await assert.rejects(validateCorpusArchitecture(root), /at least four chapters/)
})

test("validates the in-progress Saltglass Vigil canonical draft", async () => {
  const result = await validateCorpusDraft("corpora/saltglass-vigil")
  assert.equal(result.draftedChapters, 2)
  assert.equal(result.plannedChapters, 14)
  assert.equal(result.complete, false)
  assert.equal(result.wordCount, 5041)
  assert.equal(result.passages, 36)
  assert.deepEqual(
    result.chapters.map((chapter) => chapter.pov),
    ["neris", "tovan"],
  )
})
