import type { Edit, ExecutionArtifacts, ExecutionTask, Finding } from "./contracts.ts"
import { requireString } from "./contracts.ts"
import { citedEvidence, parseJsonText } from "./targets/shared.ts"

const requirements = {
  explain: ["Answer from supplied context only.", "Cite every passage used with its exact reference."],
  diagnose: [
    "Return only genuine findings; preserve intentional ambiguity and motif.",
    "For continuity findings, use stable IDs shaped as error:<object>-<dimension>.",
    "Separate observation, inference, and unresolved possibilities in answer and data.",
  ],
  brainstorm: ["Number materially different options.", "State the dramatic gain, loss, and preserved constraints for each."],
  plan: ["Return dependencies and affected passage references, not drafted prose.", "Name every preservation constraint."],
  revise: [
    "Return immutable proposed edits only; never claim a commit.",
    "Each edit needs an exact supplied passage target and complete replacement text.",
    "The answer must show the proposal and a concise preservation/constraint receipt.",
  ],
  synchronize: [
    "Return calibrated story-state findings with evidence.",
    "Use fact:<subject>-<predicate> for supported story facts and knowledge:<character>-<topic>-<status> for character knowledge.",
    "Distinguish observation, strong inference, and unresolved state; never promote uncertainty to canon.",
  ],
  generate: ["Generate only within supplied authority and constraints."],
  translate: ["Preserve meaning, voice, uncertainty, and named constraints."],
} satisfies Record<ExecutionTask["job"], string[]>

export function renderWriterContract(task: ExecutionTask) {
  return JSON.stringify({
    contractVersion: 1,
    job: task.job,
    request: task.prompt,
    authority: task.authority ?? "read",
    contextPolicy: {
      suppliedContext: "complete and authoritative for this operation",
      filesystemDiscovery: "forbidden",
      unsupportedClaims: "mark unresolved or omit",
      citations: "use exact supplied passage references",
    },
    requirements: requirements[task.job],
    responseSchema: {
      answer: "reader-facing string",
      evidence: ["exact passage reference"],
      findings: [{ id: "stable semantic ID", evidence: ["exact passage reference"], confidence: "number 0..1" }],
      edits: [{ target: "exact passage reference", replacement: "complete replacement text" }],
      data: {
        observations: ["string"],
        inferences: ["string"],
        unresolved: ["string"],
        preservation: ["string"],
      },
    },
    responseRules: [
      "Return one JSON object and no prose outside it.",
      "Use empty arrays when a field does not apply.",
      "Do not cite or edit references absent from context.",
      task.authority === "propose" ? "Proposals are immutable and uncommitted." : "Edits must be empty because authority is read-only.",
    ],
    context: task.context ?? [],
  })
}

export function parseWriterContract(task: ExecutionTask, value: string) {
  const input = parseJsonText(value)
  const answer = requireString(input.answer, "writer contract answer")
  const refs = new Set(task.context?.map((item) => item.ref) ?? [])
  const evidence = unique([
    ...strings(input.evidence).filter((ref) => refs.has(ref)),
    ...citedEvidence(task, answer),
  ])
  const findings = Array.isArray(input.findings)
    ? input.findings.map((finding) => parseFinding(finding, refs)).filter((finding): finding is Finding => finding !== undefined)
    : []
  const edits = task.authority === "propose" && task.job === "revise"
    ? parseEdits(task, input.edits, refs)
    : []
  const data = input.data && typeof input.data === "object" && !Array.isArray(input.data)
    ? input.data as Record<string, unknown>
    : undefined
  return { answer, artifacts: { evidence, findings, edits, data } satisfies ExecutionArtifacts }
}

function parseFinding(value: unknown, refs: Set<string>): Finding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (typeof input.id !== "string" || !input.id) return
  return {
    id: input.id,
    evidence: unique(strings(input.evidence).filter((ref) => refs.has(ref))),
    confidence: typeof input.confidence === "number" && input.confidence >= 0 && input.confidence <= 1
      ? input.confidence
      : undefined,
  } satisfies Finding
}

function parseEdits(task: ExecutionTask, value: unknown, refs: Set<string>): Edit[] {
  if (!Array.isArray(value)) return []
  const excluded = new Set(
    [...refs].filter((ref) => new RegExp(`(?:do not|don't|must not)\\s+(?:edit|change|revise)\\s+${escape(ref)}`, "i").test(task.prompt)),
  )
  return value.map((edit): Edit | undefined => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) return
    const input = edit as Record<string, unknown>
    if (typeof input.target !== "string" || !refs.has(input.target) || excluded.has(input.target)) return
    if (typeof input.replacement !== "string" || !input.replacement.trim()) return
    return { target: input.target, replacement: input.replacement } satisfies Edit
  }).filter((edit): edit is Edit => edit !== undefined)
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
