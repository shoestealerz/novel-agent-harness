export const protocolVersion = 1 as const

export type Job = "explain" | "diagnose" | "brainstorm" | "plan" | "revise" | "synchronize" | "generate" | "translate"

export type ContextItem = {
  ref: string
  text: string
  kind?: "manuscript" | "story_state" | "instruction" | "plan"
  metadata?: Record<string, unknown>
}

export type Check =
  | { id: string; kind: "contains"; value: string; weight?: number; safety?: boolean }
  | { id: string; kind: "not_contains"; value: string; weight?: number; safety?: boolean }
  | { id: string; kind: "regex"; pattern: string; flags?: string; weight?: number; safety?: boolean }
  | { id: string; kind: "word_count"; min?: number; max?: number; weight?: number; safety?: boolean }
  | { id: string; kind: "edit_word_count"; min?: number; max?: number; weight?: number; safety?: boolean }
  | { id: string; kind: "finding_recall"; expected: string[]; forbidden?: string[]; weight?: number; safety?: boolean }
  | { id: string; kind: "finding_content"; required: FindingPattern[]; forbidden?: FindingPattern[]; weight?: number; safety?: boolean }
  | { id: string; kind: "artifact_contains"; value: string; weight?: number; safety?: boolean }
  | { id: string; kind: "evidence"; required: string[]; allowed?: string[]; weight?: number; safety?: boolean }
  | { id: string; kind: "edit_scope"; allowed: string[]; weight?: number; safety?: boolean }

export type Criterion = {
  id: string
  description: string
  weight?: number
}

export type Task = {
  id: string
  suite: string
  suiteVersion: string
  source: string
  job: Job
  language?: string
  prompt: string
  context?: ContextItem[]
  authority?: "read" | "propose"
  checks?: Check[]
  criteria?: Criterion[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type Finding = {
  id: string
  statement?: string
  evidence?: string[]
  confidence?: number
}

export type FindingPattern = {
  all: string[]
  flags?: string
}

export type Edit = {
  target: string
  replacement?: string
}

export type ExecutionArtifacts = {
  findings?: Finding[]
  evidence?: string[]
  edits?: Edit[]
  data?: Record<string, unknown>
}

export type Usage = {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  latencyMs?: number
}

export type ExecutionRequest = {
  protocolVersion: typeof protocolVersion
  kind: "execute"
  runId: string
  trial: number
  task: ExecutionTask
}

export type ExecutionTask = Omit<Task, "checks" | "criteria" | "metadata">

export type ExecutionResponse = {
  protocolVersion: typeof protocolVersion
  taskId: string
  text: string
  artifacts?: ExecutionArtifacts
  usage?: Usage
  metadata?: Record<string, unknown>
}

export type JudgeRequest = {
  protocolVersion: typeof protocolVersion
  kind: "judge"
  task: ExecutionTask & { criteria?: Criterion[] }
  response: ExecutionResponse
}

export type JudgeResponse = {
  protocolVersion: typeof protocolVersion
  taskId: string
  scores: Record<string, number>
  rationale?: Record<string, string>
}

export type Target = {
  id: string
  label?: string
  command: string[]
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  baseModel?: string
  comparisonKey?: string
  metadata?: Record<string, unknown>
}

export type TargetFile = {
  systems: Target[]
  judge?: Target
}

export type ComponentScore = {
  id: string
  kind: "check" | "criterion"
  score: number
  weight: number
  safety: boolean
  detail?: string
}

export type RunRecord = {
  task: Task
  targetId: string
  trial: number
  response?: ExecutionResponse
  components: ComponentScore[]
  score: number | null
  safetyFailures: string[]
  error?: string
}

export type RunFile = {
  formatVersion: 1
  runId: string
  createdAt: string
  suiteFiles: string[]
  targets: Target[]
  judge?: Target
  trials: number
  records: RunRecord[]
  metrics?: MetricRecord[]
}

export type MetricRecord = {
  targetId: string
  suite: string
  metric: string
  value: number
  direction: "higher" | "lower"
  source?: string
  metadata?: Record<string, unknown>
}

export type GateConfig = {
  maxMeanRegression?: number
  minMeanDelta?: number
  minLowerConfidenceBound?: number
  maxCandidateSafetyFailures?: number
  maxSafetyFailureIncrease?: number
  requireSameComparisonKey?: boolean
  maxSuiteRegression?: Record<string, number>
  externalMetrics?: Record<string, { maxRegression?: number; minDelta?: number }>
}

export function requireObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

export function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`)
  return value
}

export function parseTask(value: unknown): Task {
  const input = requireObject(value, "task")
  const job = requireString(input.job, "task.job")
  const jobs: Job[] = ["explain", "diagnose", "brainstorm", "plan", "revise", "synchronize", "generate", "translate"]
  if (!jobs.includes(job as Job)) throw new Error(`task.job is unsupported: ${job}`)
  return {
    ...(input as Task),
    id: requireString(input.id, "task.id"),
    suite: requireString(input.suite, "task.suite"),
    suiteVersion: requireString(input.suiteVersion, "task.suiteVersion"),
    source: requireString(input.source, "task.source"),
    job: job as Job,
    prompt: requireString(input.prompt, "task.prompt"),
  }
}

export function parseTargetFile(value: unknown): TargetFile {
  const input = requireObject(value, "targets")
  if (!Array.isArray(input.systems) || !input.systems.length) throw new Error("targets.systems must be a non-empty array")
  return {
    systems: input.systems.map(parseTarget),
    judge: input.judge ? parseTarget(input.judge) : undefined,
  }
}

function parseTarget(value: unknown): Target {
  const input = requireObject(value, "target")
  if (!Array.isArray(input.command) || !input.command.every((part) => typeof part === "string")) {
    throw new Error("target.command must be an array of strings")
  }
  return {
    ...(input as Target),
    id: requireString(input.id, "target.id"),
    command: input.command as string[],
  }
}
