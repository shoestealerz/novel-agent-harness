export type WriterContextItem = {
  ref: string
  text: string
  kind?: "manuscript" | "story_state" | "instruction" | "plan"
  metadata?: Record<string, unknown>
}

export type WriterContextSpec = {
  focusRefs: string[]
  dependencyRefs?: string[]
  preservationRefs?: string[]
  preservationLiterals?: { ref: string; text: string }[]
  excludeRefs?: string[]
  throughRef?: string
}

export type WriterContextTask = {
  context?: WriterContextItem[]
  contextSpec?: WriterContextSpec
}

export type ContextStrategy = "supplied" | "maximum" | "task-aware"

export type ContextTrace = {
  strategy: ContextStrategy
  suppliedRefs: string[]
  selectedRefs: string[]
  excludedRefs: string[]
  contextItems: number
  contextWords: number
}

export function compileContext<T extends WriterContextTask>(
  task: T,
  catalog: WriterContextItem[],
  strategy: ContextStrategy,
) {
  const selected =
    strategy === "supplied"
      ? (task.context ?? [])
      : strategy === "maximum"
        ? maximumContext(task, catalog)
        : taskAwareContext(task, catalog)
  const selectedRefs = new Set(selected.map((item) => item.ref))
  const suppliedRefs = task.context?.map((item) => item.ref) ?? []
  return {
    task: { ...task, context: selected, contextSpec: strategy === "task-aware" ? task.contextSpec : undefined },
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

function maximumContext(task: WriterContextTask, catalog: WriterContextItem[]) {
  const catalogRefs = new Set(catalog.map((item) => item.ref))
  return [
    ...catalog.map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: ["maximum-background"] } })),
    ...(task.context ?? []).filter((item) => !catalogRefs.has(item.ref)),
  ]
}

function taskAwareContext(task: WriterContextTask, catalog: WriterContextItem[]) {
  if (!task.contextSpec) return task.context ?? []
  const catalogByRef = new Map(catalog.map((item) => [item.ref, item]))
  const catalogOrder = new Map(catalog.map((item, index) => [item.ref, index]))
  const roles = new Map<string, string[]>()
  const add = (refs: string[] | undefined, role: string) =>
    refs?.forEach((ref) => roles.set(ref, unique([...(roles.get(ref) ?? []), role])))
  add(task.contextSpec.focusRefs, "focus")
  add(task.contextSpec.dependencyRefs, "dependency")
  add(task.contextSpec.preservationRefs, "preservation")
  const requested = [...roles.keys()]
  const declared = unique([...requested, ...(task.contextSpec.throughRef ? [task.contextSpec.throughRef] : [])])
  const unknown = declared.filter((ref) => !catalogByRef.has(ref))
  if (unknown.length) throw new Error(`context specification references missing passages: ${unknown.join(", ")}`)
  task.contextSpec.preservationLiterals?.forEach((literal) => {
    if (!task.contextSpec?.preservationRefs?.includes(literal.ref)) {
      throw new Error(`exact preservation literal must reference a preservation passage: ${literal.ref}`)
    }
    if (!catalogByRef.get(literal.ref)?.text.includes(literal.text)) {
      throw new Error(`exact preservation literal is absent from ${literal.ref}`)
    }
  })
  const through = task.contextSpec.throughRef ? catalogOrder.get(task.contextSpec.throughRef) : undefined
  const excluded = new Set(task.contextSpec.excludeRefs ?? [])
  const selectedRefs = new Set(
    requested.filter((ref) => !excluded.has(ref) && (through === undefined || catalogOrder.get(ref)! <= through)),
  )
  const catalogSelected = catalog
    .filter((item) => selectedRefs.has(item.ref))
    .map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: roles.get(item.ref) } }))
  const external = (task.context ?? [])
    .filter((item) => !catalogByRef.has(item.ref) && !excluded.has(item.ref))
    .map((item) => ({ ...item, metadata: { ...item.metadata, contextRoles: ["supplied"] } }))
  return [...catalogSelected, ...external]
}

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

function unique(values: string[]) {
  return [...new Set(values)]
}
