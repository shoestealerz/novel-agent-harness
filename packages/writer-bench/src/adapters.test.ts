import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { importWritingBench } from "./adapters.ts"

test("imports and filters WritingBench without vendoring its dataset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "writer-bench-"))
  const source = join(directory, "source.jsonl")
  const out = join(directory, "out.jsonl")
  await writeFile(source, [
    JSON.stringify({ index: 1, domain1: "Literature & Arts", domain2: "Story", lang: "en", query: "Write", checklist: [] }),
    JSON.stringify({ index: 2, domain1: "Business", domain2: "Email", lang: "en", query: "Email", checklist: [] }),
  ].join("\n"))
  assert.equal(await importWritingBench({ source, out, domain: "Literature & Arts" }), 1)
  assert.match(await readFile(out, "utf8"), /writingbench-1/)
})
