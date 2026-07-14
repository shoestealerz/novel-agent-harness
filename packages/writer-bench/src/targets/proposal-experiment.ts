import { compileContext, loadManuscriptContext } from "../context-compiler.ts"
import type { ExecutionTask } from "../contracts.ts"
import { createEditProposal } from "../edit-proposal.ts"
import { completion } from "./openai-client.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"
import { plainArtifacts, readRequest, renderTask, requiredEnvironment } from "./shared.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the proposal experiment target only executes systems")
const mode = requiredEnvironment("WRITER_BENCH_PROPOSAL_MODE")
if (mode !== "freeform" && mode !== "immutable") throw new Error(`unsupported proposal mode: ${mode}`)
const compiled = compileContext(
  request.task as ExecutionTask,
  await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR")),
  "task-aware",
)

if (mode === "immutable") {
  const response = await executeWriterContract(compiled.task, "writer-immutable-proposal", { contextTrace: compiled.trace })
  const proposal = createEditProposal(compiled.task, response)
  console.log(JSON.stringify({ ...response, artifacts: { ...response.artifacts, proposal } }))
} else {
  const started = performance.now()
  const response = await completion([
    {
      role: "system",
      content: "You are responding directly to a fiction writer. Propose a complete replacement for the requested passage, explain preservation briefly, cite supplied references, and do not claim to apply or commit changes.",
    },
    { role: "user", content: renderTask(compiled.task) },
  ])
  console.log(JSON.stringify({
    protocolVersion: 1,
    taskId: compiled.task.id,
    text: response.text,
    artifacts: plainArtifacts(compiled.task, response.text),
    usage: { ...response.usage, latencyMs: performance.now() - started },
    metadata: {
      adapter: "writer-freeform-proposal",
      model: requiredEnvironment("WRITER_BENCH_MODEL"),
      contextTrace: compiled.trace,
    },
  }))
}
