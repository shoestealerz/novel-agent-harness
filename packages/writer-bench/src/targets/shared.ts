import type { ExecutionArtifacts, ExecutionTask } from "../contracts.ts"
import { requireObject } from "../contracts.ts"

export async function readRequest() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return requireObject(JSON.parse(Buffer.concat(chunks).toString("utf8")), "request")
}

export function renderTask(task: ExecutionTask) {
  const context = task.context?.length
    ? task.context.map((item) => `[${item.ref}]${item.kind ? ` (${item.kind})` : ""}\n${item.text}`).join("\n\n")
    : "No additional context was supplied."
  return `Author request:
${task.prompt}

Authority: ${task.authority ?? "read"}. ${task.authority === "propose" ? "Propose changes; do not claim to commit them." : "Do not alter source material."}

Context:
${context}`
}

export function citedEvidence(task: ExecutionTask, text: string) {
  return task.context?.map((item) => item.ref).filter((ref) => text.includes(ref)) ?? []
}

export function plainArtifacts(task: ExecutionTask, text: string): ExecutionArtifacts {
  return { evidence: citedEvidence(task, text) }
}

export function requiredEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function parseJsonText(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  return requireObject(JSON.parse(cleaned), "model JSON response")
}
