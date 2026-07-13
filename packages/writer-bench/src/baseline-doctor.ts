import { spawn } from "node:child_process"

const executable = process.env.WRITER_BENCH_OPENCODE_BIN ?? "opencode"
const opencode = await available(executable)
const rawModel = Boolean(process.env.WRITER_BENCH_MODEL)
const opencodeModel = Boolean(process.env.WRITER_BENCH_OPENCODE_MODEL)
const baseUrl = Boolean(process.env.WRITER_BENCH_BASE_URL)
const apiKey = Boolean(process.env.WRITER_BENCH_API_KEY ?? process.env.DEEPSEEK_API_KEY)
const sameModel = rawModel && opencodeModel && process.env.WRITER_BENCH_MODEL === modelPart(process.env.WRITER_BENCH_OPENCODE_MODEL!)
const report = {
  ready: opencode && rawModel && opencodeModel && sameModel,
  opencodeExecutable: { configured: executable !== "opencode", available: opencode },
  rawTarget: { model: rawModel, baseUrl, apiKey },
  stockOpenCode: { model: opencodeModel },
  sameModel,
  optionalJudgeModel: Boolean(process.env.WRITER_BENCH_JUDGE_MODEL),
  notes: [
    ...(!opencode ? ["Install OpenCode or set WRITER_BENCH_OPENCODE_BIN."] : []),
    ...(!rawModel ? ["Set WRITER_BENCH_MODEL."] : []),
    ...(!opencodeModel ? ["Set WRITER_BENCH_OPENCODE_MODEL."] : []),
    ...(rawModel && opencodeModel && !sameModel ? ["Raw and OpenCode model identifiers do not match."] : []),
    ...(!baseUrl ? ["WRITER_BENCH_BASE_URL will use the adapter default."] : []),
    ...(!apiKey ? ["No WRITER_BENCH_API_KEY or DEEPSEEK_API_KEY is present; this is valid only for an unauthenticated local endpoint."] : []),
  ],
}

console.log(JSON.stringify(report, null, 2))
if (!report.ready) process.exitCode = 2

function modelPart(value: string) {
  const slash = value.indexOf("/")
  return slash === -1 ? value : value.slice(slash + 1)
}

async function available(command: string) {
  const child = spawn(command, ["--version"], { stdio: "ignore", windowsHide: true })
  return new Promise<boolean>((resolve) => {
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}
