import { compileContext, loadManuscriptContext } from "../context-compiler.ts"
import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { createEditProposal } from "../edit-proposal.ts"
import { completion } from "./openai-client.ts"
import { runOpenCode } from "./opencode-runner.ts"
import { plainArtifacts, readRequest, renderTask, requiredEnvironment } from "./shared.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the integrated experiment target only executes systems")
const mode = requiredEnvironment("WRITER_BENCH_INTEGRATED_MODE")
if (mode !== "raw" && mode !== "stock" && mode !== "integrated") throw new Error(`unsupported integrated mode: ${mode}`)
const compiled = compileContext(
  request.task as ExecutionTask,
  await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR")),
  "task-aware",
)
const started = performance.now()

if (mode === "integrated") {
  const response = await executeWriterContract(compiled.task, "integrated-writer-harness", { contextTrace: compiled.trace })
  const proposal = createEditProposal(compiled.task, response)
  console.log(JSON.stringify({ ...response, artifacts: { ...response.artifacts, proposal } }))
} else {
  const output = mode === "raw"
    ? await completion([
      {
        role: "system",
        content: "You are responding directly to a fiction writer. Follow the request and proposal-only authority exactly. Cite supplied passage references and do not claim to commit changes.",
      },
      { role: "user", content: renderTask(compiled.task) },
    ])
    : await runStockOpenCode(renderTask(compiled.task))
  console.log(JSON.stringify({
    protocolVersion,
    taskId: compiled.task.id,
    text: output.text,
    artifacts: plainArtifacts(compiled.task, output.text),
    usage: { ...output.usage, latencyMs: performance.now() - started },
    metadata: {
      adapter: mode === "raw" ? "integrated-control-raw" : "integrated-control-stock-opencode",
      model: mode === "raw" ? requiredEnvironment("WRITER_BENCH_MODEL") : process.env.WRITER_BENCH_OPENCODE_MODEL,
      contextTrace: compiled.trace,
    },
  }))
}

async function runStockOpenCode(prompt: string) {
  const directory = await mkdtemp(join(tmpdir(), "writer-bench-integrated-"))
  const previous = process.env.WRITER_BENCH_OPENCODE_DIR
  process.env.WRITER_BENCH_OPENCODE_DIR = directory
  try {
    return await runOpenCode(prompt)
  } finally {
    if (previous) process.env.WRITER_BENCH_OPENCODE_DIR = previous
    else delete process.env.WRITER_BENCH_OPENCODE_DIR
    await rm(directory, { recursive: true, force: true })
  }
}
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
