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
  try {
    return requireObject(JSON.parse(cleaned), "model JSON response")
  } catch (error) {
    const object = firstJsonObject(cleaned)
    if (object && object !== cleaned) return requireObject(JSON.parse(object), "model JSON response")
    throw error
  }
}

function firstJsonObject(value: string) {
  const start = value.indexOf("{")
  if (start < 0) return
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < value.length; index++) {
    const character = value[index]!
    if (quoted) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') quoted = true
    else if (character === "{") depth++
    else if (character === "}" && --depth === 0) return value.slice(start, index + 1)
  }
}
