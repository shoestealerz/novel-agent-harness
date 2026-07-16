import type { WriterContextItem, WriterContextSpec } from "./context.ts"
import type { WriterJob } from "./contract.ts"

export const writerSelectionVersion = 2 as const

export type WriterContextSelection = Omit<
  WriterContextSpec,
  "focusRefs" | "dependencyRefs" | "preservationRefs" | "preservationLiterals" | "excludeRefs"
> & {
  focusRefs: string[]
  dependencyRefs: string[]
  preservationRefs: string[]
  preservationLiterals: { ref: string; text: string }[]
  excludeRefs: string[]
  rationale: string
}

export const writerSelectionSystemPrompt = [
  "Select manuscript context for a fiction-writing task before execution.",
  "The request contains the complete bounded manuscript as ordered stable passage objects; inspect it directly and do not call tools.",
  "Set excludeRefs to an empty array; omission from the positive focus, dependency, and preservation sets is sufficient.",
  "For change-over-time questions, include the transition or transfer passages as well as the setup and final disposition; do not substitute nearby operational mentions for the actual change.",
  "Return stable passage references, not prose answers or edits.",
  "Choose the smallest packet that covers the focus, causal dependencies, and explicit preservation constraints.",
  "Use preservationLiterals only for wording the author explicitly requires verbatim; never turn motifs, voice, ideas, facts, or paraphrasable constraints into exact literals.",
  "Set throughRef whenever the request has a story-time, chapter, scene, or character-knowledge boundary; never select later passages beyond it.",
  "Do not infer throughRef from chapter order or boundary wording alone when the boundary event is absent; keep it unset and retain every passage that directly answers a requested facet.",
  "Do not select passages merely because you inspected them. Keep unrelated or redundant passages out of every returned reference array.",
  "Return every reference field as a JSON array of exact stable references, even when it contains zero or one item.",
].join(" ")

export const writerSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    focusRefs: { type: "array", minItems: 1, items: { type: "string" } },
    dependencyRefs: { type: "array", items: { type: "string" } },
    preservationRefs: { type: "array", items: { type: "string" } },
    preservationLiterals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { ref: { type: "string" }, text: { type: "string" } },
        required: ["ref", "text"],
      },
    },
    excludeRefs: { type: "array", maxItems: 0, items: { type: "string" } },
    throughRef: { type: ["string", "null"] },
    rationale: { type: "string" },
  },
  required: [
    "focusRefs",
    "dependencyRefs",
    "preservationRefs",
    "preservationLiterals",
    "excludeRefs",
    "throughRef",
    "rationale",
  ],
} as const

export function renderWriterSelectionRequest(input: {
  request: string
  job: WriterJob
  manuscript: Pick<WriterContextItem, "ref" | "text" | "metadata">[]
}) {
  return JSON.stringify({
    selectionVersion: writerSelectionVersion,
    job: input.job,
    request: input.request,
    authority: input.job === "revise" ? "propose" : "read",
    output: "Return passage references and a short rationale only. Do not answer the writing task.",
    manuscript: input.manuscript,
  })
}

export function parseWriterContextSelection(value: unknown): WriterContextSelection {
  const input = record(normalizeWriterContextSelection(value), "writer context selection")
  const focusRefs = refs(input.focusRefs, "focusRefs")
  if (!focusRefs.length) throw new Error("writer context selection requires at least one focus reference")
  const dependencyRefs = refs(input.dependencyRefs, "dependencyRefs")
  const preservationRefs = refs(input.preservationRefs, "preservationRefs")
  const excludeRefs = refs(input.excludeRefs, "excludeRefs")
  const overlap = focusRefs.filter((ref) => excludeRefs.includes(ref))
  if (overlap.length) throw new Error(`writer context selection excludes focus passages: ${overlap.join(", ")}`)
  if (!Array.isArray(input.preservationLiterals)) {
    throw new Error("writer context selection preservationLiterals must be an array")
  }
  const preservationLiterals = input.preservationLiterals.map((value, index) => {
    const literal = record(value, `writer context selection preservationLiterals[${index}]`)
    const ref = text(literal.ref, `writer context selection preservationLiterals[${index}].ref`)
    if (!preservationRefs.includes(ref)) {
      throw new Error(`writer context selection literal must reference a preservation passage: ${ref}`)
    }
    return { ref, text: text(literal.text, `writer context selection preservationLiterals[${index}].text`) }
  })
  const throughRef =
    input.throughRef === null ||
    (typeof input.throughRef === "string" && /^(?:null|none)$/i.test(input.throughRef.trim()))
      ? undefined
      : text(input.throughRef, "writer context selection throughRef")
  return {
    focusRefs,
    dependencyRefs,
    preservationRefs,
    preservationLiterals,
    excludeRefs,
    ...(throughRef ? { throughRef } : {}),
    rationale: text(input.rationale, "writer context selection rationale"),
  }
}

export function normalizeWriterContextSelection(value: unknown): unknown {
  const outer = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  const candidate = completeSelection(outer)
    ? outer
    : [outer?.input, outer?.answer, outer?.output]
        .map((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) return item
          if (typeof item !== "string") return
          try {
            return JSON.parse(item) as unknown
          } catch {
            return
          }
        })
        .find((item) => completeSelection(item)) ?? value
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate
  const input = candidate as Record<string, unknown>
  if (!completeSelection(input)) return candidate === value ? candidate : value
  return {
    ...input,
    focusRefs: normalizeRefs(input.focusRefs),
    dependencyRefs: normalizeRefs(input.dependencyRefs),
    preservationRefs: normalizeRefs(input.preservationRefs),
    excludeRefs: normalizeRefs(input.excludeRefs),
    preservationLiterals: normalizeList(input.preservationLiterals, (item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item
      const literal = item as Record<string, unknown>
      return "ref" in literal && "text" in literal ? literal : item
    }),
  }
}

function completeSelection(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return [
    "focusRefs",
    "dependencyRefs",
    "preservationRefs",
    "preservationLiterals",
    "excludeRefs",
    "throughRef",
    "rationale",
  ].every((field) => field in value)
}

function normalizeRefs(value: unknown) {
  return normalizeList(value, (item) => {
    if (typeof item === "string") return item
    if (!item || typeof item !== "object" || Array.isArray(item)) return item
    const record = item as Record<string, unknown>
    return typeof record.ref === "string" ? record.ref : item
  })
}

function normalizeList(value: unknown, item: (value: unknown) => unknown): unknown {
  if (typeof value === "string") {
    const items = value.split(",").map((entry) => entry.trim())
    return items.every((entry) => /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/i.test(entry)) ? items : value
  }
  if (Array.isArray(value)) return value.map(item)
  if (!value || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  for (const key of ["items", "values", "refs", "value", "data"]) {
    if (key in record) return normalizeList(record[key], item)
  }
  if ("ref" in record) return [item(record)]
  const keys = Object.keys(record)
  if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
    return keys.sort((left, right) => Number(left) - Number(right)).map((key) => item(record[key]))
  }
  return value
}

function refs(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`writer context selection ${label} must be an array of non-empty strings`)
  }
  const result = value.map((item) => item.trim())
  if (new Set(result).size !== result.length) throw new Error(`writer context selection ${label} contains duplicates`)
  return result
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}
