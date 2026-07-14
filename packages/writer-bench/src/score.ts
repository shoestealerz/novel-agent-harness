import type { Check, ComponentScore, ExecutionResponse, JudgeResponse, Task } from "./contracts.ts"

export function scoreResponse(task: Task, response: ExecutionResponse, judgment?: JudgeResponse) {
  const components = (task.checks ?? []).map((check) => scoreCheck(check, response))
  for (const criterion of task.criteria ?? []) {
    const score = judgment?.scores[criterion.id]
    if (typeof score !== "number") continue
    components.push({
      id: criterion.id,
      kind: "criterion",
      score,
      weight: criterion.weight ?? 1,
      safety: false,
      detail: judgment?.rationale?.[criterion.id],
    } satisfies ComponentScore)
  }
  const weight = components.reduce((total, component) => total + component.weight, 0)
  return {
    components,
    score: weight ? components.reduce((total, component) => total + component.score * component.weight, 0) / weight : null,
    safetyFailures: components.filter((component) => component.safety && component.score < 1).map((component) => component.id),
  }
}

function scoreCheck(check: Check, response: ExecutionResponse): ComponentScore {
  const score = checkValue(check, response)
  return {
    id: check.id,
    kind: "check",
    score,
    weight: check.weight ?? 1,
    safety: check.safety ?? false,
    metric: check.metric,
  }
}

function checkValue(check: Check, response: ExecutionResponse) {
  if (check.kind === "contains") return response.text.includes(check.value) ? 1 : 0
  if (check.kind === "not_contains") return response.text.includes(check.value) ? 0 : 1
  if (check.kind === "regex") return new RegExp(check.pattern, check.flags).test(response.text) ? 1 : 0
  if (check.kind === "word_count") {
    const count = response.text.trim() ? response.text.trim().split(/\s+/).length : 0
    return (check.min === undefined || count >= check.min) && (check.max === undefined || count <= check.max) ? 1 : 0
  }
  if (check.kind === "edit_word_count") {
    const edits = response.artifacts?.edits ?? []
    if (!edits.length || edits.some((edit) => typeof edit.replacement !== "string" || !edit.replacement.trim())) return 0
    return edits.every((edit) => {
      const count = edit.replacement!.trim().split(/\s+/).length
      return (check.min === undefined || count >= check.min) && (check.max === undefined || count <= check.max)
    }) ? 1 : 0
  }
  if (check.kind === "artifact_contains") return JSON.stringify(response.artifacts ?? {}).includes(check.value) ? 1 : 0
  if (check.kind === "finding_recall") {
    const actual = new Set(response.artifacts?.findings?.map((finding) => finding.id) ?? [])
    const expected = check.expected.length ? check.expected.filter((id) => actual.has(id)).length / check.expected.length : 1
    const forbidden = check.forbidden?.some((id) => actual.has(id)) ? 0 : 1
    return (expected + forbidden) / 2
  }
  if (check.kind === "finding_content") {
    const content = JSON.stringify({
      findings: response.artifacts?.findings ?? [],
      data: response.artifacts?.data ?? {},
    })
    const required = check.required.length
      ? check.required.filter((pattern) => matchesContent(content, pattern)).length / check.required.length
      : 1
    if (!check.forbidden?.length) return required
    const forbidden = check.forbidden.some((pattern) => matchesContent(content, pattern)) ? 0 : 1
    return (required + forbidden) / 2
  }
  if (check.kind === "evidence") {
    const actual = new Set([
      ...(response.artifacts?.evidence ?? []),
      ...(response.artifacts?.findings?.flatMap((finding) => finding.evidence ?? []) ?? []),
    ])
    const recall = check.required.length ? check.required.filter((ref) => actual.has(ref)).length / check.required.length : 1
    if (!check.allowed) return recall
    const precision = actual.size ? [...actual].filter((ref) => check.allowed?.includes(ref)).length / actual.size : 0
    if (!check.required.length) return precision
    return (recall + precision) / 2
  }
  if (check.kind === "proposal") {
    const proposal = response.artifacts?.proposal
    if (!proposal) return 0
    if (check.requirement === "valid") return proposal.validation.valid ? 1 : 0
    if (check.requirement === "uncommitted") return proposal.status === "proposed" && proposal.validation.checks.uncommitted ? 1 : 0
    if (check.requirement === "preconditions") {
      return proposal.validation.checks.preconditions
        && proposal.edits.length > 0
        && proposal.edits.every((edit) => /^sha256:[a-f0-9]{64}$/.test(edit.beforeSha256)) ? 1 : 0
    }
    return proposal.validation.checks.preservation && proposal.preservation.every((item) => item.receipted) ? 1 : 0
  }
  if (check.kind === "no_edits") return response.artifacts?.edits?.length ? 0 : 1
  if (check.kind === "max_findings") return (response.artifacts?.findings?.length ?? 0) <= check.max ? 1 : 0
  const edits = response.artifacts?.edits ?? []
  return edits.length > 0 && edits.every((edit) => check.allowed.includes(edit.target)) ? 1 : 0
}

function matchesContent(content: string, pattern: { all: string[]; flags?: string }) {
  return pattern.all.every((source) => new RegExp(source, pattern.flags ?? "i").test(content))
}
