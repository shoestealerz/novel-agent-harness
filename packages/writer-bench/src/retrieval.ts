import type { ContextItem, ExecutionTask, RetrievalSpec } from "./contracts.ts"

export type RetrievalStrategy = "lexical" | "hierarchical" | "hierarchical-temporal" | "embedding"

export type RankedPassage = {
  ref: string
  score: number
  reasons: string[]
}

export type RetrievalTrace = {
  strategy: RetrievalStrategy
  query: string
  topK: number
  ranked: RankedPassage[]
  selectedRefs: string[]
  filteredRefs: string[]
  latencyMs: number
}

export async function retrieveContext(input: {
  task: ExecutionTask
  catalog: ContextItem[]
  strategy: RetrievalStrategy
  embed?: (values: string[]) => Promise<number[][]>
}) {
  const started = performance.now()
  const spec = requireRetrievalSpec(input.task.retrievalSpec)
  const query = spec.query?.trim() || input.task.prompt
  const filtered = input.strategy === "hierarchical-temporal" && spec.throughRef
    ? input.catalog.filter((item) => referenceOrder(item.ref) <= referenceOrder(spec.throughRef!))
    : input.catalog
  const ranked = input.strategy === "lexical"
    ? rankLexical(query, filtered)
    : input.strategy === "embedding"
      ? await rankEmbedding(query, filtered, input.embed)
      : rankHierarchical(query, filtered, spec)
  const explicitRefs = query.match(/ch\d+:p\d+/gi)?.map((ref) => ref.toLowerCase()) ?? []
  const structuralRefs = /\b(?:ending|final passage|end of (?:the )?(?:novel|story|manuscript))\b/i.test(query) && spec.throughRef
    ? [spec.throughRef]
    : []
  const declared = unique([...(spec.focusRefs ?? []), ...(spec.preservationRefs ?? []), ...explicitRefs, ...structuralRefs])
  const unknown = declared.filter((ref) => !input.catalog.some((item) => item.ref === ref))
  if (unknown.length) throw new Error(`retrieval specification references missing passages: ${unknown.join(", ")}`)
  const selectedRefs = selectPassages(ranked, declared, spec.topK)
  const throughRef = input.strategy === "hierarchical-temporal" ? spec.throughRef : undefined
  const task = {
    ...input.task,
    retrievalSpec: undefined,
    contextSpec: {
      focusRefs: spec.focusRefs ?? [],
      dependencyRefs: selectedRefs.filter((ref) => !spec.focusRefs?.includes(ref) && !spec.preservationRefs?.includes(ref)),
      preservationRefs: spec.preservationRefs,
      preservationLiterals: spec.preservationLiterals,
      throughRef,
    },
  }
  return {
    task,
    trace: {
      strategy: input.strategy,
      query,
      topK: spec.topK,
      ranked: ranked.slice(0, Math.max(spec.topK * 2, 10)),
      selectedRefs,
      filteredRefs: input.catalog.map((item) => item.ref).filter((ref) => !filtered.some((item) => item.ref === ref)),
      latencyMs: performance.now() - started,
    } satisfies RetrievalTrace,
  }
}

export function rankLexical(query: string, catalog: ContextItem[]) {
  const documents = catalog.map((item) => tokenize(item.text))
  const queryTerms = tokenize(query)
  const averageLength = documents.reduce((total, terms) => total + terms.length, 0) / Math.max(documents.length, 1)
  return catalog.map((item, index) => {
    const terms = documents[index]!
    const counts = frequencies(terms)
    const score = queryTerms.reduce((total, term) => {
      const frequency = counts.get(term) ?? 0
      if (!frequency) return total
      const documentFrequency = documents.filter((document) => document.includes(term)).length
      const inverse = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5))
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * terms.length / Math.max(averageLength, 1))
      return total + inverse * frequency * 2.2 / denominator
    }, 0)
    return { ref: item.ref, score, reasons: ["bm25"] } satisfies RankedPassage
  }).sort(rankOrder)
}

export function rankHierarchical(query: string, catalog: ContextItem[], spec: RetrievalSpec) {
  const scenes = new Map<string, ContextItem[]>()
  catalog.forEach((item) => {
    const key = scene(item.ref)
    scenes.set(key, [...(scenes.get(key) ?? []), item])
  })
  const sceneItems = [...scenes].map(([ref, items]) => ({ ref, text: items.map((item) => item.text).join("\n"), kind: "manuscript" as const }))
  const expandedQuery = expandWritingQuery(query)
  const passageRanks = rankLexical(expandedQuery, catalog)
  const passageMax = Math.max(...passageRanks.map((item) => item.score), 1)
  const sceneRanks = rankLexical(expandedQuery, sceneItems)
  const sceneMax = Math.max(...sceneRanks.map((item) => item.score), 1)
  const sceneScores = new Map(sceneRanks.map((item) => [item.ref, item.score / sceneMax]))
  const anchorChapters = new Set((spec.focusRefs ?? []).map((ref) => chapter(ref)))
  const anchors = unique([
    ...(spec.focusRefs ?? []),
    ...(spec.preservationRefs ?? []),
    ...(query.match(/ch\d+:p\d+/gi)?.map((ref) => ref.toLowerCase()) ?? []),
  ])
  return passageRanks.map((item) => {
    const reasons = ["passage-bm25", "scene-bm25"]
    let score = 0.72 * item.score / passageMax + 0.28 * (sceneScores.get(scene(item.ref)) ?? 0)
    if (anchorChapters.has(chapter(item.ref))) {
      score += 0.05
      reasons.push("focus-chapter")
    }
    if (anchors.some((anchor) => previousReference(anchor) === item.ref)) {
      score += 0.35
      reasons.push("anchor-predecessor")
    }
    if (anchors.some((anchor) => nextReference(anchor) === item.ref)) {
      score += 0.35
      reasons.push("anchor-successor")
    }
    return { ref: item.ref, score, reasons }
  }).sort(rankOrder)
}

export async function rankEmbedding(
  query: string,
  catalog: ContextItem[],
  embed: ((values: string[]) => Promise<number[][]>) | undefined,
) {
  if (!embed) throw new Error("embedding retrieval requires a configured embedding provider")
  const vectors = await embed([query, ...catalog.map((item) => item.text)])
  if (vectors.length !== catalog.length + 1) throw new Error("embedding provider returned an unexpected vector count")
  const queryVector = vectors[0]!
  return catalog.map((item, index) => ({
    ref: item.ref,
    score: cosine(queryVector, vectors[index + 1]!),
    reasons: ["embedding-cosine"],
  })).sort(rankOrder)
}

function requireRetrievalSpec(value: RetrievalSpec | undefined) {
  if (!value || !Number.isInteger(value.topK) || value.topK < 1) throw new Error("retrieval task requires a positive integer topK")
  return value
}

function tokenize(value: string) {
  const stop = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which", "with"])
  return value.toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length > 1 && !stop.has(term)) ?? []
}

function expandWritingQuery(query: string) {
  const terms = tokenize(query)
  const concepts: Record<string, string[]> = {
    alive: ["dead", "death", "body", "disappeared", "disappearance", "survival", "lived"],
    uncertain: ["uncertainty", "prove", "proof", "could", "may", "might", "perhaps"],
    uncertainty: ["uncertain", "prove", "proof", "could", "may", "might", "perhaps"],
    contradiction: ["earlier", "before", "state", "possession", "carried", "left"],
    key: ["safe", "silver", "possession", "carried", "left"],
    colors: ["color", "blue", "white", "black", "silver", "gold", "violet", "green", "iron"],
    color: ["colors", "blue", "white", "black", "silver", "gold", "violet", "green", "iron"],
  }
  return [query, ...unique(terms.flatMap((term) => concepts[term] ?? []))].join(" ")
}

function frequencies(values: string[]) {
  const output = new Map<string, number>()
  values.forEach((value) => output.set(value, (output.get(value) ?? 0) + 1))
  return output
}

function scene(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  if (!match) throw new Error(`hierarchical retrieval requires a chapter passage reference: ${ref}`)
  return `ch${match[1]}:s${Number(match[2]) <= 4 ? 1 : 2}`
}

function chapter(ref: string) {
  return ref.split(":", 1)[0]!
}

function referenceOrder(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  if (!match) throw new Error(`temporal retrieval requires an ordered chapter passage reference: ${ref}`)
  return Number(match[1]) * 1_000_000 + Number(match[2])
}

function previousReference(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  if (!match || Number(match[2]) <= 1) return undefined
  return `ch${match[1]}:p${String(Number(match[2]) - 1).padStart(3, "0")}`
}

function nextReference(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  if (!match) return undefined
  return `ch${match[1]}:p${String(Number(match[2]) + 1).padStart(3, "0")}`
}

function selectPassages(ranked: RankedPassage[], declared: string[], topK: number) {
  const selected = unique(declared).slice(0, topK)
  return unique([...selected, ...ranked.map((item) => item.ref)]).slice(0, topK)
}

function cosine(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) throw new Error("embedding vectors must have equal non-zero dimensions")
  const dot = left.reduce((total, value, index) => total + value * right[index]!, 0)
  const magnitude = (values: number[]) => Math.sqrt(values.reduce((total, value) => total + value * value, 0))
  const denominator = magnitude(left) * magnitude(right)
  return denominator ? dot / denominator : 0
}

function rankOrder(left: RankedPassage, right: RankedPassage) {
  return right.score - left.score || left.ref.localeCompare(right.ref)
}

function unique(values: string[]) {
  return [...new Set(values)]
}
