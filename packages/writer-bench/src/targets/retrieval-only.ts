import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { loadManuscriptContext } from "../context-compiler.ts"
import { retrieveContext, type RetrievalStrategy } from "../retrieval.ts"
import { openAICompatibleEmbeddings } from "./embedding-client.ts"
import { localEmbeddings } from "./local-embedding.ts"
import { readRequest, requiredEnvironment } from "./shared.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the retrieval-only target executes systems; configure a separate judge target")
const task = request.task as ExecutionTask
const strategy = requiredEnvironment("WRITER_BENCH_RETRIEVAL_STRATEGY") as RetrievalStrategy
if (!(["lexical", "hierarchical", "hierarchical-temporal", "coverage-temporal", "hybrid-temporal", "embedding"] satisfies RetrievalStrategy[]).includes(strategy)) {
  throw new Error(`unsupported retrieval strategy: ${strategy}`)
}
const retrieved = await retrieveContext({
  task,
  catalog: await loadManuscriptContext(requiredEnvironment("WRITER_BENCH_MANUSCRIPT_DIR")),
  strategy,
  embed: strategy === "embedding" || strategy === "hybrid-temporal"
    ? process.env.WRITER_BENCH_EMBEDDING_PROVIDER === "local" ? localEmbeddings : openAICompatibleEmbeddings
    : undefined,
})
console.log(JSON.stringify({
  protocolVersion,
  taskId: task.id,
  text: "",
  artifacts: { evidence: [] },
  usage: { latencyMs: retrieved.trace.latencyMs },
  metadata: { adapter: `retrieval-only-${strategy}`, retrievalTrace: retrieved.trace },
}))
