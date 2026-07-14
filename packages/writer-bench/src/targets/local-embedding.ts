import { env, pipeline } from "@huggingface/transformers"

type Extractor = Awaited<ReturnType<typeof createExtractor>>
let cached: Promise<Extractor> | undefined

export async function localEmbeddings(values: string[]) {
  const extractor = await (cached ??= createExtractor())
  const output = await extractor(values, { pooling: "mean", normalize: true })
  const vectors = output.tolist()
  if (!Array.isArray(vectors) || !vectors.every((vector) => Array.isArray(vector) && vector.every((value) => typeof value === "number"))) {
    throw new Error("local embedding model returned an unexpected tensor shape")
  }
  return vectors as number[][]
}

async function createExtractor() {
  if (process.env.WRITER_BENCH_EMBEDDING_CACHE_DIR) env.cacheDir = process.env.WRITER_BENCH_EMBEDDING_CACHE_DIR
  return pipeline(
    "feature-extraction",
    process.env.WRITER_BENCH_EMBEDDING_MODEL ?? "onnx-community/all-MiniLM-L6-v2-ONNX",
  )
}
