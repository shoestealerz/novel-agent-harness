import { spawn } from "node:child_process"
import { parseOpenCodeEvents } from "./opencode-events.ts"

export async function runOpenCode(prompt: string) {
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
