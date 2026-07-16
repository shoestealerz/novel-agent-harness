import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parseTask } from "./contracts.ts"
import { readJsonl } from "./io.ts"
import { materializeNativeTasks } from "./native-source.ts"

const validation = fileURLToPath(
  new URL("../corpora/saltglass-vigil/tasks/validation.jsonl", import.meta.url),
)

test("materializes a complete, temporally bounded native manuscript and isolated variant", async () => {
  const task = (await readJsonl(validation))
    .map(parseTask)
    .find((item) => item.id === "saltglass-val-diagnose-001-gate-counterflow")
  assert.ok(task)

  const [materialized] = await materializeNativeTasks([task], validation)
  assert.equal(materialized.context?.[0]?.ref, "ch01:p001")
  assert.equal(materialized.context?.at(-1)?.ref, "ch13:p013")
  assert.equal(materialized.context?.some((item) => item.ref === "ch14:p001"), false)
  assert.match(materialized.context?.find((item) => item.ref === "ch13:p013")?.text ?? "", /Opening the upper gates early/)
  assert.deepEqual(materialized.metadata?.nativeContext, {
    corpus: "saltglass-vigil",
    corpusVersion: "0.2.0",
    mode: "full",
    contextItems: materialized.context?.length,
    throughRef: "ch13:p013",
    variantId: "def-causal-02",
  })
})

test("materializes only the preregistered gold-bounded packet for controlled context", async () => {
  const task = (await readJsonl(validation))
    .map(parseTask)
    .find((item) => item.id === "saltglass-val-diagnose-002-tovan-boundary")
  assert.ok(task)

  const [materialized] = await materializeNativeTasks([task], validation, "controlled")
  assert.deepEqual(materialized.context?.map((item) => item.ref), ["ch10:p007", "ch10:p008", "ch10:p009"])
  assert.match(materialized.context?.at(-1)?.text ?? "", /help you seize the carriage/)
  assert.equal((materialized.metadata?.nativeContext as Record<string, unknown>).mode, "controlled")
})

test("refuses to use the controlled track for a task outside its frozen subset", async () => {
  const task = (await readJsonl(validation))
    .map(parseTask)
    .find((item) => item.id === "saltglass-val-diagnose-001-gate-counterflow")
  assert.ok(task)
  await assert.rejects(materializeNativeTasks([task], validation, "controlled"), /not preregistered/)
})
