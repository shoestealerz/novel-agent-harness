import { spawn } from "node:child_process"
import type { ExecutionRequest, ExecutionResponse, JudgeRequest, JudgeResponse, Target } from "./contracts.ts"
import { protocolVersion, requireObject, requireString } from "./contracts.ts"

export async function executeTarget(target: Target, request: ExecutionRequest) {
  return parseExecutionResponse(await invoke(target, request), request.task.id)
}

export async function executeJudge(target: Target, request: JudgeRequest) {
  return parseJudgeResponse(await invoke(target, request), request.task.id)
}

async function invoke(target: Target, request: ExecutionRequest | JudgeRequest) {
  const command = target.command[0] === "{node}" ? process.execPath : target.command[0]
  if (!command) throw new Error(`target ${target.id} has an empty command`)
  const child = spawn(command, target.command.slice(1), {
    cwd: target.cwd,
    env: { ...process.env, ...target.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
  let stdinError: Error | undefined
  child.stdin.on("error", (error) => {
    stdinError = error
  })
  child.stdin.end(JSON.stringify(request))
  const timeout = setTimeout(() => child.kill(), target.timeoutMs ?? 120_000)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  }).finally(() => clearTimeout(timeout))
  if (code !== 0) throw new Error(`target ${target.id} exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`)
  if (stdinError) throw new Error(`target ${target.id} stdin failed: ${stdinError.message}`)
  const output = Buffer.concat(stdout).toString("utf8").trim()
  if (!output) throw new Error(`target ${target.id} returned no output`)
  try {
    return JSON.parse(output) as unknown
  } catch (error) {
    throw new Error(`target ${target.id} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

function parseExecutionResponse(value: unknown, taskId: string): ExecutionResponse {
  const input = requireObject(value, "execution response")
  if (input.protocolVersion !== protocolVersion) throw new Error("execution response protocolVersion must be 1")
  if (requireString(input.taskId, "execution response.taskId") !== taskId) throw new Error("execution response taskId mismatch")
  return {
    ...(input as ExecutionResponse),
    protocolVersion,
    taskId,
    text: typeof input.text === "string" ? input.text : "",
  }
}

function parseJudgeResponse(value: unknown, taskId: string): JudgeResponse {
  const input = requireObject(value, "judge response")
  if (input.protocolVersion !== protocolVersion) throw new Error("judge response protocolVersion must be 1")
  if (requireString(input.taskId, "judge response.taskId") !== taskId) throw new Error("judge response taskId mismatch")
  const scores = requireObject(input.scores, "judge response.scores")
  Object.entries(scores).forEach(([id, score]) => {
    if (typeof score !== "number" || score < 0 || score > 1) throw new Error(`judge score ${id} must be between 0 and 1`)
  })
  return { protocolVersion, taskId, scores: scores as Record<string, number>, rationale: input.rationale as Record<string, string> }
}
