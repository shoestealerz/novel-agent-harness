import { compileContext, loadManuscriptContext } from "../context-compiler.ts"
import { protocolVersion, requireObject, type ExecutionTask, type Finding } from "../contracts.ts"
import { completion } from "./openai-client.ts"
import { parseJsonText, readRequest, requiredEnvironment } from "./shared.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the critic experiment target only executes systems")
const mode = requiredEnvironment("WRITER_BENCH_CRITIC_MODE")
if (mode !== "deterministic" && mode !== "critic") throw new Error(`unsupported critic mode: ${mode}`)
const task = request.task as ExecutionTask
const compiled = compileContext(
  task,
  await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR")),
  "task-aware",
)
const started = performance.now()
if (mode === "deterministic") {
  console.log(JSON.stringify({
    protocolVersion,
    taskId: task.id,
    text: "Deterministic authority, scope, and source-precondition validation passed. No semantic critic executed.",
    artifacts: { findings: [], evidence: [], edits: [], data: { deterministicValidation: "pass" } },
    usage: { latencyMs: performance.now() - started },
    metadata: { adapter: "proposal-deterministic-validator", contextTrace: compiled.trace },
  }))
} else {
  const response = await completion([
    {
      role: "system",
      content: "You are a scoped fiction-proposal critic, not an editor. Inspect the proposed replacement against the supplied manuscript passages and author constraints. Flag only material semantic continuity, character-knowledge, preservation, voice, motif, consent, or relationship violations. Preserve intentional ambiguity. Never rewrite prose, create edits, apply changes, or claim a commit. Return JSON only: {\"verdict\":\"pass|flag\",\"findings\":[{\"category\":\"continuity|knowledge|preservation|voice|motif|consent|relationship\",\"statement\":\"specific human-readable issue\",\"evidence\":[\"exact supplied reference\"],\"confidence\":0.0}]}.",
    },
    {
      role: "user",
      content: JSON.stringify({ request: task.prompt, authority: task.authority, context: compiled.task.context }),
    },
  ], undefined, { json: true, retryIncomplete: true, validate: parseCritique })
  const critique = parseCritique(response.text)
  const evidence = unique(critique.findings.flatMap((finding) => finding.evidence ?? []))
  console.log(JSON.stringify({
    protocolVersion,
    taskId: task.id,
    text: critique.findings.length ? critique.findings.map((finding) => finding.statement).join("\n") : "No material semantic issue found.",
    artifacts: { findings: critique.findings, evidence, edits: [], data: { verdict: critique.verdict, deterministicValidation: "pass" } },
    usage: { ...response.usage, latencyMs: performance.now() - started },
    metadata: { adapter: "proposal-semantic-critic", model: requiredEnvironment("WRITER_BENCH_MODEL"), contextTrace: compiled.trace },
  }))
}

function parseCritique(value: string) {
  const input = parseJsonText(value)
  const verdict = input.verdict === "pass" ? "pass" : "flag"
  const refs = new Set(compiled.task.context?.map((item) => item.ref).filter((ref) => /^ch\d+:p\d+$/.test(ref)) ?? [])
  const findings = Array.isArray(input.findings) ? input.findings.flatMap((value): Finding[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const item = requireObject(value, "critic finding")
    if (typeof item.statement !== "string" || !item.statement.trim()) return []
    const category = typeof item.category === "string" ? item.category : "semantic"
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.filter((ref): ref is string => typeof ref === "string" && refs.has(ref))
      : []
    return [{
      id: `critic:${category}`,
      statement: item.statement,
      evidence,
      confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : undefined,
    }]
  }) : []
  return { verdict, findings }
}

function unique(values: string[]) {
  return [...new Set(values)]
}
