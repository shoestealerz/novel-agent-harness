import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { bootstrapWriterWorkspace, digest, loadWriterWorkspace, parseChapterPassages, passage } from "./workspace.ts"

test("bootstraps existing chapter files with conservative whole-chapter markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer-bootstrap-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  const first = "# One\n\nThe rain began.\n"
  const second = "\uFEFF# Two\r\n\r\nThe door opened.\r\n"
  await writeFile(join(root, "manuscript", "one.md"), first)
  await writeFile(join(root, "manuscript", "two.md"), second)

  const result = await bootstrapWriterWorkspace(root, {
    title: "Bootstrap Novel",
    chapters: [
      { id: "ch01", path: "manuscript/one.md", title: "One" },
      { id: "ch02", path: "manuscript/two.md", title: "Two" },
    ],
  })

  assert.deepEqual(result.chapters, [
    { id: "ch01", path: "manuscript/one.md", addedMarker: true },
    { id: "ch02", path: "manuscript/two.md", addedMarker: true },
  ])
  assert.equal(result.workspace.passages.get("ch01:p0001")?.text, first.trimEnd())
  assert.match(
    await readFile(join(root, "manuscript", "one.md"), "utf8"),
    /^<!-- novel-agent:passage ch01:p0001 -->\n# One/,
  )
  assert.match(
    await readFile(join(root, "manuscript", "two.md"), "utf8"),
    /^\uFEFF<!-- novel-agent:passage ch02:p0001 -->\r\n# Two/,
  )
})

test("preserves chapters that already have valid stable passage markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer-bootstrap-"))
  const source = "<!-- novel-agent:passage ch01:p001 -->\nAlready marked.\n"
  await writeFile(join(root, "one.md"), source)
  const result = await bootstrapWriterWorkspace(root, {
    title: "Marked Novel",
    chapters: [{ id: "ch01", path: "one.md" }],
  })

  assert.equal(result.chapters[0]?.addedMarker, false)
  assert.equal(await readFile(join(root, "one.md"), "utf8"), source)
})

test("bootstrap refuses overwrite, malformed markers, and escaping paths", async () => {
  const existing = await fixture({
    "manuscript/ch01.md": "<!-- novel-agent:passage ch01:p001 -->\nOne.",
    "manuscript/ch02.md": "<!-- novel-agent:passage ch02:p001 -->\nTwo.",
  })
  await assert.rejects(
    bootstrapWriterWorkspace(existing, { title: "No", chapters: [{ id: "ch01", path: "manuscript/ch01.md" }] }),
    /already exists/,
  )

  const malformed = await mkdtemp(join(tmpdir(), "writer-bootstrap-"))
  await writeFile(join(malformed, "one.md"), "<!-- novel-agent:passage wrong:p001 -->\nWrong chapter.\n")
  await assert.rejects(
    bootstrapWriterWorkspace(malformed, { title: "Bad", chapters: [{ id: "ch01", path: "one.md" }] }),
    /is in chapter ch01/,
  )
  await assert.rejects(readFile(join(malformed, "novel.json"), "utf8"), /ENOENT/)

  const unsafe = await mkdtemp(join(tmpdir(), "writer-bootstrap-"))
  await assert.rejects(
    bootstrapWriterWorkspace(unsafe, { title: "Unsafe", chapters: [{ id: "ch01", path: "../outside.md" }] }),
    /escapes the workspace/,
  )
})

test("loads a manifest and gives marked prose stable content-addressed identity", async () => {
  const root = await fixture({
    "manuscript/ch01.md": `# One\n\n<!-- novel-agent:passage ch01:p001 -->\nFirst paragraph.\n\n<!-- novel-agent:passage ch01:p002 -->\nSecond paragraph.\n`,
    "manuscript/ch02.md": `# Two\n\n<!-- novel-agent:passage ch02:p001 -->\nA later scene.\n`,
  })
  const workspace = await loadWriterWorkspace(root)

  assert.equal(workspace.chapters.length, 2)
  assert.deepEqual([...workspace.passages.keys()], ["ch01:p001", "ch01:p002", "ch02:p001"])
  assert.equal(passage(workspace, "ch01:p001").text, "First paragraph.")
  assert.equal(passage(workspace, "ch01:p001").sha256, digest("First paragraph."))
})

test("passage refs survive inserted and reordered neighboring passages", () => {
  const before = parseChapterPassages(
    "ch01",
    "ch01.md",
    `<!-- novel-agent:passage ch01:p001 -->\nAlpha.\n\n<!-- novel-agent:passage ch01:p002 -->\nBeta.`,
  )
  const after = parseChapterPassages(
    "ch01",
    "ch01.md",
    `<!-- novel-agent:passage ch01:p003 -->\nNew.\n\n<!-- novel-agent:passage ch01:p002 -->\nBeta.\n\n<!-- novel-agent:passage ch01:p001 -->\nAlpha.`,
  )

  assert.deepEqual(
    before.map((item) => item.ref),
    ["ch01:p001", "ch01:p002"],
  )
  assert.deepEqual(
    after.map((item) => item.ref),
    ["ch01:p003", "ch01:p002", "ch01:p001"],
  )
  assert.equal(after[1]?.sha256, before[1]?.sha256)
  assert.equal(after[2]?.sha256, before[0]?.sha256)
})

test("rejects mismatched chapter refs and duplicate passage refs", async () => {
  assert.throws(
    () => parseChapterPassages("ch01", "ch01.md", `<!-- novel-agent:passage ch02:p001 -->\nWrong chapter.`),
    /is in chapter ch01/,
  )
  const root = await fixture({
    "manuscript/ch01.md": `<!-- novel-agent:passage ch01:p001 -->\nFirst.\n\n<!-- novel-agent:passage ch01:p001 -->\nDuplicate.`,
    "manuscript/ch02.md": `<!-- novel-agent:passage ch02:p001 -->\nOther.`,
  })
  await assert.rejects(loadWriterWorkspace(root), /duplicate passage ref: ch01:p001/)
})

test("rejects chapter paths outside the workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "writer-workspace-"))
  await writeFile(
    join(root, "novel.json"),
    JSON.stringify({
      formatVersion: 1,
      title: "Unsafe",
      chapters: [{ id: "ch01", path: "../outside.md" }],
    }),
  )
  await assert.rejects(loadWriterWorkspace(root), /escapes the workspace/)
})

test("rejects empty passages and unknown refs", async () => {
  assert.throws(() => parseChapterPassages("ch01", "ch01.md", `<!-- novel-agent:passage ch01:p001 -->\n\n`), /is empty/)
  const root = await fixture({
    "manuscript/ch01.md": `<!-- novel-agent:passage ch01:p001 -->\nKnown.`,
    "manuscript/ch02.md": `<!-- novel-agent:passage ch02:p001 -->\nOther.`,
  })
  const workspace = await loadWriterWorkspace(root)
  assert.throws(() => passage(workspace, "ch01:p999"), /unknown passage ref/)
})

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "writer-workspace-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    JSON.stringify({
      formatVersion: 1,
      title: "Fixture",
      chapters: [
        { id: "ch01", path: "manuscript/ch01.md" },
        { id: "ch02", path: "manuscript/ch02.md" },
      ],
    }),
  )
  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)))
  return root
}
