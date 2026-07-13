import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { ContextItem, ExecutionTask } from "./contracts.ts"

export type ContextStrategy = "supplied" | "maximum" | "task-aware"

export type ContextTrace = {
  strategy: ContextStrategy
  suppliedRefs: string[]
  selectedRefs: string[]
  excludedRefs: string[]
  contextItems: number
  contextWords: number
}

export async function loadManuscriptContext(directory: string) {
  const files = (await readdir(resolve(directory), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
  const passages = await Promise.all(files.map(async (file) => {
    const content = await readFile(resolve(directory, file), "utf8")
    return [...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs)].map((match) => ({
      ref: match[1]!,
      text: match.groups!.text.trim(),
      kind: "manuscript" as const,
    }))
  }))
  const output = passages.flat()
  if (!output.length) throw new Error(`manuscript context directory has no referenced passages: ${directory}`)
  return output
}

export function compileContext(task: ExecutionTask, catalog: ContextItem[], strategy: ContextStrategy) {
  const selected = strategy === "supplied"
    ? task.context ?? []
    : strategy === "maximum"
      ? maximumContext(task, catalog)
      : taskAwareContext(task, catalog)
  const selectedRefs = new Set(selected.map((item) => item.ref))
  const suppliedRefs = task.context?.map((item) => item.ref) ?? []
  return {
    task: { ...task, context: selected },
    trace: {
      strategy,
      suppliedRefs,
      selectedRefs: [...selectedRefs],
      excludedRefs: unique([
        ...catalog.map((item) => item.ref).filter((ref) => !selectedRefs.has(ref)),
        ...suppliedRefs.filter((ref) => !selectedRefs.has(ref)),
      ]),
      contextItems: selected.length,
      contextWords: selected.reduce((total, item) => total + words(item.text), 0),
    } satisfies ContextTrace,
  }
}

function maximumContext(task: ExecutionTask, catalog: ContextItem[]) {
  const catalogRefs = new Set(catalog.map((item) => item.ref))
  return [
    ...catalog.map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: ["maximum-background"] } })),
    ...(task.context ?? []).filter((item) => !catalogRefs.has(item.ref)),
  ]
}

function taskAwareContext(task: ExecutionTask, catalog: ContextItem[]) {
  if (!task.contextSpec) return task.context ?? []
  const catalogByRef = new Map(catalog.map((item) => [item.ref, item]))
  const roles = new Map<string, string[]>()
  const add = (refs: string[] | undefined, role: string) => refs?.forEach((ref) => roles.set(ref, unique([...(roles.get(ref) ?? []), role])))
  add(task.contextSpec.focusRefs, "focus")
  add(task.contextSpec.dependencyRefs, "dependency")
  add(task.contextSpec.preservationRefs, "preservation")
  const requested = [...roles.keys()]
  const unknown = requested.filter((ref) => !catalogByRef.has(ref))
  if (unknown.length) throw new Error(`context specification references missing passages: ${unknown.join(", ")}`)
  const through = task.contextSpec.throughRef ? referenceOrder(task.contextSpec.throughRef) : undefined
  const excluded = new Set(task.contextSpec.excludeRefs ?? [])
  const selectedRefs = new Set(requested.filter((ref) => !excluded.has(ref) && (through === undefined || referenceOrder(ref) <= through)))
  const catalogSelected = catalog
    .filter((item) => selectedRefs.has(item.ref))
    .map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: roles.get(item.ref) } }))
  const external = (task.context ?? [])
    .filter((item) => !catalogByRef.has(item.ref) && !excluded.has(item.ref))
    .map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: ["supplied"] } }))
  return [...catalogSelected, ...external]
}

function referenceOrder(ref: string) {
  const match = /^ch(\d+):p(\d+)$/.exec(ref)
  if (!match) throw new Error(`temporal context requires an ordered chapter passage reference: ${ref}`)
  return Number(match[1]) * 1_000_000 + Number(match[2])
}

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function unique(values: string[]) {
  return [...new Set(values)]
}
