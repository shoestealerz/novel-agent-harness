import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import type { ExecutionTask } from "./contracts.ts"
import { collectStockEdits, removeStockWorkspace, stockPrompt, writeStockWorkspace } from "./targets/stock-opencode-runtime.ts"

const task: ExecutionTask = {
  id: "stock-task",
  suite: "suite",
  suiteVersion: "1",
  source: "native:fixture",
  job: "revise",
  prompt: "Tighten ch01:p002 without changing ch01:p001.",
  authority: "propose",
  context: [
    { ref: "ch01:p001", text: "The bell rang once." },
    { ref: "ch01:p002", text: "Mara crossed the wet court slowly." },
    { ref: "ch02:p001", text: "At dawn, the gate opened." },
  ],
}

test("materializes stock OpenCode context as a plain isolated Git manuscript", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "stock-workspace-test-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const workspace = await writeStockWorkspace(root, task)
  assert.equal(workspace.contextItems, 3)
  assert.equal(workspace.contextWords, 15)
  assert.equal(workspace.files.length, 2)
  assert.match(await readFile(workspace.files[0]!.path, "utf8"), /<!-- ref: ch01:p001 -->/)
  await assert.rejects(readFile(join(root, "novel.json"), "utf8"), /ENOENT/)
})

test("stock OpenCode receives the public request and workspace affordance but not manuscript text", () => {
  const prompt = stockPrompt(task)
  assert.match(prompt, /Tighten ch01:p002/)
  assert.match(prompt, /Propose changes only/)
  assert.match(prompt, /passage references/)
  assert.doesNotMatch(prompt, /Mara crossed the wet court/)
  assert.doesNotMatch(prompt, /checks|gold|benchmark/i)
})

test("captures passage mutations, added files, and commits as baseline edit artifacts", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "stock-edits-test-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const workspace = await writeStockWorkspace(root, task)
  const first = workspace.files[0]!
  await writeFile(first.path, first.source.replace("Mara crossed the wet court slowly.", "Mara crossed the rain-black court."))
  await writeFile(join(root, "notes.md"), "new notes\n")
  assert.deepEqual(await collectStockEdits(root, workspace), [
    { target: "ch01:p002", replacement: "Mara crossed the rain-black court." },
    { target: "workspace:file:notes.md" },
  ])
})

test("fails closed on damaged passage markers", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "stock-markers-test-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const workspace = await writeStockWorkspace(root, task)
  const first = workspace.files[0]!
  await writeFile(first.path, first.source.replace("<!-- ref: ch01:p002 -->", ""))
  assert.deepEqual(await collectStockEdits(root, workspace), [
    { target: "ch01:p001" },
    { target: "ch01:p002" },
    { target: `workspace:unparseable:${first.path.split(/[\\/]/).at(-1)}` },
  ])
})

test("retries transient Windows workspace cleanup locks", async () => {
  let calls = 0
  await removeStockWorkspace("ignored", async () => {
    calls++
    if (calls < 3) throw Object.assign(new Error("locked"), { code: "EBUSY" })
  })
  assert.equal(calls, 3)
})
