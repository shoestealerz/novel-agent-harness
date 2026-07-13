import type { ContextStrategy } from "../context-compiler.ts"
import type { ExecutionTask } from "../contracts.ts"
import { compileContext, loadManuscriptContext } from "../context-compiler.ts"
import { readRequest, requiredEnvironment } from "./shared.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the writer-context target executes systems; configure a separate judge target")
const strategy = requiredEnvironment("WRITER_BENCH_CONTEXT_STRATEGY") as ContextStrategy
if (!(["supplied", "maximum", "task-aware"] satisfies ContextStrategy[]).includes(strategy)) throw new Error(`unsupported context strategy: ${strategy}`)
const compiled = compileContext(
  request.task as ExecutionTask,
  await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR")),
  strategy,
)
console.log(JSON.stringify(await executeWriterContract(
  compiled.task,
  `writer-context-${strategy}`,
  { contextTrace: compiled.trace },
)))
