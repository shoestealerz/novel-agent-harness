import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"
import { promisify } from "node:util"
import { protocolVersion, type Edit, type ExecutionResponse, type ExecutionTask } from "../contracts.ts"
import { citedEvidence } from "./shared.ts"
import { runOpenCode } from "./opencode-runner.ts"

const exec = promisify(execFile)
const passagePattern = /^([a-z][a-z0-9_-]*):([a-z][a-z0-9_-]*)$/

type Passage = { ref: string; text: string }
type StockWorkspace = {
  files: { path: string; passages: Passage[]; source: string }[]
  initialHead: string
  contextItems: number
  contextWords: number
}

export async function executeStockOpenCode(
  task: ExecutionTask,
  options: { run?: typeof runOpenCode } = {},
): Promise<ExecutionResponse> {
  const root = await mkdtemp(join(tmpdir(), "writer-bench-stock-"))
  try {
    const workspace = await writeStockWorkspace(root, task)
    const started = performance.now()
    const output = await (options.run ?? runOpenCode)(stockPrompt(task), { directory: root })
    const edits = await collectStockEdits(root, workspace)
    return {
      protocolVersion,
      taskId: task.id,
      text: output.text,
      artifacts: { evidence: citedEvidence(task, output.text), ...(edits.length ? { edits } : {}) },
      usage: { ...output.usage, latencyMs: performance.now() - started },
      metadata: {
        adapter: "stock-opencode-workspace",
        model: process.env.WRITER_BENCH_OPENCODE_MODEL,
        agent: process.env.WRITER_BENCH_OPENCODE_AGENT,
        contextTrace: {
          strategy: "materialized-workspace",
          contextItems: workspace.contextItems,
          contextWords: workspace.contextWords,
        },
      },
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export async function writeStockWorkspace(root: string, task: ExecutionTask): Promise<StockWorkspace> {
  const context = task.context ?? []
  if (!context.length) throw new Error("stock OpenCode tasks require manuscript context")
  const chapters = new Map<string, Passage[]>()
  const seen = new Set<string>()
  for (const item of context) {
    if ((item.kind ?? "manuscript") !== "manuscript") {
      throw new Error(`stock OpenCode context must be manuscript text: ${item.ref}`)
    }
    const match = passagePattern.exec(item.ref)
    if (!match) throw new Error(`stock OpenCode passage ref is invalid: ${item.ref}`)
    if (!item.text.trim()) throw new Error(`stock OpenCode passage is empty: ${item.ref}`)
    if (seen.has(item.ref)) throw new Error(`stock OpenCode context repeats passage ref: ${item.ref}`)
    seen.add(item.ref)
    const passages = chapters.get(match[1]!) ?? []
    passages.push({ ref: item.ref, text: item.text })
    chapters.set(match[1]!, passages)
  }
  await mkdir(root, { recursive: true })
  const files: StockWorkspace["files"] = []
  for (const [index, [chapter, passages]] of [...chapters].entries()) {
    const path = join(root, `chapter-${String(index + 1).padStart(3, "0")}-${chapter}.md`)
    const source = `${passages.map((passage) => `<!-- ref: ${passage.ref} -->\n${passage.text}`).join("\n\n")}\n`
    await writeFile(path, source)
    files.push({ path, passages, source })
  }
  await git(root, "init", "--quiet")
  await git(root, "config", "user.name", "Writer Bench")
  await git(root, "config", "user.email", "writer-bench@example.invalid")
  await git(root, "add", "--", ".")
  await git(root, "commit", "--quiet", "-m", "Initial manuscript")
  return {
    files,
    initialHead: await head(root),
    contextItems: context.length,
    contextWords: context.reduce((total, item) => total + wordCount(item.text), 0),
  }
}

export function stockPrompt(task: ExecutionTask) {
  const authority = task.authority === "propose"
    ? "Propose changes only. Do not apply or commit manuscript changes."
    : "Read and analyze only. Do not alter or commit manuscript files."
  return `Work in this isolated fiction-manuscript repository. Chapter files contain stable passage references in HTML comments. Inspect the manuscript as needed, cite supporting passage references in square brackets, and answer the author directly.\n\nAuthor request:\n${task.prompt}\n\nAuthority: ${task.authority ?? "read"}. ${authority}`
}

export async function collectStockEdits(root: string, workspace: StockWorkspace): Promise<Edit[]> {
  const edits: Edit[] = []
  const expected = new Set(workspace.files.map((file) => basename(file.path)))
  for (const file of workspace.files) {
    let current: string
    try {
      current = await readFile(file.path, "utf8")
    } catch (error) {
      if (!missingFile(error)) throw error
      edits.push(...file.passages.map((passage) => ({ target: passage.ref })))
      continue
    }
    if (current === file.source) continue
    const parsed = parsePassages(current)
    const byRef = new Map(parsed.map((passage) => [passage.ref, passage.text]))
    const valid = parsed.length === file.passages.length
      && byRef.size === parsed.length
      && file.passages.every((passage) => byRef.has(passage.ref))
    if (!valid) {
      edits.push(...file.passages.map((passage) => ({ target: passage.ref })))
      edits.push({ target: `workspace:unparseable:${basename(file.path)}` })
      continue
    }
    for (const passage of file.passages) {
      const replacement = byRef.get(passage.ref)!
      if (replacement !== passage.text) edits.push({ target: passage.ref, replacement })
    }
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === ".git" || expected.has(entry.name)) continue
    edits.push({ target: `workspace:file:${entry.name}` })
  }
  if (await head(root) !== workspace.initialHead) edits.push({ target: "workspace:git-head" })
  return uniqueEdits(edits)
}

function parsePassages(content: string) {
  return [...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs)]
    .map((match) => ({ ref: match[1]!, text: match.groups?.text.replaceAll("\r\n", "\n").trim() ?? "" }))
}

function uniqueEdits(edits: Edit[]) {
  return [...new Map(edits.map((edit) => [edit.target, edit])).values()]
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

async function git(root: string, ...args: string[]) {
  await exec("git", args, { cwd: root, windowsHide: true, env: { ...process.env, HUSKY: "0" } })
}

async function head(root: string) {
  return (await exec("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim()
}

function missingFile(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
