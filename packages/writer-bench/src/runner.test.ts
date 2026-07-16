import assert from "node:assert/strict"
import test from "node:test"
import type { RunFile, TargetFile, Task } from "./contracts.ts"
import { preserveScoringOnlyFailure, rerunCellMatches, validateResume } from "./runner.ts"

const previousTask: Task = {
  id: "task-1",
  suite: "suite",
  suiteVersion: "1",
  source: "native:book",
  job: "diagnose",
  prompt: "Diagnose the timeline.",
  context: [{ ref: "ch01:p001", text: "The bell rang." }],
  authority: "read",
  checks: [{ id: "narrow", kind: "regex", pattern: "day eight", safety: true }],
}

const targets: TargetFile = {
  systems: [{ id: "target", command: ["target"], baseModel: "model", comparisonKey: "same" }],
}

const resume: RunFile = {
  formatVersion: 1,
  runId: "previous",
  createdAt: "now",
  suiteFiles: ["suite.jsonl"],
  targets: targets.systems,
  trials: 1,
  concurrency: 1,
  records: [{ task: previousTask, targetId: "target", trial: 0, components: [], score: 0, safetyFailures: [] }],
}

test("scoring-only resume allows versioned deterministic-check changes", () => {
  const corrected: Task = {
    ...previousTask,
    suiteVersion: "2",
    checks: [{ id: "semantic", kind: "regex", pattern: "eight(?:-|\\s+)day", safety: true }],
  }
  assert.doesNotThrow(() => validateResume({ tasks: [corrected], targets, trials: 1, resume, resumeMode: "scoring-only" }))
  assert.throws(() => validateResume({ tasks: [corrected], targets, trials: 1, resume }), /resume task mismatch/)
})

test("scoring-only resume fails closed on model-visible or judge changes", () => {
  assert.throws(
    () => validateResume({ tasks: [{ ...previousTask, suiteVersion: "2", prompt: "Changed prompt." }], targets, trials: 1, resume, resumeMode: "scoring-only" }),
    /model-visible task material/,
  )
  assert.throws(
    () => validateResume({ tasks: [{ ...previousTask, suiteVersion: "2", criteria: [{ id: "new", description: "New judge criterion" }] }], targets, trials: 1, resume, resumeMode: "scoring-only" }),
    /model-visible task material/,
  )
  assert.throws(() => validateResume({ tasks: [previousTask], targets, trials: 1, resumeMode: "scoring-only" }), /requires --resume/)
})

test("rerun-cell can select one trial without replacing successful siblings", () => {
  const threeTrialResume = { ...resume, trials: 3 }
  assert.doesNotThrow(() => validateResume({
    tasks: [previousTask],
    targets,
    trials: 3,
    resume: threeTrialResume,
    rerunCells: ["target:task-1:2"],
  }))
  assert.equal(rerunCellMatches("target:task-1:2", { target: targets.systems[0]!, task: previousTask, trial: 2 }), true)
  assert.equal(rerunCellMatches("target:task-1:2", { target: targets.systems[0]!, task: previousTask, trial: 1 }), false)
  assert.equal(rerunCellMatches("target:task-1", { target: targets.systems[0]!, task: previousTask, trial: 1 }), true)
  assert.throws(() => validateResume({
    tasks: [previousTask],
    targets,
    trials: 3,
    resume: threeTrialResume,
    rerunCells: ["target:task-1:3"],
  }), /optional trial/)
})

test("scoring-only resume preserves a failed cell unless it is explicitly rerun", () => {
  const failed = { ...resume.records[0]!, error: "preserved provider failure" }
  assert.equal(preserveScoringOnlyFailure(failed, "scoring-only", false), true)
  assert.equal(preserveScoringOnlyFailure(failed, "scoring-only", true), false)
  assert.equal(preserveScoringOnlyFailure(failed, "exact", false), false)
})
