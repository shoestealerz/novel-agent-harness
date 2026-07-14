import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import type { ExecutionTask } from "../contracts.ts"
import { renderMemoryPrompt, type MemoryMode } from "../writer-memory.ts"
import { completion } from "./openai-client.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"
import { readRequest, requiredEnvironment } from "./shared.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the memory experiment target only executes systems")
const task = request.task as ExecutionTask
const mode = requiredEnvironment("WRITER_BENCH_MEMORY_MODE") as MemoryMode
if (mode !== "coding" && mode !== "writer") throw new Error(`unsupported memory mode: ${mode}`)
const history = await loadHistory(task)
if (!history.trim()) throw new Error("memory experiment requires session history in task context")
const started = performance.now()
const compacted = await completion([
  { role: "user", content: renderMemoryPrompt(mode, history) },
])
const downstream = await executeWriterContract(
  {
    ...task,
    context: [{ ref: "memory:summary", kind: "story_state", text: compacted.text }],
    contextSpec: undefined,
  },
  `writer-memory-${mode}`,
  {
    memoryTrace: {
      mode,
      inputWords: words(history),
      summaryWords: words(compacted.text),
    },
  },
)
console.log(JSON.stringify({
  ...downstream,
  artifacts: {
    ...downstream.artifacts,
    data: { ...downstream.artifacts?.data, memorySummary: compacted.text },
  },
  usage: {
    inputTokens: (compacted.usage.inputTokens ?? 0) + (downstream.usage?.inputTokens ?? 0),
    outputTokens: (compacted.usage.outputTokens ?? 0) + (downstream.usage?.outputTokens ?? 0),
    latencyMs: performance.now() - started,
  },
}))

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

async function loadHistory(task: ExecutionTask) {
  const directory = process.env.WRITER_BENCH_HISTORY_DIR
  const values = await Promise.all((task.context ?? []).map(async (item) => {
    if (item.ref.startsWith("history:") && directory) {
      if (basename(item.text) !== item.text) throw new Error(`history filename must not contain a directory: ${item.text}`)
      return readFile(resolve(directory, item.text), "utf8")
    }
    return item.text
  }))
  return values.join("\n\n")
}
