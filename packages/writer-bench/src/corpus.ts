import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { parseTask, requireObject, requireString, type Check, type Task } from "./contracts.ts"
import { readJson, readJsonl } from "./io.ts"

type CorpusManifest = {
  id: string
  version: string
  title: string
  status: string
  license: string
  provenance: string
  manuscript: string[]
  gold: string[]
  tasks: string[]
  variants: string[]
  minimumWords: number
  maximumWords?: number
  minimumPassages?: number
  expectedChapters?: number
}

type ArchitectureRecord = {
  id: string
  [key: string]: unknown
}

type ChapterArchitecture = ArchitectureRecord & {
  number: number
  day: number
  pov: string
  locations: string[]
}

export async function validateCorpus(path: string) {
  const root = resolve(path)
  const manifest = parseManifest(await readJson(resolve(root, "corpus.json")))
  const passages = new Set<string>()
  const passageText = new Map<string, string>()
  let wordCount = 0
  for (const relative of manifest.manuscript) {
    const content = await readFile(resolve(root, relative), "utf8")
    const refs = [...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->/g)].map((match) => match[1]!)
    if (!refs.length) throw new Error(`${relative} has no passage references`)
    refs.forEach((ref) => {
      if (passages.has(ref)) throw new Error(`duplicate passage reference: ${ref}`)
      passages.add(ref)
    })
    for (const match of content.matchAll(
      /<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs,
    )) {
      passageText.set(match[1]!, match.groups!.text.trim())
    }
    wordCount += manuscriptWordCount(content)
  }
  if (wordCount < manifest.minimumWords)
    throw new Error(`corpus has ${wordCount} words; expected at least ${manifest.minimumWords}`)
  if (manifest.maximumWords && wordCount > manifest.maximumWords) {
    throw new Error(`corpus has ${wordCount} words; expected at most ${manifest.maximumWords}`)
  }
  if (manifest.minimumPassages && passages.size < manifest.minimumPassages) {
    throw new Error(`corpus has ${passages.size} passages; expected at least ${manifest.minimumPassages}`)
  }
  if (manifest.expectedChapters && manifest.manuscript.length !== manifest.expectedChapters) {
    throw new Error(`corpus has ${manifest.manuscript.length} chapters; expected ${manifest.expectedChapters}`)
  }

  const goldIds = new Set<string>()
  let goldRecords = 0
  for (const relative of manifest.gold) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const record = requireObject(value, `${relative} record`)
      const id = requireString(record.id, `${relative}.id`)
      if (goldIds.has(id)) throw new Error(`duplicate gold id: ${id}`)
      goldIds.add(id)
      passageRefs(record).forEach((ref) => requirePassage(passages, ref, `${relative}:${id}`))
      goldRecords++
    }
  }

  const variantIds = new Set<string>()
  const variantCategories = new Map<string, number>()
  for (const relative of manifest.variants) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const record = requireObject(value, `${relative} record`)
      const id = requireString(record.id, `${relative}.id`)
      if (variantIds.has(id)) throw new Error(`duplicate variant id: ${id}`)
      variantIds.add(id)
      const category = requireString(record.category, `${relative}:${id}.category`)
      if (!["factual", "temporal", "spatial", "causal", "emotional", "knowledge", "voice"].includes(category)) {
        throw new Error(`${relative}:${id} has unknown variant category ${category}`)
      }
      variantCategories.set(category, (variantCategories.get(category) ?? 0) + 1)
      const sourceRef = requireString(record.sourceRef, `${relative}:${id}.sourceRef`)
      requirePassage(passages, sourceRef, `${relative}:${id}`)
      const source = passageText.get(sourceRef)!
      const sourceSha256 = requireString(record.sourceSha256, `${relative}:${id}.sourceSha256`)
      if (!/^[0-9a-f]{64}$/.test(sourceSha256)) {
        throw new Error(`${relative}:${id}.sourceSha256 must be a lowercase SHA-256 digest`)
      }
      const actualHash = createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex")
      if (sourceSha256 !== actualHash) throw new Error(`${relative}:${id} has a stale source hash for ${sourceRef}`)
      const operation = requireObject(record.operation, `${relative}:${id}.operation`)
      const match = requireString(operation.match, `${relative}:${id}.operation.match`)
      const replacement = requireString(operation.replacement, `${relative}:${id}.operation.replacement`)
      requireString(record.description, `${relative}:${id}.description`)
      if (requireString(record.expectedDisposition, `${relative}:${id}.expectedDisposition`) !== "flag") {
        throw new Error(`${relative}:${id}.expectedDisposition must be flag`)
      }
      if (match === replacement) throw new Error(`${relative}:${id} replacement must change the source`)
      if (source.split(match).length - 1 !== 1) {
        throw new Error(`${relative}:${id} match must occur exactly once in ${sourceRef}`)
      }
    }
  }

  const taskIds = new Set<string>()
  const tasks: Task[] = []
  for (const relative of manifest.tasks) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const task = parseTask(value)
      if (taskIds.has(task.id)) throw new Error(`duplicate task id: ${task.id}`)
      taskIds.add(task.id)
      task.context?.forEach((item) => requirePassage(passages, item.ref, `${relative}:${task.id}`))
      task.contextSpec?.focusRefs.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
      task.contextSpec?.dependencyRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
      task.contextSpec?.preservationRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
      task.contextSpec?.preservationLiterals?.forEach((literal) => {
        requirePassage(passages, literal.ref, `${relative}:${task.id}`)
        if (!task.contextSpec?.preservationRefs?.includes(literal.ref)) {
          throw new Error(`${relative}:${task.id} exact preservation literal must use a preservation reference`)
        }
        if (!passageText.get(literal.ref)?.includes(literal.text)) {
          throw new Error(`${relative}:${task.id} exact preservation literal is absent from ${literal.ref}`)
        }
      })
      task.contextSpec?.excludeRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
      if (task.contextSpec?.throughRef) requirePassage(passages, task.contextSpec.throughRef, `${relative}:${task.id}`)
      if (task.retrievalSpec) {
        if (task.contextSpec)
          throw new Error(`${relative}:${task.id} cannot declare both contextSpec and retrievalSpec`)
        if (!Number.isInteger(task.retrievalSpec.topK) || task.retrievalSpec.topK < 1) {
          throw new Error(`${relative}:${task.id} retrieval topK must be a positive integer`)
        }
        task.retrievalSpec.focusRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        task.retrievalSpec.preservationRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        if (task.retrievalSpec.throughRef)
          requirePassage(passages, task.retrievalSpec.throughRef, `${relative}:${task.id}`)
        task.retrievalSpec.preservationLiterals?.forEach((literal) => {
          requirePassage(passages, literal.ref, `${relative}:${task.id}`)
          if (!task.retrievalSpec?.preservationRefs?.includes(literal.ref)) {
            throw new Error(`${relative}:${task.id} retrieval literal must use a preservation reference`)
          }
          if (!passageText.get(literal.ref)?.includes(literal.text)) {
            throw new Error(`${relative}:${task.id} retrieval literal is absent from ${literal.ref}`)
          }
        })
        const gold = requireObject(task.metadata?.retrievalGold, `${relative}:${task.id}.metadata.retrievalGold`)
        const required = requireStringArray(gold.requiredRefs, `${relative}:${task.id}.retrievalGold.requiredRefs`)
        const relevant = requireStringArray(gold.relevantRefs, `${relative}:${task.id}.retrievalGold.relevantRefs`)
        required.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        relevant.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        if (required.some((ref) => !relevant.includes(ref)))
          throw new Error(`${relative}:${task.id} retrieval required refs must be relevant`)
      }
      if (task.job === "revise") {
        task.context
          ?.filter((item) => item.kind === "manuscript")
          .forEach((item) => {
            if (item.text.trim() !== passageText.get(item.ref)) {
              throw new Error(
                `${relative}:${task.id} must supply exact manuscript text for revision context ${item.ref}`,
              )
            }
          })
      }
      task.checks?.flatMap(checkRefs).forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
      tasks.push(task)
    }
  }
  return {
    corpus: manifest.id,
    version: manifest.version,
    status: manifest.status,
    license: manifest.license,
    wordCount,
    chapters: manifest.manuscript.length,
    passages: passages.size,
    goldRecords,
    variants: variantIds.size,
    variantCategories: Object.fromEntries(variantCategories),
    tasks: tasks.length,
    jobs: Object.fromEntries(
      [...new Set(tasks.map((task) => task.job))].map((job) => [job, tasks.filter((task) => task.job === job).length]),
    ),
    root: dirname(resolve(root, "corpus.json")),
  }
}

export async function validateCorpusArchitecture(path: string) {
  const root = resolve(path)
  const architectureBytes = await readFile(resolve(root, "architecture.json"))
  const expectedHash = (await readFile(resolve(root, "architecture.sha256"), "utf8")).trim().split(/\s+/)[0]
  const architectureText = architectureBytes.toString("utf8").replaceAll("\r\n", "\n")
  const actualHash = createHash("sha256").update(architectureText).digest("hex")
  if (expectedHash !== actualHash) throw new Error("architecture.sha256 does not match architecture.json")

  const input = requireObject(JSON.parse(architectureText), "corpus architecture")
  const target = requireObject(input.target, "architecture.target")
  const wordRange = requireNumberPair(target.words, "architecture.target.words")
  if (wordRange[0] < 30_000 || wordRange[1] > 50_000 || wordRange[0] >= wordRange[1]) {
    throw new Error("architecture.target.words must be an increasing range within 30000-50000")
  }
  const chapterRange = requireNumberPair(target.chapters, "architecture.target.chapters")
  if (chapterRange[0] < 12 || chapterRange[1] > 16) throw new Error("architecture.target.chapters must be within 12-16")
  if (requirePositiveInteger(target.minimumPassages, "architecture.target.minimumPassages") < 240) {
    throw new Error("architecture.target.minimumPassages must be at least 240")
  }
  if (requirePositiveInteger(target.storyDays, "architecture.target.storyDays") < 7) {
    throw new Error("architecture.target.storyDays must be at least 7")
  }

  const povs = requireRecords(input.povs, "architecture.povs")
  const characters = requireRecords(input.characters, "architecture.characters")
  const locations = requireRecords(input.locations, "architecture.locations")
  const objects = requireRecords(input.objects, "architecture.objects")
  const rules = requireRecords(input.worldRules, "architecture.worldRules")
  const arcs = requireRecords(input.arcs, "architecture.arcs")
  const checkpoints = requireRecords(input.knowledgeCheckpoints, "architecture.knowledgeCheckpoints")
  const ambiguities = requireRecords(input.intentionalAmbiguities, "architecture.intentionalAmbiguities")
  const defects = requireRecords(input.variantDefects, "architecture.variantDefects")
  const dependencies = requireRecords(input.dependencies, "architecture.dependencies")
  const chapters = requireChapters(input.chapters)
  ;[
    [povs, "POV"],
    [characters, "character"],
    [locations, "location"],
    [objects, "object"],
    [rules, "world rule"],
    [arcs, "arc"],
    [checkpoints, "knowledge checkpoint"],
    [ambiguities, "intentional ambiguity"],
    [defects, "variant defect"],
    [dependencies, "dependency"],
    [chapters, "chapter"],
  ].forEach(([records, label]) => requireUniqueIds(records as ArchitectureRecord[], label as string))

  if (povs.length < 2) throw new Error("architecture requires at least two POVs")
  if (characters.length < 8) throw new Error("architecture requires at least eight recurring characters")
  if (locations.length < 3) throw new Error("architecture requires at least three locations")
  if (objects.length < 4) throw new Error("architecture requires at least four consequential objects")
  if (rules.length < 6) throw new Error("architecture requires at least six world rules")
  if (checkpoints.length < 5) throw new Error("architecture requires at least five knowledge checkpoints")
  if (ambiguities.length < 12) throw new Error("architecture requires at least twelve intentional ambiguities")
  const defectCategories = new Set(defects.map((item) => requireString(item.category, `${item.id}.category`)))
  ;["factual", "temporal", "spatial", "causal", "emotional", "knowledge", "voice"].forEach((category) => {
    if (!defectCategories.has(category)) throw new Error(`architecture requires a ${category} variant defect`)
  })

  const arcTypes = arcs.map((arc) => requireString(arc.type, `${arc.id}.type`))
  if (arcTypes.filter((type) => type === "character").length < 3)
    throw new Error("architecture requires three character arcs")
  if (arcTypes.filter((type) => type === "relationship").length < 2)
    throw new Error("architecture requires two relationship arcs")
  if (!arcTypes.includes("external")) throw new Error("architecture requires an external plot arc")
  if (chapters.length < chapterRange[0] || chapters.length > chapterRange[1]) {
    throw new Error(`architecture has ${chapters.length} chapters outside its target range`)
  }
  const chapterIds = new Set(chapters.map((chapter) => chapter.id))
  const povIds = new Set(povs.map((pov) => pov.id))
  const locationIds = new Set(locations.map((location) => location.id))
  chapters.forEach((chapter, index) => {
    if (chapter.number !== index + 1) throw new Error(`chapter ${chapter.id} is not sequential`)
    if (!povIds.has(chapter.pov)) throw new Error(`chapter ${chapter.id} references unknown POV ${chapter.pov}`)
    chapter.locations.forEach((location) => {
      if (!locationIds.has(location)) throw new Error(`chapter ${chapter.id} references unknown location ${location}`)
    })
  })
  if (new Set(chapters.map((chapter) => chapter.day)).size < 7)
    throw new Error("chapters must span at least seven distinct story days")
  dependencies.forEach((dependency) => {
    const setup = requireString(dependency.setupChapter, `${dependency.id}.setupChapter`)
    const payoff = requireString(dependency.payoffChapter, `${dependency.id}.payoffChapter`)
    if (!chapterIds.has(setup) || !chapterIds.has(payoff))
      throw new Error(`${dependency.id} references an unknown chapter`)
    const setupNumber = chapters.find((chapter) => chapter.id === setup)!.number
    const payoffNumber = chapters.find((chapter) => chapter.id === payoff)!.number
    if (payoffNumber - setupNumber < 4)
      throw new Error(`${dependency.id} payoff must be at least four chapters after setup`)
  })

  return {
    corpus: requireString(input.id, "architecture.id"),
    version: requireString(input.version, "architecture.version"),
    title: requireString(input.title, "architecture.title"),
    status: requireString(input.status, "architecture.status"),
    license: requireString(input.license, "architecture.license"),
    architectureHash: actualHash,
    targetWords: wordRange,
    chapters: chapters.length,
    povs: povs.length,
    characters: characters.length,
    locations: locations.length,
    objects: objects.length,
    worldRules: rules.length,
    arcs: Object.fromEntries(
      [...new Set(arcTypes)].map((type) => [type, arcTypes.filter((item) => item === type).length]),
    ),
    knowledgeCheckpoints: checkpoints.length,
    intentionalAmbiguities: ambiguities.length,
    variantDefects: Object.fromEntries(
      [...defectCategories].map((category) => [category, defects.filter((item) => item.category === category).length]),
    ),
    longRangeDependencies: dependencies.length,
  }
}

export async function validateCorpusDraft(path: string) {
  const root = resolve(path)
  const architecture = await validateCorpusArchitecture(root)
  const input = requireObject(await readJson(resolve(root, "architecture.json")), "corpus architecture")
  const target = requireObject(input.target, "architecture.target")
  const wordRange = requireNumberPair(target.chapterWords, "architecture.target.chapterWords")
  const passageRange = requireNumberPair(target.chapterPassages, "architecture.target.chapterPassages")
  const chapters = requireChapters(input.chapters)
  const files = (await readdir(resolve(root, "manuscript"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^ch\d{2}\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (!files.length) throw new Error("corpus draft has no manuscript chapters")
  if (files.length > chapters.length) throw new Error("corpus draft has more manuscript files than planned chapters")

  const summaries = await Promise.all(
    files.map(async (file, index) => {
      const chapter = chapters[index]!
      if (file !== `${chapter.id}.md`) throw new Error(`expected ${chapter.id}.md but found ${file}`)
      const content = await readFile(resolve(root, "manuscript", file), "utf8")
      const refs = [...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->/g)].map((match) => match[1]!)
      if (refs.length < passageRange[0] || refs.length > passageRange[1]) {
        throw new Error(`${file} has ${refs.length} passages outside target range`)
      }
      refs.forEach((ref, passage) => {
        const expected = `${chapter.id}:p${String(passage + 1).padStart(3, "0")}`
        if (ref !== expected) throw new Error(`${file} expected passage ${expected} but found ${ref}`)
      })
      const words = manuscriptWordCount(content)
      if (words < wordRange[0] || words > wordRange[1])
        throw new Error(`${file} has ${words} words outside target range`)
      return { chapter: chapter.id, pov: chapter.pov, day: chapter.day, words, passages: refs.length }
    }),
  )

  return {
    corpus: architecture.corpus,
    version: architecture.version,
    architectureHash: architecture.architectureHash,
    draftedChapters: summaries.length,
    plannedChapters: chapters.length,
    complete: summaries.length === chapters.length,
    wordCount: summaries.reduce((total, chapter) => total + chapter.words, 0),
    passages: summaries.reduce((total, chapter) => total + chapter.passages, 0),
    chapters: summaries,
  }
}

function parseManifest(value: unknown): CorpusManifest {
  const input = requireObject(value, "corpus manifest")
  if (typeof input.minimumWords !== "number" || input.minimumWords < 1)
    throw new Error("corpus.minimumWords must be positive")
  if (typeof input.maximumWords === "number" && input.maximumWords < input.minimumWords) {
    throw new Error("corpus.maximumWords must not be less than corpus.minimumWords")
  }
  return {
    id: requireString(input.id, "corpus.id"),
    version: requireString(input.version, "corpus.version"),
    title: requireString(input.title, "corpus.title"),
    status: requireString(input.status, "corpus.status"),
    license: requireString(input.license, "corpus.license"),
    provenance: requireString(input.provenance, "corpus.provenance"),
    manuscript: requireStringArray(input.manuscript, "corpus.manuscript"),
    gold: requireStringArray(input.gold, "corpus.gold"),
    tasks: requireStringArray(input.tasks, "corpus.tasks"),
    variants: input.variants === undefined ? [] : requireStringArray(input.variants, "corpus.variants"),
    minimumWords: input.minimumWords,
    maximumWords: optionalPositiveInteger(input.maximumWords, "corpus.maximumWords"),
    minimumPassages: optionalPositiveInteger(input.minimumPassages, "corpus.minimumPassages"),
    expectedChapters: optionalPositiveInteger(input.expectedChapters, "corpus.expectedChapters"),
  }
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`)
  }
  return value
}

function requireRecords(value: unknown, label: string): ArchitectureRecord[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((item, index) => {
    const record = requireObject(item, `${label}[${index}]`)
    return { ...record, id: requireString(record.id, `${label}[${index}].id`) } as ArchitectureRecord
  })
}

function requireChapters(value: unknown) {
  return requireRecords(value, "architecture.chapters").map((chapter) => ({
    ...chapter,
    number: requirePositiveInteger(chapter.number, `${chapter.id}.number`),
    day: requirePositiveInteger(chapter.day, `${chapter.id}.day`),
    pov: requireString(chapter.pov, `${chapter.id}.pov`),
    locations: requireStringArray(chapter.locations, `${chapter.id}.locations`),
  })) as ChapterArchitecture[]
}

function requireNumberPair(value: unknown, label: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => Number.isInteger(item) && item > 0)) {
    throw new Error(`${label} must contain two positive integers`)
  }
  return [value[0], value[1]]
}

function requirePositiveInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer`)
  return value as number
}

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === undefined) return undefined
  return requirePositiveInteger(value, label)
}

function requireUniqueIds(records: ArchitectureRecord[], label: string) {
  const ids = records.map((record) => record.id)
  if (new Set(ids).size !== ids.length) throw new Error(`architecture has duplicate ${label} ids`)
}

function manuscriptWordCount(content: string) {
  return content
    .replaceAll(/<!--.*?-->/gs, " ")
    .replaceAll(/^#.*$/gm, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function passageRefs(record: Record<string, unknown>) {
  return [
    ...(Array.isArray(record.evidence) ? record.evidence : []),
    ...(Array.isArray(record.scopeRefs) ? record.scopeRefs : []),
    ...(typeof record.afterRef === "string" ? [record.afterRef] : []),
  ].filter((value): value is string => typeof value === "string")
}

function checkRefs(check: Check) {
  if (check.kind === "evidence") return [...check.required, ...(check.allowed ?? [])]
  if (check.kind === "edit_scope") return check.allowed
  return []
}

function requirePassage(passages: Set<string>, ref: string, owner: string) {
  if (!passages.has(ref)) throw new Error(`${owner} references missing passage ${ref}`)
}
