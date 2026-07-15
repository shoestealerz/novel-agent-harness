import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseTargetFile, type ExecutionTask } from "./contracts.ts"
import { buildWriterArguments, executeProductionWriter } from "./targets/production-writer-runtime.ts"

const task: ExecutionTask = {
  id: "production-explain",
  suite: "production-smoke",
  suiteVersion: "0.1.0",
  source: "native",
  job: "explain",
  authority: "read",
  prompt: "Explain the bell.",
  context: [
    { ref: "ch01:p001", text: "The bell rang once." },
    { ref: "ch02:p001", text: "Mara remembered the bell." },
  ],
  contextSpec: { focusRefs: ["ch01:p001"], dependencyRefs: ["ch02:p001"], throughRef: "ch02:p001" },
}

test("pins comparable raw, stock, and production DeepSeek targets", async () => {
  const path = fileURLToPath(new URL("../production/targets.deepseek.json", import.meta.url))
  const targets = parseTargetFile(JSON.parse(await readFile(path, "utf8")))
  assert.deepEqual(
    targets.systems.map((target) => target.id),
    ["raw-model", "stock-opencode", "production-writer"],
  )
  assert.equal(new Set(targets.systems.map((target) => target.comparisonKey)).size, 1)
  assert.ok(targets.systems.every((target) => target.baseModel === "deepseek-v4-pro"))
  assert.ok(targets.systems.every((target) => target.comparisonKey?.includes("max=8192")))
})

test("executes the shipped Writer command protocol against an isolated manuscript workspace", async () => {
  const fixture = fileURLToPath(new URL("./targets/production-writer-fixture.ts", import.meta.url))
  const response = await executeProductionWriter(task, {
    command: [process.execPath, "--experimental-strip-types", fixture],
    model: "fixture/model",
    timeoutMs: 10_000,
  })

  assert.equal(response.protocolVersion, 1)
  assert.equal(response.taskId, task.id)
  assert.deepEqual(response.artifacts?.evidence, ["ch01:p001"])
  assert.equal(response.usage?.inputTokens, 12)
  assert.equal(response.metadata?.adapter, "production-opencode-writer")
  assert.equal(response.metadata?.sessionID, "ses_production_fixture")
})

test("maps the complete public context contract to Writer CLI flags", () => {
  const args = buildWriterArguments(
    {
      ...task,
      contextSpec: {
        focusRefs: ["ch01:p001"],
        dependencyRefs: ["ch02:p001"],
        preservationRefs: ["ch02:p001"],
        preservationLiterals: [{ ref: "ch02:p001", text: "the bell" }],
        excludeRefs: ["ch03:p001"],
        throughRef: "ch02:p001",
      },
    },
    "/novel",
    "provider/model",
  )

  assert.deepEqual(args.slice(0, 12), [
    "writer",
    "run",
    task.prompt,
    "--dir",
    "/novel",
    "--job",
    "explain",
    "--model",
    "provider/model",
    "--format",
    "json",
    "--focus",
  ])
  assert.ok(args.includes("ch02:p001=the bell"))
  assert.ok(args.includes("--exclude"))
  assert.ok(args.includes("--through"))
})

test("delegates unspecified context to the production Writer selector", () => {
  const args = buildWriterArguments({ ...task, contextSpec: undefined }, "/novel", "provider/model")
  assert.deepEqual(args, [
    "writer",
    "run",
    task.prompt,
    "--dir",
    "/novel",
    "--job",
    "explain",
    "--model",
    "provider/model",
    "--format",
    "json",
  ])
})

test("rejects jobs and context that the production MVP does not support", async () => {
  await assert.rejects(
    executeProductionWriter({ ...task, job: "generate" }, { command: ["unused"], model: "fixture/model" }),
    /does not support job/,
  )
  await assert.rejects(
    executeProductionWriter(
      { ...task, context: [{ ref: "ch01:p001", text: "State", kind: "story_state" }] },
      { command: ["unused"], model: "fixture/model" },
    ),
    /must be manuscript text/,
  )
})

test("records a failed production provider process instead of fabricating a response", async () => {
  await assert.rejects(
    executeProductionWriter(task, {
      command: [process.execPath, "-e", "process.stderr.write('provider unavailable');process.exit(17)"],
      model: "fixture/model",
      timeoutMs: 10_000,
    }),
    /exited 17: provider unavailable/,
  )
})
