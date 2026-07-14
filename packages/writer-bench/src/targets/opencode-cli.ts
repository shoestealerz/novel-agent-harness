import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { plainArtifacts, readRequest, renderTask } from "./shared.ts"
import { runOpenCode } from "./opencode-runner.ts"

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

