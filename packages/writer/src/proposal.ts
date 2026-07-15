import { claimsAppliedAuthority } from "./authority.ts"
import type { WriterContextItem, WriterContextSpec } from "./context.ts"
import { digest } from "./workspace.ts"

export type ProposalTask = {
  job: string
  prompt: string
  authority?: "read" | "propose"
  context?: WriterContextItem[]
  contextSpec?: WriterContextSpec
}

export type ProposalDraft = {
  text: string
  artifacts?: {
    edits?: { target: string; replacement?: string }[]
    data?: Record<string, unknown>
  }
}

export type EditProposal = {
  proposalVersion: 1
  id: `sha256:${string}`
  status: "proposed"
  request: string
  base: { ref: string; sha256: `sha256:${string}` }[]
  edits: { target: string; beforeSha256: `sha256:${string}`; replacement: string }[]
  preservation: {
    ref: string
    sha256: `sha256:${string}`
    literals: string[]
    receipted: boolean
  }[]
  validation: {
    valid: boolean
    checks: {
      authority: boolean
      scope: boolean
      preconditions: boolean
      changed: boolean
      preservation: boolean
      uncommitted: boolean
    }
  }
}

export function sealEditProposal(task: ProposalTask, response: ProposalDraft): EditProposal {
  const manuscript = new Map(
    (task.context ?? [])
      .filter((item) => (item.kind ?? "manuscript") === "manuscript")
      .map((item) => [item.ref, item.text]),
  )
  const edits = (response.artifacts?.edits ?? []).flatMap((edit) => {
    const before = manuscript.get(edit.target)
    if (!before || !edit.replacement?.trim()) return []
    return [{ target: edit.target, beforeSha256: digest(before), replacement: edit.replacement }]
  })
  const preservation = (task.contextSpec?.preservationRefs ?? []).flatMap((ref) => {
    const text = manuscript.get(ref)
    if (!text) return []
    const literals =
      task.contextSpec?.preservationLiterals?.filter((item) => item.ref === ref).map((item) => item.text) ?? []
    const data = response.artifacts?.data?.preservation
    const receipts = [
      response.text,
      ...(Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : []),
    ]
    return [
      {
        ref,
        sha256: digest(text),
        literals,
        receipted: literals.every((literal) => receipts.some((receipt) => receipt.includes(literal))),
      },
    ]
  })
  const allowed = new Set(task.contextSpec?.focusRefs ?? [])
  const uniqueTargets = new Set(edits.map((edit) => edit.target))
  const claimedCommit = claimsAppliedAuthority(response.text)
  const checks = {
    authority: task.job === "revise" && task.authority === "propose",
    scope: edits.length > 0 && uniqueTargets.size === edits.length && edits.every((edit) => allowed.has(edit.target)),
    preconditions: edits.length > 0 && edits.every((edit) => manuscript.has(edit.target)),
    changed: edits.length > 0 && edits.every((edit) => manuscript.get(edit.target)?.trim() !== edit.replacement.trim()),
    preservation:
      preservation.length === (task.contextSpec?.preservationRefs?.length ?? 0) &&
      preservation.every((item) => item.receipted),
    uncommitted: !claimedCommit,
  }
  const payload = {
    proposalVersion: 1 as const,
    status: "proposed" as const,
    request: task.prompt,
    base: [...manuscript].map(([ref, text]) => ({ ref, sha256: digest(text) })),
    edits,
    preservation,
    validation: { valid: Object.values(checks).every(Boolean), checks },
  }
  return { ...payload, id: proposalContentId(payload) }
}

export const createEditProposal = sealEditProposal

export function verifyEditProposal(value: unknown): EditProposal {
  const proposal = record(value, "proposal")
  if (proposal.proposalVersion !== 1) throw new Error("proposal.proposalVersion must be 1")
  if (proposal.status !== "proposed") throw new Error("proposal.status must be proposed")
  const id = string(proposal.id, "proposal.id")
  string(proposal.request, "proposal.request")
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error("proposal.id must be a SHA-256 content address")
  if (!Array.isArray(proposal.base) || !Array.isArray(proposal.edits) || !Array.isArray(proposal.preservation)) {
    throw new Error("proposal base, edits, and preservation must be arrays")
  }
  proposal.base.forEach((value, index) => sourceBinding(value, `proposal.base[${index}]`))
  proposal.edits.forEach((value, index) => {
    const edit = sourceBinding(value, `proposal.edits[${index}]`)
    string(edit.replacement, `proposal.edits[${index}].replacement`)
  })
  proposal.preservation.forEach((value, index) => {
    const item = sourceBinding(value, `proposal.preservation[${index}]`)
    if (!Array.isArray(item.literals) || !item.literals.every((literal) => typeof literal === "string")) {
      throw new Error(`proposal.preservation[${index}].literals must contain strings`)
    }
    if (typeof item.receipted !== "boolean") {
      throw new Error(`proposal.preservation[${index}].receipted must be boolean`)
    }
  })
  const validation = record(proposal.validation, "proposal.validation")
  const checks = record(validation.checks, "proposal.validation.checks")
  const names = ["authority", "scope", "preconditions", "changed", "preservation", "uncommitted"] as const
  for (const name of names) {
    if (typeof checks[name] !== "boolean") throw new Error(`proposal.validation.checks.${name} must be boolean`)
  }
  const valid = names.every((name) => checks[name] === true)
  if (validation.valid !== valid) throw new Error("proposal.validation.valid does not match its checks")
  const { id: _storedId, ...payload } = proposal
  if (proposalContentId(payload as Omit<EditProposal, "id">) !== id) {
    throw new Error("proposal content address does not match its payload")
  }
  return proposal as EditProposal
}

export function proposalContentId(value: Omit<EditProposal, "id">): `sha256:${string}` {
  return digest(stableJson(value))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function sourceBinding(value: unknown, label: string) {
  const item = record(value, label)
  string(item.ref ?? item.target, `${label}.${item.ref === undefined ? "target" : "ref"}`)
  const sha = item.sha256 ?? item.beforeSha256
  if (typeof sha !== "string" || !/^sha256:[a-f0-9]{64}$/.test(sha)) throw new Error(`${label} requires a SHA-256 hash`)
  return item
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`)
  return value
}
