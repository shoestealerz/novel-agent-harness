import assert from "node:assert/strict"
import test from "node:test"
import type { ExecutionTask } from "./contracts.ts"
import { parseWriterContract, renderWriterContract } from "./writer-contract.ts"

const task: ExecutionTask = {
  id: "revise",
  suite: "suite",
  suiteVersion: "1",
  source: "native",
  job: "revise",
  prompt: "Revise ch01:p001. Do not edit ch01:p002.",
  authority: "propose",
  context: [
    { ref: "ch01:p001", kind: "manuscript", text: "The bell rang." },
    { ref: "ch01:p002", kind: "manuscript", text: "She waited." },
  ],
}

test("renders a public writer task contract without evaluation material", () => {
  const contract = renderWriterContract(task)
  assert.match(contract, /filesystemDiscovery/)
  assert.match(contract, /ch01:p001/)
  assert.doesNotMatch(contract, /checks|criteria|gold/)
})

test("sanitizes evidence and edits against task authority and context", () => {
  const result = parseWriterContract(task, JSON.stringify({
    answer: "Proposal [ch01:p001] [hidden:p999]",
    evidence: ["ch01:p001", "hidden:p999"],
    findings: [{ id: "fact:bell-rang", evidence: ["ch01:p001", "hidden:p999"], confidence: 0.9 }],
    edits: [
      { target: "ch01:p001", replacement: "The bell broke the silence." },
      { target: "ch01:p002", replacement: "Forbidden." },
      { target: "hidden:p999", replacement: "Forbidden." },
    ],
    data: { preservation: ["Meaning retained"] },
  }))
  assert.deepEqual(result.artifacts.evidence, ["ch01:p001"])
  assert.deepEqual(result.artifacts.findings, [{ id: "fact:bell-rang", evidence: ["ch01:p001"], confidence: 0.9 }])
  assert.deepEqual(result.artifacts.edits, [{ target: "ch01:p001", replacement: "The bell broke the silence." }])
})

test("drops edits for read-only work", () => {
  const result = parseWriterContract({ ...task, authority: "read" }, JSON.stringify({
    answer: "Analysis [ch01:p001]",
    evidence: ["ch01:p001"],
    edits: [{ target: "ch01:p001", replacement: "Not allowed." }],
  }))
  assert.deepEqual(result.artifacts.edits, [])
})

test("v0.1 requires finding statements and exact-literal receipts", () => {
  const exactTask = {
    ...task,
    prompt: "Revise ch01:p001 and preserve the exact sentence: 'The bell rang.'",
  }
  const contract = renderWriterContract(exactTask, 2)
  assert.match(contract, /complete human-readable claim/)
  assert.match(contract, /quote it verbatim in both answer and data\.preservation/)

  const result = parseWriterContract(exactTask, JSON.stringify({
    answer: "Proposal",
    findings: [
      { id: "missing-statement", evidence: ["ch01:p001"] },
      { id: "fact:bell", statement: "The bell rang.", evidence: ["ch01:p001"] },
    ],
    edits: [],
  }), 2)
  assert.deepEqual(result.artifacts.findings, [{
    id: "fact:bell",
    statement: "The bell rang.",
    evidence: ["ch01:p001"],
    confidence: undefined,
  }])
  assert.match(result.answer, /The bell rang\./)
  assert.deepEqual(result.artifacts.data?.preservation, ["The bell rang."])
})
