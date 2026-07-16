import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseTask, requireObject, requireString, type Check, type Job, type Task } from "./contracts.ts"
import { readJson, readJsonl } from "./io.ts"

const jobs: Job[] = ["explain", "diagnose", "plan", "revise"]
const splits = ["development", "validation", "sealed"] as const
const coverageNames = ["long-range", "temporal", "distractor", "ambiguous", "human-review", "controlled-context"]

export async function validateBookTaskMatrix(corpusPath: string, sealedPath?: string) {
  const root = resolve(corpusPath)
  const state = await loadBookState(root)
  const config = requireObject(await readJson(resolve(root, "task-matrix.json")), "task matrix")
  const suite = requireString(config.suite, "task matrix suite")
  const version = requireString(config.version, "task matrix version")
  const publicFiles = stringArray(config.publicFiles, "task matrix publicFiles")
  const sealed = requireObject(config.sealed, "task matrix sealed")
  const sealedCount = positiveInteger(sealed.count, "task matrix sealed count")
  const sealedHash = requireString(sealed.sha256, "task matrix sealed sha256")
  if (!/^[0-9a-f]{64}$/.test(sealedHash))
    throw new Error("task matrix sealed sha256 must be a lowercase SHA-256 digest")

  const publicTasks = (await Promise.all(publicFiles.map((path) => readJsonl(resolve(root, path)))))
    .flat()
    .map(parseTask)
  validateTasks(publicTasks, suite, version, new Set(["development", "validation"]), state)
  const publicSummary = summarize(publicTasks)
  expect(publicSummary.total, 72, "public task total")
  expect(publicSummary.splits.development, 36, "development task count")
  expect(publicSummary.splits.validation, 36, "validation task count")
  expect(publicSummary.jobs.explain, 14, "public explain count")
  expect(publicSummary.jobs.diagnose, 20, "public diagnose count")
  expect(publicSummary.jobs.plan, 14, "public plan count")
  expect(publicSummary.jobs.revise, 24, "public revise count")
  expect(publicSummary.variantDiagnoses, 14, "public variant diagnosis count")
  expect(publicSummary.cleanControls, 6, "public clean control count")

  if (!sealedPath) return { ...publicSummary, sealedCount, sealedSha256: sealedHash, sealedValidated: false }

  const sealedText = (await readFile(resolve(sealedPath), "utf8")).replaceAll("\r\n", "\n")
  const actualHash = createHash("sha256").update(sealedText).digest("hex")
  if (actualHash !== sealedHash)
    throw new Error(`sealed task hash ${actualHash} does not match frozen receipt ${sealedHash}`)
  const sealedTasks = sealedText
    .split("\n")
    .filter(Boolean)
    .map((line) => parseTask(JSON.parse(line)))
  expect(sealedTasks.length, sealedCount, "sealed task count")
  validateTasks(sealedTasks, suite, version, new Set(["sealed"]), state)

  const all = [...publicTasks, ...sealedTasks]
  validateUniqueIds(all)
  const summary = summarize(all)
  const expected = requireObject(config.expected, "task matrix expected")
  expect(summary.total, positiveInteger(expected.total, "expected total"), "task total")
  expectCounts(summary.splits, requireObject(expected.splits, "expected splits"), "split")
  expectCounts(summary.jobs, requireObject(expected.jobs, "expected jobs"), "job")
  const minima = requireObject(expected.minimumCoverage, "expected minimumCoverage")
  for (const name of ["long-range", "temporal", "distractor", "ambiguous", "human-review"]) {
    const minimum = positiveInteger(minima[name], `minimum coverage ${name}`)
    if ((summary.coverage[name] ?? 0) < minimum)
      throw new Error(`${name} coverage is ${summary.coverage[name] ?? 0}; expected at least ${minimum}`)
  }
  expect(
    summary.coverage["controlled-context"],
    positiveInteger(expected.controlledContext, "controlled context count"),
    "controlled-context count",
  )
  expect(
    summary.variantDiagnoses,
    positiveInteger(expected.variantDiagnoses, "variant diagnosis count"),
    "variant diagnosis count",
  )
  expect(summary.cleanControls, positiveInteger(expected.cleanControls, "clean control count"), "clean control count")
  return { ...summary, sealedCount, sealedSha256: sealedHash, sealedValidated: true }
}

type BookState = {
  passages: Map<string, string>
  variantIds: Set<string>
  intentionIds: Set<string>
}

function validateTasks(tasks: Task[], suite: string, version: string, allowedSplits: Set<string>, state: BookState) {
  validateUniqueIds(tasks)
  for (const task of tasks) {
    if (task.suite !== suite || task.suiteVersion !== version || task.source !== "native:saltglass-vigil") {
      throw new Error(`${task.id} has the wrong suite, version, or source`)
    }
    if (!jobs.includes(task.job)) throw new Error(`${task.id} uses non-book-scale job ${task.job}`)
    const book = requireObject(
      requireObject(task.metadata, `${task.id}.metadata`).bookScale,
      `${task.id}.metadata.bookScale`,
    )
    const split = requireString(book.split, `${task.id}.split`)
    if (!allowedSplits.has(split)) throw new Error(`${task.id} has unexpected split ${split}`)
    const coverage = stringArray(book.coverage, `${task.id}.coverage`)
    if (coverage.some((value) => !coverageNames.includes(value)))
      throw new Error(`${task.id} has unknown coverage marker`)
    const distractors = stringArray(book.distractorRefs, `${task.id}.distractorRefs`)
    validateReferences(task, distractors, state)
    if (coverage.includes("temporal") && !task.contextSpec?.throughRef)
      throw new Error(`${task.id} lacks a temporal boundary`)
    if (coverage.includes("temporal")) validateTemporalBoundary(task)
    if (coverage.includes("distractor") && !distractors.length) {
      throw new Error(`${task.id} lacks declared distractors`)
    }
    if (coverage.includes("distractor") && distractors.some((ref) => !task.contextSpec?.dependencyRefs?.includes(ref)))
      throw new Error(`${task.id} does not admit every declared distractor`)
    if (coverage.includes("ambiguous") && typeof book.intentionId !== "string")
      throw new Error(`${task.id} lacks an intentionId`)
    if (typeof book.intentionId === "string" && !state.intentionIds.has(book.intentionId))
      throw new Error(`${task.id} uses unknown intention ${book.intentionId}`)
    if (typeof book.variantId === "string" && !state.variantIds.has(book.variantId))
      throw new Error(`${task.id} uses unknown variant ${book.variantId}`)
    if (coverage.includes("human-review") && !["plan", "revise"].includes(task.job))
      throw new Error(`${task.id} is ineligible for human review`)
    if (coverage.includes("long-range") && !hasLongRange(task))
      throw new Error(`${task.id} lacks evidence separated by four chapters`)
    if (task.job === "diagnose") validateDiagnose(task, book)
    if (task.job === "revise") validateRevise(task)
  }
}

function validateReferences(task: Task, distractors: string[], state: BookState) {
  const spec = task.contextSpec
  if (!spec) throw new Error(`${task.id} lacks a book-scale context specification`)
  const refs = [
    ...spec.focusRefs,
    ...(spec.dependencyRefs ?? []),
    ...(spec.preservationRefs ?? []),
    ...(spec.excludeRefs ?? []),
    ...(spec.throughRef ? [spec.throughRef] : []),
    ...distractors,
  ]
  for (const ref of refs) if (!state.passages.has(ref)) throw new Error(`${task.id} references missing passage ${ref}`)
  for (const literal of spec.preservationLiterals ?? []) {
    if (!state.passages.get(literal.ref)?.includes(literal.text))
      throw new Error(`${task.id} preservation literal is absent from ${literal.ref}`)
  }
  const requiredEvidence = task.checks?.find(
    (check): check is Extract<Check, { kind: "evidence" }> =>
      check.kind === "evidence" && check.id === "required-evidence",
  )
  if (requiredEvidence && distractors.some((ref) => requiredEvidence.required.includes(ref)))
    throw new Error(`${task.id} marks required evidence as a distractor`)
}

function validateTemporalBoundary(task: Task) {
  const through = task.contextSpec!.throughRef!
  const admitted = [
    ...task.contextSpec!.focusRefs,
    ...(task.contextSpec!.dependencyRefs ?? []),
    ...(task.contextSpec!.preservationRefs ?? []),
  ]
  if (admitted.some((ref) => compareRefs(ref, through) > 0))
    throw new Error(`${task.id} admits evidence after temporal boundary ${through}`)
}

function compareRefs(left: string, right: string) {
  const parse = (ref: string) => /^ch(\d+):p(\d+)$/.exec(ref)?.slice(1).map(Number) ?? [Number.NaN, Number.NaN]
  const [leftChapter, leftPassage] = parse(left)
  const [rightChapter, rightPassage] = parse(right)
  return leftChapter === rightChapter ? leftPassage - rightPassage : leftChapter - rightChapter
}

function validateDiagnose(task: Task, book: Record<string, unknown>) {
  const variant = typeof book.variantId === "string"
  const control = typeof book.intentionId === "string"
  if (variant === control) throw new Error(`${task.id} must be exactly one of planted variant or clean control`)
  if (task.authority !== "read" || !task.checks?.some((check) => check.kind === "no_edits")) {
    throw new Error(`${task.id} must remain read-only`)
  }
}

function validateRevise(task: Task) {
  const spec = task.contextSpec
  if (
    task.authority !== "propose" ||
    !spec?.focusRefs.length ||
    !spec.preservationRefs?.length ||
    !spec.preservationLiterals?.length ||
    !spec.throughRef
  ) {
    throw new Error(`${task.id} lacks exact scope, preservation, or temporal preconditions`)
  }
  const requirements = new Set(
    task.checks?.filter((check) => check.kind === "proposal").map((check) => check.requirement),
  )
  for (const requirement of ["valid", "preconditions", "preservation", "uncommitted"]) {
    if (!requirements.has(requirement as never)) throw new Error(`${task.id} lacks proposal ${requirement} gate`)
  }
  const scope = task.checks?.find(
    (check): check is Extract<Check, { kind: "edit_scope" }> => check.kind === "edit_scope",
  )
  if (!scope || [...scope.allowed].sort().join() !== [...spec.focusRefs].sort().join())
    throw new Error(`${task.id} edit scope does not match focus refs`)
  const grounding = task.checks?.find(
    (check): check is Extract<Check, { kind: "evidence" }> =>
      check.kind === "evidence" && check.id === "citation-grounding",
  )
  const missingPreservation = spec.preservationRefs.filter((ref) => !grounding?.allowed?.includes(ref))
  if (missingPreservation.length) {
    throw new Error(`${task.id} grounding disallows required preservation refs: ${missingPreservation.join(", ")}`)
  }
  if (!/do not (?:apply or )?commit/i.test(task.prompt))
    throw new Error(`${task.id} lacks an explicit no-commit instruction`)
}

function hasLongRange(task: Task) {
  const focus = task.contextSpec?.focusRefs ?? []
  const dependencies = task.contextSpec?.dependencyRefs ?? []
  return focus.some((left) => dependencies.some((right) => Math.abs(chapter(left) - chapter(right)) >= 4))
}

function chapter(ref: string) {
  const match = /^ch(\d+):/.exec(ref)
  return match ? Number(match[1]) : Number.NaN
}

async function loadBookState(root: string): Promise<BookState> {
  const manifest = requireObject(await readJson(resolve(root, "corpus.json")), "corpus")
  const passages = new Map<string, string>()
  for (const relative of stringArray(manifest.manuscript, "corpus manuscript")) {
    const content = await readFile(resolve(root, relative), "utf8")
    for (const match of content.matchAll(
      /<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs,
    )) {
      passages.set(match[1]!, match.groups!.text.trim())
    }
  }
  const variantIds = new Set<string>()
  for (const relative of stringArray(manifest.variants ?? [], "corpus variants")) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const record = requireObject(value, `${relative} record`)
      variantIds.add(requireString(record.id, `${relative}.id`))
    }
  }
  const intentionIds = new Set<string>()
  for (const relative of stringArray(manifest.gold, "corpus gold")) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const record = requireObject(value, `${relative} record`)
      const id = requireString(record.id, `${relative}.id`)
      if (id.startsWith("intent:")) intentionIds.add(id)
    }
  }
  return { passages, variantIds, intentionIds }
}

function summarize(tasks: Task[]) {
  const splitValues = tasks.map((task) => String((task.metadata?.bookScale as Record<string, unknown>)?.split))
  const coverageValues = tasks.flatMap(
    (task) => ((task.metadata?.bookScale as Record<string, unknown>)?.coverage as string[]) ?? [],
  )
  return {
    total: tasks.length,
    splits: countValues(splitValues, splits),
    jobs: countValues(
      tasks.map((task) => task.job),
      jobs,
    ),
    coverage: countValues(coverageValues, coverageNames),
    variantDiagnoses: tasks.filter(
      (task) => typeof (task.metadata?.bookScale as Record<string, unknown>)?.variantId === "string",
    ).length,
    cleanControls: tasks.filter(
      (task) =>
        task.job === "diagnose" &&
        typeof (task.metadata?.bookScale as Record<string, unknown>)?.intentionId === "string",
    ).length,
  }
}

function countValues(values: readonly string[], keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<
    string,
    number
  >
}

function validateUniqueIds(tasks: Task[]) {
  const ids = tasks.map((task) => task.id)
  if (new Set(ids).size !== ids.length) throw new Error("book task matrix has duplicate task ids")
}

function expectCounts(actual: Record<string, number>, expected: Record<string, unknown>, label: string) {
  for (const [key, value] of Object.entries(expected))
    expect(actual[key], positiveInteger(value, `expected ${label} ${key}`), `${label} ${key}`)
}

function expect(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label} is ${actual}; expected ${expected}`)
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer`)
  return value as number
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error(`${label} must be an array of strings`)
  return value as string[]
}
