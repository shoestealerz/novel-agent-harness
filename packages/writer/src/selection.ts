import type { WriterContextSpec } from "./context.ts"
import type { WriterJob } from "./contract.ts"

export const writerSelectionVersion = 1 as const

export type WriterContextSelection = WriterContextSpec & {
  rationale: string
}

export const writerSelectionSystemPrompt = [
  "Select manuscript context for a fiction-writing task before execution.",
  "Use only the novel_list, novel_read, and novel_context tools to inspect the Git-backed novel.",
  "Return stable passage references, not prose answers or edits.",
  "Choose the smallest packet that covers the focus, causal dependencies, and explicit preservation constraints.",
  "Set throughRef whenever the request has a story-time, chapter, scene, or character-knowledge boundary; never select later passages beyond it.",
  "Do not use novel_proposal unless the author asks about an existing proposal.",
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
    excludeRefs: { type: "array", items: { type: "string" } },
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

export function renderWriterSelectionRequest(input: { request: string; job: WriterJob }) {
  return JSON.stringify({
    selectionVersion: writerSelectionVersion,
    job: input.job,
    request: input.request,
    authority: input.job === "revise" ? "propose" : "read",
    output: "Return passage references and a short rationale only. Do not answer the writing task.",
  })
}

export function parseWriterContextSelection(value: unknown): WriterContextSelection {
  const input = record(value, "writer context selection")
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
    input.throughRef === null ? undefined : text(input.throughRef, "writer context selection throughRef")
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
