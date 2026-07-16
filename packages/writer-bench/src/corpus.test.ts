import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { parseTask, protocolVersion } from "./contracts.ts"
import { validateCorpus, validateCorpusArchitecture, validateCorpusDraft } from "./corpus.ts"
import { validateBookTaskMatrix } from "./book-suite.ts"
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
  assert.equal(result.plannedChapters, 14)
  assert.ok(result.draftedChapters >= 2)
  assert.equal(result.draftedChapters, result.chapters.length)
  assert.ok(result.wordCount >= result.draftedChapters * 2500)
  assert.ok(result.passages >= result.draftedChapters * 18)
  assert.deepEqual(
    result.chapters.slice(0, 2).map((chapter) => chapter.pov),
    ["neris", "tovan"],
  )
})

test("validates the complete Saltglass Vigil canonical manuscript", async () => {
  const result = await validateCorpus("corpora/saltglass-vigil")
  assert.equal(result.corpus, "saltglass-vigil")
  assert.equal(result.status, "canonical-prose")
  assert.equal(result.version, "0.2.1")
  assert.equal(result.chapters, 14)
  assert.equal(result.wordCount, 36122)
  assert.equal(result.passages, 252)
  assert.equal(result.goldRecords, 113)
  assert.deepEqual(result.goldFiles, {
    "gold/entities.jsonl": 21,
    "gold/rules.jsonl": 8,
    "gold/facts.jsonl": 25,
    "gold/events.jsonl": 20,
    "gold/knowledge.jsonl": 19,
    "gold/intentions.jsonl": 20,
  })
  assert.equal(result.variants, 14)
  assert.deepEqual(result.variantCategories, {
    factual: 2,
    temporal: 2,
    spatial: 2,
    causal: 2,
    emotional: 2,
    knowledge: 2,
    voice: 2,
  })
  assert.equal(result.tasks, 72)
  assert.deepEqual(result.jobs, { explain: 14, diagnose: 20, plan: 14, revise: 24 })
})

test("validates the frozen public Saltglass Vigil task matrix and sealed receipt", async (context) => {
  const result = await validateBookTaskMatrix("corpora/saltglass-vigil")
  assert.equal(result.total, 72)
  assert.equal(result.sealedCount, 60)
  assert.equal(result.sealedValidated, false)
  assert.equal(result.variantDiagnoses, 14)
  assert.equal(result.cleanControls, 6)

  const root = await mkdtemp(join(tmpdir(), "saltglass-sealed-receipt-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, "sealed.jsonl")
  await writeFile(path, "{}\n")
  await assert.rejects(validateBookTaskMatrix("corpora/saltglass-vigil", path), /does not match frozen receipt/)
})

test("rejects a Saltglass Vigil defect patch after its source passage changes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "saltglass-variant-stale-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  await cp("corpora/saltglass-vigil", root, { recursive: true })
  const path = join(root, "variants", "defects.jsonl")
  const records = (await readJsonl(path)) as Record<string, unknown>[]
  records[0].sourceSha256 = "0".repeat(64)
  await writeFile(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`)
  await assert.rejects(validateCorpus(root), /stale source hash/)
})

test("rejects a book-scale revision scorer that disallows required preservation evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "saltglass-grounding-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  await cp("corpora/saltglass-vigil", root, { recursive: true })
  const path = join(root, "tasks", "validation.jsonl")
  const tasks = (await readJsonl(path)) as Record<string, unknown>[]
  const task = tasks.find((item) => item.id === "saltglass-val-revise-002-key-transfer")!
  const spec = task.contextSpec as { preservationRefs: string[] }
  const checks = task.checks as { id: string; allowed?: string[] }[]
  const grounding = checks.find((check) => check.id === "citation-grounding")!
  grounding.allowed = grounding.allowed?.filter((ref) => !spec.preservationRefs.includes(ref))
  await writeFile(path, `${tasks.map((item) => JSON.stringify(item)).join("\n")}\n`)
  await assert.rejects(validateBookTaskMatrix(root), /grounding disallows required preservation refs/)
})
