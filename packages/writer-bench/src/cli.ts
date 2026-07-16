#!/usr/bin/env node
import { resolve, join } from "node:path"
import { parseTargetFile, parseTask, type GateConfig, type MetricRecord, type RunFile } from "./contracts.ts"
import { importConStory, importWritingBench } from "./adapters.ts"
import { readJson, readJsonl, writeJson } from "./io.ts"
import { renderComparisonReport } from "./report.ts"
import { runBenchmark } from "./runner.ts"
import { compareRun } from "./stats.ts"
import { validateCorpus, validateCorpusArchitecture, validateCorpusDraft } from "./corpus.ts"
import { validateBookTaskMatrix } from "./book-suite.ts"
import { materializeNativeTasks, type NativeContextMode } from "./native-source.ts"
import {
  analyzeHumanReview,
  assembleHumanReviewRun,
  parseHumanReviewManifest,
  parseReviewSubmission,
  prepareReviewPacket,
  renderHumanReviewAnalysis,
  renderReviewHtml,
} from "./human-review.ts"
import { auditBookScaleRun, renderBookScaleAudit, type BookScaleTrack } from "./book-scale-audit.ts"

const [command, subcommand] = process.argv.slice(2)
const args = parseArgs(process.argv.slice(command === "import" || command === "corpus" || command === "human-review" ? 4 : 3))

if (command === "run") await run()
else if (command === "compare") await compare()
else if (command === "import" && subcommand === "writingbench") await importWriting()
else if (command === "import" && subcommand === "constory") await importStory()
else if (command === "attach-metrics") await attachMetrics()
else if (command === "audit-book-scale") await auditBookScale()
else if (command === "corpus" && subcommand === "validate") await corpusValidate()
else if (command === "corpus" && subcommand === "architecture") await corpusArchitecture()
else if (command === "corpus" && subcommand === "draft") await corpusDraft()
else if (command === "corpus" && subcommand === "task-matrix") await corpusTaskMatrix()
else if (command === "human-review" && subcommand === "prepare") await humanReviewPrepare()
else if (command === "human-review" && subcommand === "assemble") await humanReviewAssemble()
else if (command === "human-review" && subcommand === "analyze") await humanReviewAnalyze()
else if (command === "doctor") doctor()
else usage(1)

async function run() {
  const suites = values(args, "suite")
  if (!suites.length) throw new Error("run requires at least one --suite")
  const targetPath = required(args, "targets")
  const out = resolve(required(args, "out"))
  const requestedTasks = values(args, "task")
  const contextMode = (optional(args, "context-mode") ?? "full") as NativeContextMode
  const tasks = (await Promise.all(suites.map(async (path) => {
    const suitePath = resolve(path)
    const parsed = (await readJsonl(suitePath))
      .map(parseTask)
      .filter((task) => !requestedTasks.length || requestedTasks.includes(task.id))
    return materializeNativeTasks(parsed, suitePath, contextMode)
  })))
    .flat()
  const targets = parseTargetFile(await readJson(resolve(targetPath)))
  const requestedTargets = values(args, "target")
  targets.systems = targets.systems.filter((target) => !requestedTargets.length || requestedTargets.includes(target.id))
  if (!tasks.length) throw new Error("no tasks matched --task")
  if (!targets.systems.length) throw new Error("no systems matched --target")
  const resume = args.get("resume") ? ((await readJson(resolve(required(args, "resume")))) as RunFile) : undefined
  const result = await runBenchmark({
    tasks,
    suiteFiles: suites,
    targets,
    trials: number(args, "trials", 1),
    concurrency: number(args, "concurrency", 1),
    rerunCells: values(args, "rerun-cell"),
    out,
    resume,
  })
  console.log(join(out, "report.md"))
  if (result.records.some((record) => record.error)) process.exitCode = 2
}

async function compare() {
  const runPath = resolve(required(args, "run"))
  const run = (await readJson(runPath)) as RunFile
  const gates = args.get("gates") ? ((await readJson(resolve(required(args, "gates")))) as GateConfig) : {}
  const comparison = compareRun(run, required(args, "baseline"), required(args, "candidate"), gates)
  const out = resolve(required(args, "out"))
  await writeJson(join(out, "comparison.json"), comparison)
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(out, { recursive: true })
  await writeFile(join(out, "comparison.md"), renderComparisonReport(comparison))
  console.log(join(out, "comparison.md"))
  if (!comparison.passed) process.exitCode = 1
}

async function importWriting() {
  const count = await importWritingBench({
    source: resolve(required(args, "source")),
    out: resolve(required(args, "out")),
    domain: optional(args, "domain"),
    language: optional(args, "language"),
    limit: optionalNumber(args, "limit"),
  })
  console.log(`Imported ${count} WritingBench tasks`)
}

async function importStory() {
  const count = await importConStory({
    source: resolve(required(args, "source")),
    out: resolve(required(args, "out")),
    language: optional(args, "language"),
    limit: optionalNumber(args, "limit"),
  })
  console.log(`Imported ${count} ConStory-Bench tasks`)
}

async function attachMetrics() {
  const run = (await readJson(resolve(required(args, "run")))) as RunFile
  const metrics = (await readJsonl(resolve(required(args, "source")))) as MetricRecord[]
  metrics.forEach((metric) => {
    if (!run.targets.some((target) => target.id === metric.targetId))
      throw new Error(`unknown metric target: ${metric.targetId}`)
    if (
      !metric.suite ||
      !metric.metric ||
      !Number.isFinite(metric.value) ||
      !["higher", "lower"].includes(metric.direction)
    ) {
      throw new Error("metric records require targetId, suite, metric, finite value, and higher/lower direction")
    }
  })
  run.metrics = [...(run.metrics ?? []), ...metrics]
  await writeJson(resolve(required(args, "out")), run)
  console.log(`Attached ${metrics.length} metric records`)
}

async function auditBookScale() {
  const run = (await readJson(resolve(required(args, "run")))) as RunFile
  const freeze = await readJson(resolve(required(args, "freeze")))
  const track = required(args, "track")
  if (track !== "primary" && track !== "controlled") throw new Error("--track must be primary or controlled")
  const audit = auditBookScaleRun(run, freeze, track as BookScaleTrack)
  const out = resolve(required(args, "out"))
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(out, { recursive: true })
  await writeJson(join(out, "audit.json"), audit)
  await writeFile(join(out, "audit.md"), renderBookScaleAudit(audit))
  console.log(join(out, "audit.md"))
  if (!audit.passed) process.exitCode = 2
}

async function corpusValidate() {
  console.log(JSON.stringify(await validateCorpus(required(args, "corpus")), null, 2))
}

async function corpusArchitecture() {
  console.log(JSON.stringify(await validateCorpusArchitecture(required(args, "corpus")), null, 2))
}

async function corpusDraft() {
  console.log(JSON.stringify(await validateCorpusDraft(required(args, "corpus")), null, 2))
}

async function corpusTaskMatrix() {
  console.log(JSON.stringify(await validateBookTaskMatrix(required(args, "corpus"), optional(args, "sealed")), null, 2))
}

async function humanReviewPrepare() {
  const run = (await readJson(resolve(required(args, "run")))) as RunFile
  const manifest = parseHumanReviewManifest(await readJson(resolve(required(args, "manifest"))))
  const packet = prepareReviewPacket(run, manifest, required(args, "reviewer"))
  const out = resolve(required(args, "out"))
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(out, { recursive: true })
  await writeJson(join(out, "packet.json"), packet)
  await writeFile(join(out, "review.html"), renderReviewHtml(packet))
  console.log(join(out, "review.html"))
}

async function humanReviewAssemble() {
  const primary = (await readJson(resolve(required(args, "primary")))) as RunFile
  const supplemental = (await readJson(resolve(required(args, "supplemental")))) as RunFile
  const manifest = parseHumanReviewManifest(await readJson(resolve(required(args, "manifest"))))
  const assembly = assembleHumanReviewRun(primary, supplemental, manifest)
  const out = resolve(required(args, "out"))
  await writeJson(join(out, "run.json"), assembly.run)
  await writeJson(join(out, "assembly.json"), assembly.receipt)
  console.log(join(out, "run.json"))
}

async function humanReviewAnalyze() {
  const manifest = parseHumanReviewManifest(await readJson(resolve(required(args, "manifest"))))
  const ratingPaths = values(args, "rating")
  if (!ratingPaths.length) throw new Error("human-review analyze requires at least one --rating")
  const submissions = await Promise.all(ratingPaths.map(async (path) => parseReviewSubmission(await readJson(resolve(path)))))
  const analysis = analyzeHumanReview(manifest, submissions, number(args, "bootstrap", 10_000))
  const out = resolve(required(args, "out"))
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(out, { recursive: true })
  await writeJson(join(out, "quantitative.json"), analysis)
  await writeFile(join(out, "quantitative.md"), renderHumanReviewAnalysis(analysis))
  console.log(join(out, "quantitative.md"))
  if (!analysis.complete) process.exitCode = 2
}

function doctor() {
  console.log(JSON.stringify({ node: process.version, protocolVersion: 1, platform: process.platform }, null, 2))
}

function parseArgs(input: string[]) {
  const output = new Map<string, string[]>()
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index]
    const value = input[index + 1]
    if (!key?.startsWith("--") || value === undefined) usage(1)
    output.set(key.slice(2), [...(output.get(key.slice(2)) ?? []), value])
  }
  return output
}

function required(input: Map<string, string[]>, key: string) {
  const value = input.get(key)?.at(-1)
  if (!value) throw new Error(`missing --${key}`)
  return value
}

function optional(input: Map<string, string[]>, key: string) {
  return input.get(key)?.at(-1)
}

function values(input: Map<string, string[]>, key: string) {
  return input.get(key) ?? []
}

function number(input: Map<string, string[]>, key: string, fallback: number) {
  return optionalNumber(input, key) ?? fallback
}

function optionalNumber(input: Map<string, string[]>, key: string) {
  const value = optional(input, key)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${key} must be a positive number`)
  return parsed
}

function usage(code: number): never {
  console.error(`writer-bench

  run --suite tasks.jsonl [--suite more.jsonl] --targets targets.json --out results [--trials 3] [--concurrency 3] [--context-mode full|controlled] [--task id] [--target id] [--resume previous/run.json] [--rerun-cell target:task]
  compare --run results/run.json --baseline raw --candidate harness --gates gates.json --out comparison
  import writingbench --source benchmark_all.jsonl --out writing.jsonl [--domain "Literature & Art"] [--language en]
  import constory --source prompts.jsonl --out constory.jsonl [--language en]
  attach-metrics --run results/run.json --source official-metrics.jsonl --out results/run-with-metrics.json
  audit-book-scale --run results/run.json --freeze experiments/book-scale-alpha3/authoritative-run.freeze.json --track primary|controlled --out audit
  corpus validate --corpus corpora/harbor-light
  corpus architecture --corpus corpora/saltglass-vigil
  corpus draft --corpus corpora/saltglass-vigil
  corpus task-matrix --corpus corpora/saltglass-vigil [--sealed path/to/sealed.jsonl]
  human-review prepare --run results/run.json --manifest manifest.json --reviewer reviewer-code --out packet
  human-review assemble --primary primary/run.json --supplemental public/run.json --manifest manifest.json --out composite
  human-review analyze --manifest manifest.json --rating reviewer-1.json [--rating reviewer-2.json] --out analysis [--bootstrap 10000]
  doctor`)
  process.exit(code)
}
