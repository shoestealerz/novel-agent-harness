import { claimsAppliedAuthority } from "./authority.ts"
import type { WriterContextItem, WriterContextSpec } from "./context.ts"
import { sealEditProposal, type EditProposal } from "./proposal.ts"

export const writerContractVersion = 1 as const

export type WriterJob = "explain" | "diagnose" | "plan" | "revise"
export type WriterAuthority = "read" | "propose"

export type WriterTask = {
  contractVersion: typeof writerContractVersion
  job: WriterJob
  request: string
  authority: WriterAuthority
  context: WriterContextItem[]
  contextSpec?: WriterContextSpec
}

export type WriterFinding = {
  id: string
  statement: string
  evidence: string[]
  confidence?: number
}

export type WriterEdit = {
  target: string
  replacement: string
}

export type WriterResult = {
  answer: string
  evidence: string[]
  findings: WriterFinding[]
  edits: WriterEdit[]
  data: {
    observations: string[]
    inferences: string[]
    unresolved: string[]
    preservation: string[]
  }
  proposal?: EditProposal
}

export class WriterContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WriterContractError"
  }
}

const requirements = {
  explain: [
    "Answer the author's question from the selected context only.",
    "Cite every passage used with its exact stable reference.",
    "Separate manuscript facts from interpretation and unresolved possibilities.",
  ],
  diagnose: [
    "Report only evidence-supported narrative problems; intentional ambiguity is not an error.",
    "Separate observation, inference, and unresolved possibilities.",
    "Give every finding a stable local ID, statement, evidence, and calibrated confidence.",
  ],
  plan: [
    "Return a causal revision plan with dependencies and affected passage references.",
    "Name every preservation constraint and do not draft replacement prose.",
    "Identify uncertainty rather than silently inventing missing story facts.",
  ],
  revise: [
    "Return complete replacement text only for explicitly allowed focus passages.",
    "Treat every edit as an immutable, uncommitted proposal and never claim it was applied.",
    "Quote every exact preservation literal verbatim in the preservation receipt.",
  ],
} satisfies Record<WriterJob, string[]>

export const writerSystemPrompt = [
  "You are the execution model inside a fiction-writing harness.",
  "Execute the machine-readable Writer Task Contract exactly.",
  "The selected context is authoritative and complete for this operation; do not use outside story facts.",
  "Preserve author authority, stable passage references, exact literals, chronology, and epistemic uncertainty.",
  "Read-only jobs must never return edits. Revision jobs return proposals only and never claim to apply or commit them.",
].join(" ")

export function routeWriterJob(request: string, explicit?: WriterJob): WriterJob {
  const value = nonempty(request, "writer request")
  if (explicit) return explicit
  if (/^\s*(?:explain|summari[sz]e|tell me|what (?:does|did|is|are|happens?|happened)|who (?:is|are))\b/i.test(value)) {
    return "explain"
  }
  if (
    /\b(?:diagnose|continuity (?:check|problem|error)|what(?:'s| is) wrong|find (?:the )?(?:problem|inconsisten(?:cy|cies|t|tly)|plot hole)|check for)\b/i.test(
      value,
    )
  ) {
    return "diagnose"
  }
  if (
    /\b(?:plan|outline|brainstorm|options?|approaches?|how should|before (?:editing|revising|rewriting)|revision plan)\b/i.test(
      value,
    )
  ) {
    return "plan"
  }
  if (/\b(?:revise|rewrite|edit|tighten|polish|rephrase|translate|replace|change|cut|expand)\b/i.test(value)) {
    return "revise"
  }
  return "explain"
}

export function createWriterTask(input: {
  request: string
  job?: WriterJob
  context: WriterContextItem[]
  contextSpec?: WriterContextSpec
}): WriterTask {
  const job = routeWriterJob(input.request, input.job)
  const context = input.context.map((item) => ({ ...item }))
  const refs = context.map((item) => nonempty(item.ref, "context reference"))
  if (new Set(refs).size !== refs.length) throw new WriterContractError("writer context contains duplicate references")
  if (context.some((item) => !item.text.trim())) throw new WriterContractError("writer context contains empty text")
  if (job === "revise" && !input.contextSpec?.focusRefs.length) {
    throw new WriterContractError("revision work requires at least one explicit focus passage")
  }
  const selected = new Set(refs)
  const declared = [
    ...(input.contextSpec?.focusRefs ?? []),
    ...(input.contextSpec?.dependencyRefs ?? []),
    ...(input.contextSpec?.preservationRefs ?? []),
  ]
  const missing = [...new Set(declared)].filter((ref) => !selected.has(ref))
  if (missing.length)
    throw new WriterContractError(`selected context is missing declared passages: ${missing.join(", ")}`)
  input.contextSpec?.preservationLiterals?.forEach((literal) => {
    if (!input.contextSpec?.preservationRefs?.includes(literal.ref)) {
      throw new WriterContractError(`exact preservation literal must reference a preservation passage: ${literal.ref}`)
    }
    if (!context.find((item) => item.ref === literal.ref)?.text.includes(literal.text)) {
      throw new WriterContractError(`exact preservation literal is absent from ${literal.ref}`)
    }
  })
  return {
    contractVersion: writerContractVersion,
    job,
    request: input.request.trim(),
    authority: job === "revise" ? "propose" : "read",
    context,
    ...(input.contextSpec ? { contextSpec: input.contextSpec } : {}),
  }
}

export function renderWriterContract(task: WriterTask) {
  return JSON.stringify({
    contractVersion: task.contractVersion,
    job: task.job,
    request: task.request,
    authority: task.authority,
    contextPolicy: {
      selectedContext: "authoritative and complete for this operation",
      filesystemDiscovery: "forbidden outside narrative tools",
      unsupportedClaims: "mark unresolved or omit",
      citations: "use exact selected passage references",
      temporalBoundary: task.contextSpec?.throughRef ?? null,
      exactPreservationLiterals: task.contextSpec?.preservationLiterals ?? [],
    },
    requirements: requirements[task.job],
    responseRules: [
      "Account for every focus, dependency, and preservation passage or state why it does not apply.",
      "Do not cite or edit references absent from selected context.",
      task.authority === "read"
        ? "Return no edits because this job is read-only."
        : "Return proposed edits only; do not claim to save, apply, or commit them.",
    ],
    context: task.context,
  })
}

export const writerResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["id", "statement", "evidence"],
      },
    },
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { target: { type: "string" }, replacement: { type: "string" } },
        required: ["target", "replacement"],
      },
    },
    data: {
      type: "object",
      additionalProperties: false,
      properties: {
        observations: { type: "array", items: { type: "string" } },
        inferences: { type: "array", items: { type: "string" } },
        unresolved: { type: "array", items: { type: "string" } },
        preservation: { type: "array", items: { type: "string" } },
      },
      required: ["observations", "inferences", "unresolved", "preservation"],
    },
  },
  required: ["answer", "evidence", "findings", "edits", "data"],
} as const

export function writerResponseSchemaFor(task: WriterTask) {
  const refs = unique(task.context.map((item) => item.ref))
  const focus = unique(task.contextSpec?.focusRefs ?? [])
  const evidenceRef = {
    type: "string",
    enum: refs,
    description: "An exact selected passage reference only; do not append a quote or commentary.",
  } as const
  const editTarget = {
    type: "string",
    enum: focus,
    description: "An exact explicitly allowed focus passage reference only.",
  } as const
  return {
    ...writerResponseSchema,
    properties: {
      ...writerResponseSchema.properties,
      evidence: { type: "array", items: evidenceRef },
      findings: {
        ...writerResponseSchema.properties.findings,
        items: {
          ...writerResponseSchema.properties.findings.items,
          properties: {
            ...writerResponseSchema.properties.findings.items.properties,
            evidence: { type: "array", items: evidenceRef },
          },
        },
      },
      edits: {
        ...writerResponseSchema.properties.edits,
        ...(task.authority === "read" ? { maxItems: 0 } : {}),
        items: {
          ...writerResponseSchema.properties.edits.items,
          properties: {
            ...writerResponseSchema.properties.edits.items.properties,
            target: editTarget,
          },
        },
      },
    },
  } as const
}

export function parseWriterResult(task: WriterTask, value: unknown): WriterResult {
  const input = record(normalizeWriterResponse(value), "writer response")
  const answer = nonempty(input.answer, "writer response answer")
  if (claimsAppliedAuthority(answer)) {
    throw new WriterContractError("writer response claimed authority to apply or commit changes")
  }
  const allowed = new Set(task.context.map((item) => item.ref))
  const evidence = stringArray(input.evidence, "writer response evidence")
  const cited = [...answer.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]!).filter((ref) => ref.includes(":"))
  requireAllowed([...evidence, ...cited], allowed, "evidence")
  if (!Array.isArray(input.findings)) throw new WriterContractError("writer response findings must be an array")
  const findings = input.findings.map((value, index) => {
    const finding = record(value, `writer response findings[${index}]`)
    const findingEvidence = stringArray(finding.evidence, `writer response findings[${index}].evidence`)
    requireAllowed(findingEvidence, allowed, "finding evidence")
    const confidence = finding.confidence
    if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
      throw new WriterContractError(`writer response findings[${index}].confidence must be between 0 and 1`)
    }
    return {
      id: nonempty(finding.id, `writer response findings[${index}].id`),
      statement: nonempty(finding.statement, `writer response findings[${index}].statement`),
      evidence: findingEvidence,
      ...(confidence === undefined ? {} : { confidence }),
    }
  })
  if (!Array.isArray(input.edits)) throw new WriterContractError("writer response edits must be an array")
  if (task.authority === "read" && input.edits.length) {
    throw new WriterContractError(`the ${task.job} job is read-only and cannot return edits`)
  }
  const focus = new Set(task.contextSpec?.focusRefs ?? [])
  const edits = input.edits.map((value, index) => {
    const edit = record(value, `writer response edits[${index}]`)
    const target = nonempty(edit.target, `writer response edits[${index}].target`)
    if (!allowed.has(target) || !focus.has(target)) {
      throw new WriterContractError(`writer response attempted an edit outside the allowed focus: ${target}`)
    }
    return { target, replacement: nonempty(edit.replacement, `writer response edits[${index}].replacement`) }
  })
  if (new Set(edits.map((edit) => edit.target)).size !== edits.length) {
    throw new WriterContractError("writer response contains duplicate edit targets")
  }
  const data = record(input.data, "writer response data")
  const parsed = {
    answer,
    evidence: unique([...evidence, ...cited, ...findings.flatMap((finding) => finding.evidence)]),
    findings,
    edits,
    data: {
      observations: stringArray(data.observations, "writer response data.observations"),
      inferences: stringArray(data.inferences, "writer response data.inferences"),
      unresolved: stringArray(data.unresolved, "writer response data.unresolved"),
      preservation: stringArray(data.preservation, "writer response data.preservation"),
    },
  }
  if (task.job !== "revise") return parsed
  const proposal = sealEditProposal(
    { ...task, prompt: task.request },
    { text: parsed.answer, artifacts: { edits, data: parsed.data } },
  )
  if (!proposal.validation.valid) {
    const failed = Object.entries(proposal.validation.checks)
      .filter(([, valid]) => !valid)
      .map(([name]) => name)
    throw new WriterContractError(`writer revision failed proposal validation: ${failed.join(", ")}`)
  }
  return { ...parsed, proposal }
}

export function normalizeWriterResponse(value: unknown): unknown {
  const outer = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  if (!outer || Object.keys(outer).length !== 1 || !("answer" in outer)) return value
  const nested = (() => {
    if (outer.answer && typeof outer.answer === "object" && !Array.isArray(outer.answer)) return outer.answer
    if (typeof outer.answer !== "string") return undefined
    const text = outer.answer.trim()
    if (!text.startsWith("{") || !text.endsWith("}")) return undefined
    try {
      return JSON.parse(text) as unknown
    } catch {
      // DeepSeek V4 may append non-schema diagnostic counters after closing a
      // complete JSON answer when tool_choice is unavailable in thinking mode.
      // Recover only the exact known suffix and still run every Writer contract
      // check against the parsed response below.
      const match = /^(.*\})(?:,\s*"(?:findingCount|editCount)"\s*:\s*\d+)+\s*}$/s.exec(text)
      if (!match?.[1]) return undefined
      try {
        return JSON.parse(match[1]) as unknown
      } catch {
        return undefined
      }
    }
  })()
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return value
  const input = nested as Record<string, unknown>
  const required = ["answer", "evidence", "findings", "edits", "data"]
  return required.every((key) => key in input) ? input : value
}

function requireAllowed(values: string[], allowed: Set<string>, label: string) {
  const unknown = unique(values).filter((ref) => !allowed.has(ref))
  if (unknown.length)
    throw new WriterContractError(`writer response contains unsupported ${label}: ${unknown.join(", ")}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WriterContractError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function nonempty(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new WriterContractError(`${label} must be a non-empty string`)
  return value.trim()
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new WriterContractError(`${label} must be an array of strings`)
  }
  return value as string[]
}

function unique(values: string[]) {
  return [...new Set(values)]
}
