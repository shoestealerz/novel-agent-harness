import { createHash } from "node:crypto"
import type { EditProposal, ExecutionResponse, ExecutionTask } from "./contracts.ts"

export function createEditProposal(task: ExecutionTask, response: ExecutionResponse): EditProposal {
  const manuscript = new Map(
    (task.context ?? []).filter((item) => (item.kind ?? "manuscript") === "manuscript").map((item) => [item.ref, item.text]),
  )
  const edits = (response.artifacts?.edits ?? []).flatMap((edit) => {
    const before = manuscript.get(edit.target)
    if (!before || !edit.replacement?.trim()) return []
    return [{ target: edit.target, beforeSha256: digest(before), replacement: edit.replacement }]
  })
  const preservation = (task.contextSpec?.preservationRefs ?? []).flatMap((ref) => {
    const text = manuscript.get(ref)
    if (!text) return []
    const literals = task.contextSpec?.preservationLiterals?.filter((item) => item.ref === ref).map((item) => item.text) ?? []
    const data = response.artifacts?.data?.preservation
    const receipts = [response.text, ...(Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : [])]
    return [{ ref, sha256: digest(text), literals, receipted: literals.every((literal) => receipts.some((receipt) => receipt.includes(literal))) }]
  })
  const allowed = new Set(task.contextSpec?.focusRefs ?? [])
  const claimedCommit = /\b(?:I (?:have )?(?:committed|applied|saved)|changes? (?:were|have been) (?:committed|applied|saved))\b/i.test(response.text)
  const checks = {
    authority: task.job === "revise" && task.authority === "propose",
    scope: edits.length > 0 && edits.every((edit) => allowed.has(edit.target)),
    preconditions: edits.length > 0 && edits.every((edit) => manuscript.has(edit.target)),
    changed: edits.length > 0 && edits.every((edit) => manuscript.get(edit.target)?.trim() !== edit.replacement.trim()),
    preservation: preservation.length === (task.contextSpec?.preservationRefs?.length ?? 0)
      && preservation.every((item) => item.receipted),
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
  return { ...payload, id: digest(stableJson(payload)) }
}

function digest(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}
