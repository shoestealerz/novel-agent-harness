import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { parseWriterContract, renderWriterContract } from "../writer-contract.ts"
import { requiredEnvironment } from "./shared.ts"
import { completion } from "./openai-client.ts"

export async function executeWriterContract(task: ExecutionTask, adapter: string, metadata?: Record<string, unknown>) {
  const started = performance.now()
  const response = await completion([
    {
      role: "system",
      content: "You are the execution model inside a fiction-writing harness. Execute the machine-readable task contract exactly and concisely. Supplied context is authoritative and complete for this operation: do not search for files, request missing manuscripts, repeat the contract, or use outside story facts. Preserve author authority, exact author-supplied literals, and epistemic uncertainty. Return JSON only.",
    },
    { role: "user", content: renderWriterContract(task, 2) },
  ], undefined, { json: true, retryIncomplete: true, validate: (text) => parseWriterContract(task, text, 2) })
  const result = parseWriterContract(task, response.text, 2)
  return {
    protocolVersion,
    taskId: task.id,
    text: result.answer,
    artifacts: result.artifacts,
    usage: { ...response.usage, latencyMs: performance.now() - started },
    metadata: { adapter, model: requiredEnvironment("WRITER_BENCH_MODEL"), contractVersion: 2, ...metadata },
  }
}
