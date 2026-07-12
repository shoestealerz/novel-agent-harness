import { spawn } from "node:child_process"
import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { plainArtifacts, readRequest, renderTask } from "./shared.ts"
import { parseOpenCodeEvents } from "./opencode-events.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the OpenCode CLI target executes systems; configure a separate judge target")
const task = request.task as ExecutionTask
const started = performance.now()
const output = await runOpenCode(renderTask(task))
console.log(JSON.stringify({
  protocolVersion,
  taskId: task.id,
  text: output.text,
  artifacts: plainArtifacts(task, output.text),
  usage: { ...output.usage, latencyMs: performance.now() - started },
  metadata: { adapter: "opencode-cli", model: process.env.WRITER_BENCH_OPENCODE_MODEL, agent: process.env.WRITER_BENCH_OPENCODE_AGENT },
}))

async function runOpenCode(prompt: string) {
  const args = ["run", "--format", "json"]
  if (process.env.WRITER_BENCH_OPENCODE_MODEL) args.push("--model", process.env.WRITER_BENCH_OPENCODE_MODEL)
  if (process.env.WRITER_BENCH_OPENCODE_AGENT) args.push("--agent", process.env.WRITER_BENCH_OPENCODE_AGENT)
  if (process.env.WRITER_BENCH_OPENCODE_DIR) args.push("--dir", process.env.WRITER_BENCH_OPENCODE_DIR)
  if (process.env.WRITER_BENCH_OPENCODE_ATTACH) args.push("--attach", process.env.WRITER_BENCH_OPENCODE_ATTACH)
  const child = spawn(process.env.WRITER_BENCH_OPENCODE_BIN ?? "opencode", args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
  child.stdin.end(prompt)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  })
  if (code !== 0) throw new Error(`opencode exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`)
  return parseOpenCodeEvents(Buffer.concat(stdout).toString("utf8"))
}
