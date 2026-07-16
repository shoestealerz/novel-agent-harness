import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import type { RunFile, RunRecord, Task } from "./contracts.ts"
import {
  analyzeHumanReview,
  parseHumanReviewManifest,
  parseReviewSubmission,
  prepareReviewPacket,
  renderReviewHtml,
  reviewDimensions,
  type HumanReviewManifest,
  type PairRating,
  type ReviewSubmission,
} from "./human-review.ts"

const execute = promisify(execFile)

const task: Task = {
  id: "task-revise",
  suite: "book",
  suiteVersion: "1",
  source: "native:book",
  job: "revise",
  prompt: "Repair the exchange without changing the promise.",
  context: [
    { ref: "ch01:p001", text: "The promise was salt before sunrise." },
    { ref: "ch02:p003", text: "She answered in clipped, exact phrases." },
    { ref: "ch09:p009", text: "This unrelated passage should stay hidden." },
  ],
  contextSpec: {
    focusRefs: ["ch02:p003"],
    dependencyRefs: ["ch01:p001"],
    preservationRefs: ["ch01:p001"],
  },
  authority: "propose",
}

const manifest: HumanReviewManifest = {
  formatVersion: 1,
  study: "study",
  outputSelection: { trial: 0, rule: "first preregistered trial" },
  randomization: { algorithm: "HMAC-SHA256 parity", seed: "ab".repeat(32) },
  eligibility: {
    minimumReviewersPerPair: 3,
    minimumPairRatings: 3,
    reviewerRequirements: ["adult", "fiction editor"],
  },
  tasks: [{ id: task.id, split: "sealed", job: "revise", tags: ["voice"] }],
  comparisons: [{
    pairId: "pair-1",
    taskId: task.id,
    trial: 0,
    baselineTargetId: "raw-model",
    leftTargetId: "production-writer",
    rightTargetId: "raw-model",
  }],
}

const run: RunFile = {
  formatVersion: 1,
  runId: "run",
  createdAt: "now",
  suiteFiles: ["sealed.jsonl"],
  targets: [
    { id: "raw-model", command: ["raw"] },
    { id: "production-writer", command: ["writer"] },
  ],
  trials: 1,
  records: [
    record("raw-model", "Baseline answer", "Baseline proposed prose."),
    record("production-writer", "production-writer answer", "Writer proposed prose."),
  ],
}

test("prepares a deterministic packet without target identities, metadata, or distractor passages", () => {
  const packet = prepareReviewPacket(run, manifest, "reviewer-7")
  assert.deepEqual(packet.pairs[0]?.sourcePassages.map((item) => item.ref), ["ch01:p001", "ch02:p003"])
  assert.equal(packet.pairs[0]?.left.answer, "[system] answer")
  assert.equal(packet.pairs[0]?.left.proposedChanges[0]?.text, "Writer proposed prose.")
  const serialized = JSON.stringify(packet)
  assert.doesNotMatch(serialized, /production-writer|raw-model|proposal-id|token/i)
  assert.doesNotMatch(serialized, /unrelated passage/)
  assert.deepEqual(prepareReviewPacket(run, manifest, "reviewer-7"), packet)
  const html = renderReviewHtml(packet)
  assert.match(html, /Eligibility and consent/)
  assert.match(html, /Export ratings/)
  assert.doesNotMatch(html, /production-writer|raw-model|proposal-id/i)
})

test("rejects failed, missing, or mismatched outputs before unblinding", () => {
  const missing = { ...run, records: run.records.slice(0, 1) }
  assert.throws(() => prepareReviewPacket(missing, manifest, "reviewer"), /output is missing/)
  const failed = structuredClone(run)
  failed.records[1]!.error = "provider failed"
  failed.records[1]!.response = undefined
  assert.throws(() => prepareReviewPacket(failed, manifest, "reviewer"), /output failed/)
  const mismatched = structuredClone(run)
  mismatched.records[1]!.task.prompt = "Different request"
  assert.throws(() => prepareReviewPacket(mismatched, manifest, "reviewer"), /identical task material/)
})

test("validates the frozen manifest and eligible submissions", () => {
  assert.deepEqual(parseHumanReviewManifest(manifest), manifest)
  const invalid = structuredClone(manifest) as unknown as { comparisons: { trial: number }[] }
  invalid.comparisons[0]!.trial = 1
  assert.throws(() => parseHumanReviewManifest(invalid), /unregistered trial/)
  const submission = review("reviewer-1", "left")
  assert.deepEqual(parseReviewSubmission(submission), submission)
  const ineligible = structuredClone(submission)
  ineligible.eligibility.adult = false
  assert.equal(parseReviewSubmission(ineligible).eligibility.adult, false)
})

test("analyzes blinded preference with task-clustered intervals and agreement", () => {
  const analysis = analyzeHumanReview(
    manifest,
    [review("reviewer-1", "left"), review("reviewer-2", "left"), review("reviewer-3", "left")],
    200,
  )
  assert.equal(analysis.complete, true)
  assert.equal(analysis.totalRatings, 3)
  const result = analysis.comparisons["raw-model"]
  assert.equal(result?.preference.mean, 1)
  assert.equal(result?.preference.lower95, 1)
  assert.equal(result?.preference.upper95, 1)
  assert.equal(result?.preference.status, "preferred-if-automated-safety-passes")
  assert.equal(result?.forcedPreferenceAgreement, 1)
  assert.equal(result?.dimensions.proseQuality.meanDelta, 2)
  assert.deepEqual(result?.defectFlags.candidate, { voice: 3 })
  assert.deepEqual(result?.defectFlags.baseline, { continuity: 3 })
  assert.equal(result?.byJob.revise.ratings, 3)
  assert.equal(analysis.quantitativeOnly, true)
  assert.ok(!JSON.stringify(analysis).includes("private rationale"))
})

test("reports incomplete coverage without turning it into a preference claim", () => {
  const analysis = analyzeHumanReview(manifest, [review("reviewer-1", "tie")], 200)
  assert.equal(analysis.complete, false)
  assert.equal(analysis.pairCoverage[0]?.missing, 2)
  assert.equal(analysis.comparisons["raw-model"]?.preference.status, "incomplete-sample-no-claim")
})

test("excludes ineligible submissions and reports the reason", () => {
  const ineligible = review("reviewer-x", "right")
  ineligible.eligibility.consentToDeidentifiedPublication = false
  const analysis = analyzeHumanReview(manifest, [ineligible, review("reviewer-1", "left")], 200)
  assert.equal(analysis.submittedReviewerCount, 2)
  assert.equal(analysis.reviewerCount, 1)
  assert.deepEqual(analysis.excludedReviewers, [{ reviewerCode: "reviewer-x", reasons: ["consentToDeidentifiedPublication"] }])
  assert.equal(analysis.totalRatings, 1)
})

test("runs the offline prepare and quantitative-analysis CLI end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer-bench-human-review-"))
  try {
    const runPath = join(root, "run.json")
    const manifestPath = join(root, "manifest.json")
    const packetOut = join(root, "packet")
    const analysisOut = join(root, "analysis")
    await writeFile(runPath, JSON.stringify(run))
    await writeFile(manifestPath, JSON.stringify(manifest))
    const cli = resolve("src/cli.ts")
    await execute(process.execPath, [cli, "human-review", "prepare", "--run", runPath, "--manifest", manifestPath, "--reviewer", "reviewer-cli", "--out", packetOut])
    const packet = JSON.parse(await readFile(join(packetOut, "packet.json"), "utf8")) as { pairs: unknown[] }
    assert.equal(packet.pairs.length, 1)
    assert.match(await readFile(join(packetOut, "review.html"), "utf8"), /Blinded fiction review/)
    const ratingPaths = []
    for (const reviewerCode of ["reviewer-1", "reviewer-2", "reviewer-3"]) {
      const path = join(root, `${reviewerCode}.json`)
      await writeFile(path, JSON.stringify(review(reviewerCode, "left")))
      ratingPaths.push(path)
    }
    await execute(process.execPath, [
      cli,
      "human-review",
      "analyze",
      "--manifest",
      manifestPath,
      ...ratingPaths.flatMap((path) => ["--rating", path]),
      "--out",
      analysisOut,
      "--bootstrap",
      "200",
    ])
    const analysis = JSON.parse(await readFile(join(analysisOut, "quantitative.json"), "utf8")) as { complete: boolean }
    assert.equal(analysis.complete, true)
    assert.match(await readFile(join(analysisOut, "quantitative.md"), "utf8"), /task-clustered 95% CI/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function record(targetId: string, answer: string, replacement: string): RunRecord {
  return {
    task: structuredClone(task),
    targetId,
    trial: 0,
    response: {
      protocolVersion: 1,
      taskId: task.id,
      text: answer,
      artifacts: { edits: [{ target: "ch02:p003", replacement }] },
      usage: { inputTokens: 100, outputTokens: 50 },
      metadata: { proposalId: "proposal-id", system: targetId },
    },
    components: [],
    score: 1,
    safetyFailures: [],
  }
}

function review(reviewerCode: string, preference: PairRating["preference"]): ReviewSubmission {
  const dimensions = Object.fromEntries(reviewDimensions.map((dimension) => [dimension, { left: 5, right: 3 }])) as PairRating["dimensions"]
  return {
    formatVersion: 1,
    study: manifest.study,
    reviewerCode,
    eligibility: {
      adult: true,
      fluentEnglish: true,
      fictionExperience: true,
      didNotAuthorOutput: true,
      consentToDeidentifiedPublication: true,
    },
    ratings: [{
      pairId: "pair-1",
      dimensions,
      preference,
      defectFlags: { left: ["voice"], right: ["continuity"] },
      rationale: "private rationale",
    }],
  }
}
