import type { ContextItem, ExecutionTask, RetrievalSpec } from "./contracts.ts"

export type RetrievalStrategy = "lexical" | "hierarchical" | "hierarchical-temporal" | "coverage-temporal" | "hybrid-temporal" | "embedding"

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
  const temporal = input.strategy === "hierarchical-temporal" || input.strategy === "coverage-temporal" || input.strategy === "hybrid-temporal"
  const filtered = temporal && spec.throughRef
    ? input.catalog.filter((item) => referenceOrder(item.ref) <= referenceOrder(spec.throughRef!))
    : input.catalog
  const ranked = input.strategy === "lexical"
    ? rankLexical(query, filtered)
    : input.strategy === "embedding"
      ? await rankEmbedding(query, filtered, input.embed)
      : input.strategy === "hybrid-temporal"
        ? await rankHybrid(query, filtered, spec, input.embed)
        : input.strategy === "coverage-temporal"
        ? rankCoverage(query, filtered, spec)
        : rankHierarchical(query, filtered, spec)
  const explicitRefs = query.match(/ch\d+:p\d+/gi)?.map((ref) => ref.toLowerCase()) ?? []
  const structuralRefs = /\b(?:ending|final passage|end of (?:the )?(?:novel|story|manuscript))\b/i.test(query) && spec.throughRef
    ? [spec.throughRef]
    : []
  const declared = unique([...(spec.focusRefs ?? []), ...(spec.preservationRefs ?? []), ...explicitRefs, ...structuralRefs])
  const unknown = declared.filter((ref) => !input.catalog.some((item) => item.ref === ref))
  if (unknown.length) throw new Error(`retrieval specification references missing passages: ${unknown.join(", ")}`)
  const selectedRefs = input.strategy === "coverage-temporal" || input.strategy === "hybrid-temporal"
    ? selectCoverage(query, ranked, declared, spec.topK)
    : selectPassages(ranked, declared, spec.topK)
  const throughRef = temporal ? spec.throughRef : undefined
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

export function rankCoverage(query: string, catalog: ContextItem[], spec: RetrievalSpec) {
  const base = rankHierarchical(query, catalog, spec)
  const baseMax = Math.max(...base.map((item) => item.score), 1)
  const facets = queryFacets(query)
  const facetRanks = facets.map((facet) => rankSemantic(facet, catalog))
  const facetMax = facetRanks.map((items) => Math.max(...items.map((item) => item.score), 1))
  const entities = queryEntities(query)
  const relations = anchorRelationScores(catalog, spec)
  const stateQuery = /\b(?:continuity|contradiction|possession|state)\b/i.test(query)
  return base.map((item) => {
    const facetScores = facetRanks.map((items, index) => (items.find((candidate) => candidate.ref === item.ref)?.score ?? 0) / facetMax[index]!)
    const bestFacet = facetScores.indexOf(Math.max(...facetScores))
    const entityHits = entities.filter((entity) => catalog.find((candidate) => candidate.ref === item.ref)?.text.toLowerCase().includes(entity)).length
    const anchorPenalty = stateQuery && item.reasons.some((reason) => reason === "anchor-predecessor" || reason === "anchor-successor") ? 0.12 : 0
    return {
      ref: item.ref,
      score: 0.55 * item.score / baseMax
        + 0.25 * Math.max(...facetScores, 0)
        + 0.15 * (relations.get(item.ref) ?? 0)
        + 0.05 * entityHits / Math.max(entities.length, 1)
        - anchorPenalty,
      reasons: [
        ...item.reasons,
        `facet:${bestFacet}`,
        ...(entityHits ? ["query-entity"] : []),
        ...(relations.get(item.ref) ? ["anchor-relation"] : []),
        ...(anchorPenalty ? ["state-over-locality"] : []),
      ],
    }
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

export async function rankHybrid(
  query: string,
  catalog: ContextItem[],
  spec: RetrievalSpec,
  embed: ((values: string[]) => Promise<number[][]>) | undefined,
) {
  const coverage = rankCoverage(query, catalog, spec)
  const embedding = await rankEmbedding(query, catalog, embed)
  const coverageMax = Math.max(...coverage.map((item) => item.score), 1)
  const embeddingMin = Math.min(...embedding.map((item) => item.score), 0)
  const embeddingMax = Math.max(...embedding.map((item) => item.score), 1)
  return coverage.map((item) => {
    const semantic = embedding.find((candidate) => candidate.ref === item.ref)?.score ?? embeddingMin
    const normalized = (semantic - embeddingMin) / Math.max(embeddingMax - embeddingMin, Number.EPSILON)
    return {
      ref: item.ref,
      score: 0.55 * item.score / coverageMax + 0.45 * normalized,
      reasons: [...item.reasons, "embedding-cosine"],
    }
  }).sort(rankOrder)
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

function rankSemantic(query: string, catalog: ContextItem[]) {
  return rankTerms(expandCoverageQuery(query), catalog, semanticTokenize, "semantic-bm25")
}

function expandCoverageQuery(query: string) {
  const concepts: Record<string, string[]> = {
    token: ["drawer", "locked", "key", "carried", "coat", "pocket", "possession", "left", "returned"],
    trust: ["trusted", "forgive", "forgiveness", "consent", "permission", "asked", "accepted", "apology", "authority"],
    betrayal: ["betrayed", "confession", "hid", "hidden", "delayed", "took", "gave", "protected", "authority"],
    birds: ["bird", "wing", "rhythm", "ticking", "spring"],
    bird: ["birds", "wing", "rhythm", "ticking", "spring"],
    identity: ["person", "voice", "figure", "name", "memory", "body"],
    living: ["alive", "dead", "death", "body", "disappeared", "disappearance", "survival"],
  }
  const additions = unique(tokenize(query).flatMap((term) => concepts[term] ?? []))
  return [expandWritingQuery(query), ...additions].join(" ")
}

function queryFacets(query: string) {
  const cleaned = query.replaceAll(/ch\d+:p\d+/gi, " ")
  const facets = cleaned.split(/[,;.]|\b(?:and|while|but|without|preserve|distinguish|return)\b/gi)
    .map((value) => value.trim())
    .filter((value) => semanticTokenize(value).length >= 2)
  return unique([query, ...facets]).slice(0, 8)
}

function queryEntities(query: string) {
  const ignored = new Set(["at", "chapter", "check", "decide", "determine", "distinguish", "identify", "immediately", "plan", "preserve", "return", "trace", "update", "use"])
  return unique(query.match(/\b[A-Z][a-z]{2,}\b/g)?.map((value) => value.toLowerCase()).filter((value) => !ignored.has(value)) ?? [])
}

function frequencies(values: string[]) {
  const output = new Map<string, number>()
  values.forEach((value) => output.set(value, (output.get(value) ?? 0) + 1))
  return output
}

function semanticTokenize(value: string) {
  return tokenize(value).map(stem)
}

function stem(value: string) {
  if (value.length > 5 && value.endsWith("ies")) return `${value.slice(0, -3)}y`
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3)
  if (value.length > 4 && value.endsWith("ed")) return value.slice(0, -2)
  if (value.length > 4 && value.endsWith("es")) return value.slice(0, -2)
  if (value.length > 3 && value.endsWith("s")) return value.slice(0, -1)
  return value
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

function selectCoverage(query: string, ranked: RankedPassage[], declared: string[], topK: number) {
  const selected = unique(declared).slice(0, topK)
  const remaining = ranked.filter((item) => !selected.includes(item.ref))
  const covered = new Set(selected.flatMap((ref) => ranked.find((item) => item.ref === ref)?.reasons
    .filter((reason) => reason.startsWith("facet:")) ?? []))
  const strongSpan = /\b(?:arc|across|evolving|motif|pattern|trace)\b/i.test(query)
  const span = strongSpan || /\b(?:changes?|dependencies|preserve|through)\b/i.test(query)
  while (selected.length < topK && remaining.length) {
    remaining.sort((left, right) => {
      const adjusted = (item: RankedPassage) => {
        const facet = item.reasons.find((reason) => reason.startsWith("facet:"))
        return item.score
          + (facet && !covered.has(facet) ? 0.12 : 0)
          + (span && !selected.some((ref) => chapter(ref) === chapter(item.ref)) ? strongSpan ? 0.2 : 0.1 : 0)
          - 0.02 * selected.filter((ref) => scene(ref) === scene(item.ref)).length
      }
      return adjusted(right) - adjusted(left) || rankOrder(left, right)
    })
    const next = remaining.shift()!
    selected.push(next.ref)
    next.reasons.filter((reason) => reason.startsWith("facet:")).forEach((reason) => covered.add(reason))
  }
  return selected
}

function anchorRelationScores(catalog: ContextItem[], spec: RetrievalSpec) {
  const byRef = new Map(catalog.map((item) => [item.ref, item]))
  const anchorRefs = unique([...(spec.focusRefs ?? []), ...(spec.preservationRefs ?? [])])
  const seedRefs = unique(anchorRefs.flatMap((ref) => [ref, previousReference(ref), nextReference(ref)].filter((value): value is string => !!value)))
  const seedEntries = seedRefs.flatMap((ref) => byRef.get(ref)?.text ? [{ ref, text: byRef.get(ref)!.text }] : [])
  if (!seedEntries.length) return new Map<string, number>()
  const documents = catalog.map((item) => new Set(semanticTokenize(item.text)))
  const raw = new Map(catalog.map((item, index) => {
    const comparisonSeeds = seedEntries.filter((seed) => seed.ref !== item.ref).map((seed) => seed.text)
    const seedTerms = new Set(comparisonSeeds.flatMap(semanticTokenize))
    const seedBigrams = new Set(comparisonSeeds.flatMap(semanticBigrams))
    const terms = documents[index]!
    const tokenScore = [...seedTerms].reduce((total, term) => {
      if (!terms.has(term)) return total
      const frequency = documents.filter((document) => document.has(term)).length
      return total + Math.log(1 + documents.length / Math.max(frequency, 1))
    }, 0)
    const bigramScore = semanticBigrams(item.text).filter((bigram) => seedBigrams.has(bigram)).length * 2
    return [item.ref, tokenScore + bigramScore] as const
  }))
  const maximum = Math.max(...raw.values(), 1)
  return new Map([...raw].map(([ref, score]) => [ref, score / maximum]))
}

function semanticBigrams(value: string) {
  const terms = semanticTokenize(value)
  return terms.slice(1).map((term, index) => `${terms[index]} ${term}`)
}

function rankTerms(
  query: string,
  catalog: ContextItem[],
  tokenizer: (value: string) => string[],
  reason: string,
) {
  const documents = catalog.map((item) => tokenizer(item.text))
  const queryTerms = tokenizer(query)
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
    return { ref: item.ref, score, reasons: [reason] } satisfies RankedPassage
  }).sort(rankOrder)
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
