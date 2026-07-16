import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, parse, resolve } from "node:path"
import type { ContextItem, Task } from "./contracts.ts"
import { requireObject, requireString } from "./contracts.ts"
import { readJson, readJsonl } from "./io.ts"

export type NativeContextMode = "full" | "controlled"

type NativeCorpus = {
  id: string
  version: string
  passages: ContextItem[]
  variants: Map<string, Variant>
}

type Variant = {
  id: string
  sourceRef: string
  sourceSha256: string
  match: string
  replacement: string
}

export async function materializeNativeTasks(
  tasks: Task[],
  suiteFile: string,
  mode: NativeContextMode = "full",
) {
  if (mode !== "full" && mode !== "controlled") throw new Error(`unsupported native context mode: ${mode}`)
  const corpora = new Map<string, Promise<NativeCorpus>>()
  return Promise.all(
    tasks.map(async (task) => {
      const id = nativeSourceID(task.source)
      if (!id || task.context?.length) return task
      if (mode === "controlled" && !task.tags?.includes("controlled-context")) {
        throw new Error(`${task.id} is not preregistered for the controlled-context track`)
      }
      const corpus = await cachedCorpus(corpora, id, suiteFile)
      const variantID = bookScaleString(task, "variantId")
      const passages = applyVariant(corpus.passages, variantID ? requiredVariant(corpus, variantID) : undefined)
      const bounded = boundPassages(passages, task.contextSpec?.throughRef)
      const context = mode === "controlled" ? controlledPassages(bounded, task) : bounded
      if (!context.length) throw new Error(`${task.id} materialized an empty native manuscript`)
      return {
        ...task,
        context,
        metadata: {
          ...task.metadata,
          nativeContext: {
            corpus: corpus.id,
            corpusVersion: corpus.version,
            mode,
            contextItems: context.length,
            throughRef: task.contextSpec?.throughRef,
            variantId: variantID,
          },
        },
      }
    }),
  )
}

function cachedCorpus(cache: Map<string, Promise<NativeCorpus>>, id: string, suiteFile: string) {
  const existing = cache.get(id)
  if (existing) return existing
  const loaded = loadNativeCorpus(id, suiteFile)
  cache.set(id, loaded)
  return loaded
}

async function loadNativeCorpus(id: string, suiteFile: string): Promise<NativeCorpus> {
  const root = await findCorpusRoot(id, suiteFile)
  const manifest = requireObject(await readJson(resolve(root, "corpus.json")), `${id} corpus manifest`)
  const manuscript = stringArray(manifest.manuscript, `${id} manuscript`)
  const passages: ContextItem[] = []
  const refs = new Set<string>()
  for (const relative of manuscript) {
    const content = await readFile(resolve(root, relative), "utf8")
    for (const passage of parsePassages(content, relative)) {
      if (refs.has(passage.ref)) throw new Error(`${id} repeats native passage ${passage.ref}`)
      refs.add(passage.ref)
      passages.push({ ...passage, kind: "manuscript" })
    }
  }
  if (!passages.length) throw new Error(`${id} contains no native manuscript passages`)
  const variants = new Map<string, Variant>()
  for (const relative of stringArray(manifest.variants ?? [], `${id} variants`)) {
    for (const value of await readJsonl(resolve(root, relative))) {
      const input = requireObject(value, `${relative} variant`)
      const operation = requireObject(input.operation, `${relative} operation`)
      const variant: Variant = {
        id: requireString(input.id, `${relative} id`),
        sourceRef: requireString(input.sourceRef, `${relative} sourceRef`),
        sourceSha256: requireString(input.sourceSha256, `${relative} sourceSha256`),
        match: requireString(operation.match, `${relative} operation.match`),
        replacement: requireString(operation.replacement, `${relative} operation.replacement`),
      }
      if (variants.has(variant.id)) throw new Error(`${id} repeats native variant ${variant.id}`)
      variants.set(variant.id, variant)
    }
  }
  return {
    id: requireString(manifest.id, `${id} corpus id`),
    version: requireString(manifest.version, `${id} corpus version`),
    passages,
    variants,
  }
}

async function findCorpusRoot(id: string, suiteFile: string) {
  let current = dirname(resolve(suiteFile))
  const filesystemRoot = parse(current).root
  while (true) {
    try {
      const manifest = requireObject(await readJson(resolve(current, "corpus.json")), "corpus manifest")
      if (manifest.id === id) return current
    } catch (error) {
      if (!missingFile(error)) throw error
    }
    if (current === filesystemRoot) break
    current = dirname(current)
  }
  throw new Error(`could not locate native corpus ${id} from ${suiteFile}`)
}

function parsePassages(content: string, relative: string) {
  const matches = [...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs)]
  return matches.map((match) => {
    const text = match.groups?.text.replaceAll("\r\n", "\n").trim()
    if (!text) throw new Error(`${relative} contains an empty native passage ${match[1]}`)
    return { ref: requireString(match[1], `${relative} passage ref`), text }
  })
}

function applyVariant(passages: ContextItem[], variant?: Variant) {
  if (!variant) return passages.map((passage) => ({ ...passage }))
  let applied = false
  const output = passages.map((passage) => {
    if (passage.ref !== variant.sourceRef) return { ...passage }
    const actual = createHash("sha256").update(passage.text).digest("hex")
    if (actual !== variant.sourceSha256) throw new Error(`${variant.id} has a stale source hash for ${variant.sourceRef}`)
    const pieces = passage.text.split(variant.match)
    if (pieces.length !== 2) throw new Error(`${variant.id} match must occur exactly once in ${variant.sourceRef}`)
    applied = true
    return { ...passage, text: `${pieces[0]}${variant.replacement}${pieces[1]}` }
  })
  if (!applied) throw new Error(`${variant.id} references missing passage ${variant.sourceRef}`)
  return output
}

function boundPassages(passages: ContextItem[], throughRef?: string) {
  if (!throughRef) return passages
  if (!passages.some((passage) => passage.ref === throughRef)) throw new Error(`native boundary is missing: ${throughRef}`)
  return passages.filter((passage) => compareRefs(passage.ref, throughRef) <= 0)
}

function controlledPassages(passages: ContextItem[], task: Task) {
  const spec = task.contextSpec
  if (!spec) throw new Error(`${task.id} lacks a controlled context specification`)
  const admitted = new Set([
    ...spec.focusRefs,
    ...(spec.dependencyRefs ?? []),
    ...(spec.preservationRefs ?? []),
  ])
  const output = passages.filter((passage) => admitted.has(passage.ref))
  const found = new Set(output.map((passage) => passage.ref))
  const missing = [...admitted].filter((ref) => !found.has(ref))
  if (missing.length) throw new Error(`${task.id} controlled context is missing: ${missing.join(", ")}`)
  return output
}

function requiredVariant(corpus: NativeCorpus, id: string) {
  const variant = corpus.variants.get(id)
  if (!variant) throw new Error(`${corpus.id} does not define native variant ${id}`)
  return variant
}

function nativeSourceID(source: string) {
  return source.startsWith("native:") ? source.slice("native:".length) : undefined
}

function bookScaleString(task: Task, key: string) {
  const value = (task.metadata?.bookScale as Record<string, unknown> | undefined)?.[key]
  return typeof value === "string" ? value : undefined
}

function compareRefs(left: string, right: string) {
  const a = referenceOrder(left)
  const b = referenceOrder(right)
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`invalid native passage boundary: ${left}, ${right}`)
  return a - b
}

function referenceOrder(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  return match ? Number(match[1]) * 100_000 + Number(match[2]) : Number.NaN
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`)
  }
  return value as string[]
}

function missingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
