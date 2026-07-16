import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyEditProposal } from "@novel-agent-harness/writer"
import {
  protocolVersion,
  requireObject,
  requireString,
  type ExecutionArtifacts,
  type ExecutionResponse,
  type ExecutionTask,
  type Finding,
  type Usage,
} from "../contracts.ts"

export type ProductionWriterOptions = {
  command?: string[]
  model?: string
  timeoutMs?: number
}

const supportedJobs = new Set(["explain", "diagnose", "plan", "revise"])
const passagePattern = /^([a-z][a-z0-9_-]*):([a-z][a-z0-9_-]*)$/

export async function executeProductionWriter(
  task: ExecutionTask,
  options: ProductionWriterOptions = {},
): Promise<ExecutionResponse> {
  validateTask(task)
  const root = await mkdtemp(join(tmpdir(), "writer-bench-production-"))
  try {
    await writeProductionWorkspace(root, task)
    const command = options.command ?? productionWriterCommand()
    const model = options.model ?? requiredEnvironment("WRITER_BENCH_OPENCODE_MODEL")
    const started = performance.now()
    const invocation = await invoke(command, buildWriterArguments(task, root, model), options.timeoutMs, {
      ...process.env,
      OPENCODE_DB: join(root, ".opencode.db"),
    })
    return productionExecutionResponse(task, invocation.output, performance.now() - started, model, invocation.phases)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export async function writeProductionWorkspace(root: string, task: ExecutionTask) {
  const context = task.context ?? []
  if (!context.length) throw new Error("production Writer tasks require manuscript context")
  const chapters = new Map<string, { ref: string; passageID: string; text: string }[]>()
  const refs = new Set<string>()
  for (const item of context) {
    if ((item.kind ?? "manuscript") !== "manuscript") {
      throw new Error(`production Writer context must be manuscript text: ${item.ref}`)
    }
    const match = passagePattern.exec(item.ref)
    if (!match) throw new Error(`production Writer passage ref is invalid: ${item.ref}`)
    if (!item.text.trim()) throw new Error(`production Writer passage is empty: ${item.ref}`)
    if (item.text.includes("novel-agent:passage")) {
      throw new Error(`production Writer passage contains a reserved marker: ${item.ref}`)
    }
    if (refs.has(item.ref)) throw new Error(`production Writer context repeats passage ref: ${item.ref}`)
    refs.add(item.ref)
    const chapterID = match[1]!
    const passageID = match[2]!
    const passages = chapters.get(chapterID) ?? []
    passages.push({ ref: item.ref, passageID, text: item.text })
    chapters.set(chapterID, passages)
  }
  await mkdir(root, { recursive: true })
  const manifest = {
    formatVersion: 1,
    title: `Benchmark: ${task.suite}`,
    chapters: [...chapters].map(([id], index) => ({ id, path: `chapter-${String(index + 1).padStart(3, "0")}.md` })),
  }
  for (const [index, [chapterID, passages]] of [...chapters].entries()) {
    const path = join(root, manifest.chapters[index]!.path)
    const body = passages
      .map((passage) => `<!-- novel-agent:passage ${chapterID}:${passage.passageID} -->\n${passage.text}`)
      .join("\n\n")
    await writeFile(path, `${body}\n`)
  }
  await writeFile(join(root, "novel.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function buildWriterArguments(task: ExecutionTask, root: string, model: string) {
  validateTask(task)
  const args = ["writer", "run", task.prompt, "--dir", root, "--job", task.job, "--model", model, "--format", "json"]
  const contextSpec = task.contextSpec
  if (task.contextSelection === "automatic") {
    args.push("--maximum-context")
    appendMany(args, "--focus", contextSpec?.focusRefs)
    appendMany(args, "--preserve", contextSpec?.preservationRefs)
    appendMany(
      args,
      "--preserve-literal",
      contextSpec?.preservationLiterals?.map((item) => `${item.ref}=${item.text}`),
    )
    if (contextSpec?.throughRef) args.push("--through", contextSpec.throughRef)
    return args
  }
  if (!contextSpec) return args
  appendMany(args, "--focus", contextSpec.focusRefs)
  appendMany(args, "--preserve", contextSpec.preservationRefs)
  appendMany(
    args,
    "--preserve-literal",
    contextSpec.preservationLiterals?.map((item) => `${item.ref}=${item.text}`),
  )
  appendMany(args, "--exclude", contextSpec.excludeRefs)
  if (contextSpec.throughRef) args.push("--through", contextSpec.throughRef)
  return args
}

export function productionExecutionResponse(
  task: ExecutionTask,
  value: unknown,
  latencyMs: number,
  model: string,
  phases?: WriterPhaseUsage,
): ExecutionResponse {
  const output = requireObject(value, "production Writer output")
  if (output.protocolVersion !== 1) throw new Error("production Writer protocolVersion must be 1")
  if (output.job !== task.job) throw new Error("production Writer job mismatch")
  const authority = task.job === "revise" ? "propose" : "read"
  if (output.authority !== authority) throw new Error("production Writer authority mismatch")
  const result = requireObject(output.result, "production Writer result")
  const answer = requireString(result.answer, "production Writer result.answer")
  const proposal = result.proposal === undefined ? undefined : verifyEditProposal(result.proposal)
  const artifacts: ExecutionArtifacts = {
    evidence: stringArray(result.evidence, "production Writer result.evidence"),
    findings: findings(result.findings),
    edits:
      proposal?.edits.map((edit) => ({ target: edit.target, replacement: edit.replacement })) ?? edits(result.edits),
    data: requireObject(result.data, "production Writer result.data"),
    ...(proposal ? { proposal } : {}),
  }
  return {
    protocolVersion,
    taskId: task.id,
    text: answer,
    artifacts,
    usage: usage(output.usage, latencyMs),
    metadata: {
      adapter: "production-opencode-writer",
      model,
      sessionID: requireString(output.sessionID, "production Writer sessionID"),
      authority,
      contextTrace: output.contextTrace,
      ...(phases ? { phaseUsage: phases } : {}),
    },
  }
}

export function productionWriterCommand() {
  const configured = process.env.WRITER_BENCH_WRITER_COMMAND
  if (!configured) return [process.env.WRITER_BENCH_OPENCODE_BIN ?? "opencode"]
  const parsed: unknown = JSON.parse(configured)
  if (!Array.isArray(parsed) || !parsed.length || !parsed.every((item) => typeof item === "string" && item)) {
    throw new Error("WRITER_BENCH_WRITER_COMMAND must be a JSON array of command arguments")
  }
  return parsed
}

async function invoke(command: string[], args: string[], timeoutMs = 540_000, env = process.env) {
  const executable = command[0]
  if (!executable) throw new Error("production Writer command is empty")
  const child = spawn(executable, [...command.slice(1), ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  const progress = new WriterProgressCollector()
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on("data", (chunk: Buffer) => {
    stderr.push(chunk)
    progress.push(chunk.toString("utf8"), performance.now())
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, timeoutMs)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  }).finally(() => clearTimeout(timeout))
  if (timedOut) throw new Error(`production Writer timed out after ${timeoutMs}ms`)
  if (code !== 0) {
    const stderrText = Buffer.concat(stderr).toString("utf8").trim()
    const stdoutText = Buffer.concat(stdout).toString("utf8").trim()
    throw new Error(`production Writer exited ${code}: ${stderrText || stdoutText || "no diagnostic output"}`)
  }
  const text = Buffer.concat(stdout).toString("utf8").trim()
  if (!text) throw new Error("production Writer returned no output")
  try {
    return { output: JSON.parse(text) as unknown, phases: progress.finish(performance.now()) }
  } catch (error) {
    throw new Error(`production Writer returned invalid JSON: ${message(error)}`, { cause: error })
  }
}

export type WriterPhaseUsage = {
  contextSelection?: PhaseUsage
  execution: PhaseUsage
}

export type PhaseUsage = {
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

type ProgressSample = {
  atMs: number
  event: {
    emittedAtMs?: unknown
    phase?: unknown
    status?: unknown
    usage?: unknown
  }
}

export function writerPhaseUsage(samples: ProgressSample[]): WriterPhaseUsage | undefined {
  const starts = new Map<string, number>()
  const completed = new Map<string, PhaseUsage>()
  for (const sample of samples) {
    const phase = sample.event.phase
    const status = sample.event.status
    if (phase !== "context-selection" && phase !== "execution") continue
    if (status === "started") {
      starts.set(phase, sample.atMs)
      continue
    }
    if (status !== "completed") continue
    const start = starts.get(phase)
    if (start === undefined) continue
    const usage = phaseUsage(sample.event.usage, sample.atMs - start)
    if (usage) completed.set(phase, usage)
  }
  const totalExecution = completed.get("execution")
  if (!totalExecution) return undefined
  const contextSelection = completed.get("context-selection")
  return {
    ...(contextSelection ? { contextSelection } : {}),
    execution: contextSelection
      ? {
          inputTokens: Math.max(0, totalExecution.inputTokens - contextSelection.inputTokens),
          outputTokens: Math.max(0, totalExecution.outputTokens - contextSelection.outputTokens),
          costUsd: Math.max(0, totalExecution.costUsd - contextSelection.costUsd),
          latencyMs: totalExecution.latencyMs,
        }
      : totalExecution,
  }
}

class WriterProgressCollector {
  private buffer = ""
  private readonly samples: ProgressSample[] = []

  push(value: string, atMs: number) {
    this.buffer += value
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ""
    for (const line of lines) this.line(line, atMs)
  }

  finish(atMs: number) {
    if (this.buffer) this.line(this.buffer, atMs)
    return writerPhaseUsage(this.samples)
  }

  private line(line: string, atMs: number) {
    const prefix = "writer-progress "
    if (!line.startsWith(prefix)) return
    try {
      const event = JSON.parse(line.slice(prefix.length)) as ProgressSample["event"]
      const emittedAtMs = event.emittedAtMs
      this.samples.push({ atMs: typeof emittedAtMs === "number" && Number.isFinite(emittedAtMs) ? emittedAtMs : atMs, event })
    } catch {
      // Preserve malformed stderr for process diagnostics; it is not valid phase telemetry.
    }
  }
}

function phaseUsage(value: unknown, latencyMs: number): PhaseUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const inputTokens = input.inputTokens
  const outputTokens = input.outputTokens
  const costUsd = input.costUsd
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number" || typeof costUsd !== "number") return undefined
  return { inputTokens, outputTokens, costUsd, latencyMs: Math.max(0, latencyMs) }
}

function validateTask(task: ExecutionTask) {
  if (!supportedJobs.has(task.job)) throw new Error(`production Writer does not support job: ${task.job}`)
  const authority = task.job === "revise" ? "propose" : "read"
  if (task.authority && task.authority !== authority) {
    throw new Error(`production Writer authority does not match ${task.job}: ${task.authority}`)
  }
}

function appendMany(args: string[], flag: string, values?: string[]) {
  for (const value of values ?? []) args.push(flag, value)
}

function findings(value: unknown): Finding[] {
  if (!Array.isArray(value)) throw new Error("production Writer result.findings must be an array")
  return value.map((item, index) => {
    const input = requireObject(item, `production Writer finding[${index}]`)
    const confidence = input.confidence
    if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
      throw new Error(`production Writer finding[${index}].confidence must be between 0 and 1`)
    }
    return {
      id: requireString(input.id, `production Writer finding[${index}].id`),
      statement: requireString(input.statement, `production Writer finding[${index}].statement`),
      evidence: stringArray(input.evidence, `production Writer finding[${index}].evidence`),
      ...(confidence === undefined ? {} : { confidence }),
    }
  })
}

function edits(value: unknown) {
  if (!Array.isArray(value)) throw new Error("production Writer result.edits must be an array")
  return value.map((item, index) => {
    const input = requireObject(item, `production Writer edit[${index}]`)
    return {
      target: requireString(input.target, `production Writer edit[${index}].target`),
      replacement: requireString(input.replacement, `production Writer edit[${index}].replacement`),
    }
  })
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`)
  }
  return [...value]
}

function usage(value: unknown, latencyMs: number): Usage {
  const input = requireObject(value, "production Writer usage")
  return {
    inputTokens: finite(input.inputTokens, "production Writer usage.inputTokens"),
    outputTokens: finite(input.outputTokens, "production Writer usage.outputTokens"),
    costUsd: finite(input.costUsd, "production Writer usage.costUsd"),
    latencyMs,
  }
}

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be nonnegative`)
  return value
}

function requiredEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
