import { compileContext, loadManuscriptContext } from "../context-compiler.ts"
import type { ExecutionTask } from "../contracts.ts"
import { retrieveContext, type RetrievalStrategy } from "../retrieval.ts"
import { openAICompatibleEmbeddings } from "./embedding-client.ts"
import { readRequest, requiredEnvironment } from "./shared.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the writer-retrieval target executes systems; configure a separate judge target")
const strategy = requiredEnvironment("WRITER_BENCH_RETRIEVAL_STRATEGY") as RetrievalStrategy
if (!(["lexical", "hierarchical", "hierarchical-temporal", "embedding"] satisfies RetrievalStrategy[]).includes(strategy)) {
  throw new Error(`unsupported retrieval strategy: ${strategy}`)
}
const catalog = await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR"))
const retrieved = await retrieveContext({
  task: request.task as ExecutionTask,
  catalog,
  strategy,
  embed: strategy === "embedding" ? openAICompatibleEmbeddings : undefined,
})
const compiled = compileContext(retrieved.task, catalog, "task-aware")
console.log(JSON.stringify(await executeWriterContract(
  compiled.task,
  `writer-retrieval-${strategy}`,
  { contextTrace: compiled.trace, retrievalTrace: retrieved.trace },
)))
