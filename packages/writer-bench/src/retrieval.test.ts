import assert from "node:assert/strict"
import test from "node:test"
import type { ContextItem, ExecutionTask } from "./contracts.ts"
import { rankEmbedding, rankHierarchical, rankLexical, retrieveContext } from "./retrieval.ts"

const catalog: ContextItem[] = [
  { ref: "ch01:p001", text: "Mara locked the silver key inside the observatory safe." },
  { ref: "ch01:p002", text: "The sea changed from iron to green beneath the gulls." },
  { ref: "ch02:p001", text: "Mara carried the silver key into the customs tunnel." },
  { ref: "ch03:p001", text: "A later voice repeated Orin's private phrase." },
]

test("BM25 ranks passages sharing distinctive query terms", () => {
  assert.equal(rankLexical("silver key safe", catalog)[0]?.ref, "ch01:p001")
})

test("hierarchical retrieval mixes passage and scene scores", () => {
  const ranked = rankHierarchical("sea colors iron green", catalog, { topK: 2 })
  assert.equal(ranked[0]?.ref, "ch01:p002")
  assert.ok(ranked[0]?.reasons.includes("scene-bm25"))
})

test("retrieval includes passage references explicitly named by the writer", async () => {
  const result = await retrieveContext({
    task: { ...task({ topK: 2 }), prompt: "Compare the key state with ch01:p001." },
    catalog,
    strategy: "hierarchical",
  })
  assert.ok(result.trace.selectedRefs.includes("ch01:p001"))
})

test("temporal retrieval excludes passages after the declared boundary", async () => {
  const result = await retrieveContext({
    task: task({ topK: 3, throughRef: "ch02:p001" }),
    catalog,
    strategy: "hierarchical-temporal",
  })
  assert.ok(!result.trace.selectedRefs.includes("ch03:p001"))
  assert.deepEqual(result.trace.filteredRefs, ["ch03:p001"])
  assert.equal(result.task.contextSpec?.throughRef, "ch02:p001")
})

test("retrieval declarations become compiler roles without leaking into the writer task", async () => {
  const result = await retrieveContext({
    task: task({ topK: 2, focusRefs: ["ch02:p001"], preservationRefs: ["ch01:p001"] }),
    catalog,
    strategy: "lexical",
  })
  assert.equal(result.task.retrievalSpec, undefined)
  assert.deepEqual(result.task.contextSpec?.focusRefs, ["ch02:p001"])
  assert.deepEqual(result.task.contextSpec?.preservationRefs, ["ch01:p001"])
})

test("embedding ranking uses provider vectors through an isolated seam", async () => {
  const ranked = await rankEmbedding("query", catalog.slice(0, 2), async () => [[1, 0], [0.9, 0.1], [0, 1]])
  assert.equal(ranked[0]?.ref, "ch01:p001")
})

function task(retrievalSpec: NonNullable<ExecutionTask["retrievalSpec"]>): ExecutionTask {
  return {
    id: "retrieve",
    suite: "test",
    suiteVersion: "1",
    source: "synthetic",
    job: "explain",
    prompt: "Find the key contradiction.",
    authority: "read",
    retrievalSpec,
  }
}
