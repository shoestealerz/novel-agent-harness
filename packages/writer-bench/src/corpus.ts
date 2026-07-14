import { readFile } from "node:fs/promises"
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
  minimumWords: number
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
    for (const match of content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs)) {
      passageText.set(match[1]!, match.groups!.text.trim())
    }
    wordCount += content
      .replaceAll(/<!--.*?-->/gs, " ")
      .replaceAll(/^#.*$/gm, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
  }
  if (wordCount < manifest.minimumWords) throw new Error(`corpus has ${wordCount} words; expected at least ${manifest.minimumWords}`)

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
        if (task.contextSpec) throw new Error(`${relative}:${task.id} cannot declare both contextSpec and retrievalSpec`)
        if (!Number.isInteger(task.retrievalSpec.topK) || task.retrievalSpec.topK < 1) {
          throw new Error(`${relative}:${task.id} retrieval topK must be a positive integer`)
        }
        task.retrievalSpec.focusRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        task.retrievalSpec.preservationRefs?.forEach((ref) => requirePassage(passages, ref, `${relative}:${task.id}`))
        if (task.retrievalSpec.throughRef) requirePassage(passages, task.retrievalSpec.throughRef, `${relative}:${task.id}`)
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
        if (required.some((ref) => !relevant.includes(ref))) throw new Error(`${relative}:${task.id} retrieval required refs must be relevant`)
      }
      if (task.job === "revise") {
        task.context?.filter((item) => item.kind === "manuscript").forEach((item) => {
          if (item.text.trim() !== passageText.get(item.ref)) {
            throw new Error(`${relative}:${task.id} must supply exact manuscript text for revision context ${item.ref}`)
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
    passages: passages.size,
    goldRecords,
    tasks: tasks.length,
    jobs: Object.fromEntries([...new Set(tasks.map((task) => task.job))].map((job) => [job, tasks.filter((task) => task.job === job).length])),
    root: dirname(resolve(root, "corpus.json")),
  }
}

function parseManifest(value: unknown): CorpusManifest {
  const input = requireObject(value, "corpus manifest")
  if (typeof input.minimumWords !== "number" || input.minimumWords < 1) throw new Error("corpus.minimumWords must be positive")
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
    minimumWords: input.minimumWords,
  }
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`)
  }
  return value
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
