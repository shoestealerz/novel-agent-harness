import { requireObject } from "../contracts.ts"
import { requiredEnvironment } from "./shared.ts"

export async function openAICompatibleEmbeddings(values: string[]) {
  const base = requiredEnvironment("WRITER_BENCH_EMBEDDING_BASE_URL").replace(/\/$/, "")
  const response = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requiredEnvironment("WRITER_BENCH_EMBEDDING_API_KEY")}`,
    },
    body: JSON.stringify({ model: requiredEnvironment("WRITER_BENCH_EMBEDDING_MODEL"), input: values }),
  })
  if (!response.ok) throw new Error(`embedding provider returned ${response.status}: ${await response.text()}`)
  const body = requireObject(await response.json(), "embedding response")
  if (!Array.isArray(body.data) || body.data.length !== values.length) throw new Error("embedding response has an unexpected data count")
  return body.data
    .map((value) => {
      const item = requireObject(value, "embedding item")
      if (typeof item.index !== "number" || !Array.isArray(item.embedding) || !item.embedding.every((entry) => typeof entry === "number")) {
        throw new Error("embedding item requires a numeric index and vector")
      }
      return { index: item.index, embedding: item.embedding as number[] }
    })
    .sort((left, right) => left.index - right.index)
    .map((item, index) => {
      if (item.index !== index) throw new Error(`embedding item index mismatch: ${item.index}`)
      return item.embedding
    })
}
