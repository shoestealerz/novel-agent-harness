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
    "Account for every supplied context item in findings or data unless the author explicitly excludes it.",
  ],
  generate: ["Generate only within supplied authority and constraints."],
  translate: ["Preserve meaning, voice, uncertainty, and named constraints."],
} satisfies Record<ExecutionTask["job"], string[]>

export function renderWriterContract(task: ExecutionTask, version: 1 | 2 = 1) {
  const taskAwarePacket = task.context?.some((item) => {
    const roles = item.metadata?.contextRoles
    return Array.isArray(roles) && roles.some((role) => ["focus", "dependency", "preservation"].includes(String(role)))
  })
  return JSON.stringify({
    contractVersion: version,
    job: task.job,
    request: task.prompt,
    authority: task.authority ?? "read",
    contextPolicy: {
      suppliedContext: "complete and authoritative for this operation",
      filesystemDiscovery: "forbidden",
      unsupportedClaims: "mark unresolved or omit",
      citations: "use exact supplied passage references",
      ...(taskAwarePacket ? {
        selectedPacket: "Every focus, dependency, and preservation passage was deliberately selected. Account for each with evidence or explicitly state why it does not apply.",
        exactPreservationLiterals: task.contextSpec?.preservationLiterals ?? [],
      } : {}),
    },
    requirements: requirements[task.job],
    responseSchema: {
      answer: "reader-facing string",
      evidence: ["exact passage reference"],
      findings: version === 2
        ? [{ id: "stable local ID", statement: "complete human-readable claim", evidence: ["exact passage reference"], confidence: "number 0..1" }]
        : [{ id: "stable semantic ID", evidence: ["exact passage reference"], confidence: "number 0..1" }],
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
      ...(version === 2 ? [
        "Be concise: answer at most 200 words; at most 8 findings; each finding statement at most 40 words; at most 8 items in each data array.",
        "When the author supplies an exact literal to preserve, quote it verbatim in both answer and data.preservation.",
      ] : []),
      task.authority === "propose" ? "Proposals are immutable and uncommitted." : "Edits must be empty because authority is read-only.",
    ],
    context: task.context ?? [],
  })
}

export function parseWriterContract(task: ExecutionTask, value: string, version: 1 | 2 = 1) {
  const input = parseJsonText(value)
  const literals = version === 2
    ? unique([...exactPreservationLiterals(task.prompt), ...(task.contextSpec?.preservationLiterals?.map((literal) => literal.text) ?? [])])
    : []
  const answer = appendPreservationReceipt(requireString(input.answer, "writer contract answer"), literals)
  const refs = new Set(task.context?.map((item) => item.ref) ?? [])
  const evidence = unique([
    ...strings(input.evidence).filter((ref) => refs.has(ref)),
    ...citedEvidence(task, answer),
  ])
  const findings = Array.isArray(input.findings)
    ? input.findings.map((finding) => parseFinding(finding, refs, version)).filter((finding): finding is Finding => finding !== undefined)
    : []
  const edits = task.authority === "propose" && task.job === "revise"
    ? parseEdits(task, input.edits, refs)
    : []
  const parsedData = input.data && typeof input.data === "object" && !Array.isArray(input.data)
    ? input.data as Record<string, unknown>
    : undefined
  const data = literals.length
    ? { ...parsedData, preservation: unique([...strings(parsedData?.preservation), ...literals]) }
    : parsedData
  return { answer, artifacts: { evidence, findings, edits, data } satisfies ExecutionArtifacts }
}

function parseFinding(value: unknown, refs: Set<string>, version: 1 | 2): Finding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (typeof input.id !== "string" || !input.id) return
  if (version === 2 && (typeof input.statement !== "string" || !input.statement.trim())) return
  return {
    id: input.id,
    ...(typeof input.statement === "string" ? { statement: input.statement } : {}),
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

function exactPreservationLiterals(prompt: string) {
  const values: string[] = []
  const pattern = /preserve\s+the\s+exact\s+(?:sentence|literal|text)\s*:\s*(['"])(.*?)\1/gi
  for (const match of prompt.matchAll(pattern)) {
    if (match[2]?.trim()) values.push(match[2].trim())
  }
  return unique(values)
}

function appendPreservationReceipt(answer: string, literals: string[]) {
  const missing = literals.filter((literal) => !answer.includes(literal))
  return missing.length ? `${answer}\n\nPreservation receipt: ${missing.map((literal) => `"${literal}"`).join("; ")}` : answer
}
