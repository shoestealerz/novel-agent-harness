import { spawn } from "node:child_process"
import { parseOpenCodeEvents } from "./opencode-events.ts"

export async function runOpenCode(prompt: string, options: { directory?: string } = {}) {
  const args = ["run", "--format", "json"]
  if (process.env.WRITER_BENCH_OPENCODE_MODEL) args.push("--model", process.env.WRITER_BENCH_OPENCODE_MODEL)
  if (process.env.WRITER_BENCH_OPENCODE_AGENT) args.push("--agent", process.env.WRITER_BENCH_OPENCODE_AGENT)
  const directory = options.directory ?? process.env.WRITER_BENCH_OPENCODE_DIR
  if (directory) args.push("--dir", directory)
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
  let stdinError: Error | undefined
  child.stdin.on("error", (error) => {
    stdinError = error
  })
  child.stdin.end(prompt)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  })
  const stderrText = Buffer.concat(stderr).toString("utf8").trim()
  const stdoutText = Buffer.concat(stdout).toString("utf8").trim()
  if (code !== 0) throw new Error(`opencode exited ${code}: ${stderrText || stdoutText || "no diagnostic output"}`)
  if (stdinError) throw new Error(`opencode stdin failed: ${stdinError.message}`)
  return parseOpenCodeEvents(stdoutText)
}
