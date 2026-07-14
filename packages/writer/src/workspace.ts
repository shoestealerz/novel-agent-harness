import { createHash } from "node:crypto"
import { link, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

export const writerWorkspaceFormatVersion = 1 as const

export type ChapterManifest = {
  id: string
  path: string
  title?: string
}

export type WriterWorkspaceManifest = {
  formatVersion: typeof writerWorkspaceFormatVersion
  title: string
  chapters: ChapterManifest[]
}

export type WriterPassage = {
  ref: string
  chapterId: string
  passageId: string
  path: string
  text: string
  sha256: `sha256:${string}`
  markerStart: number
  textStart: number
  textEnd: number
}

export type WriterChapter = ChapterManifest & {
  absolutePath: string
  source: string
  passages: WriterPassage[]
}

export type WriterWorkspace = {
  root: string
  manifestPath: string
  manifest: WriterWorkspaceManifest
  chapters: WriterChapter[]
  passages: ReadonlyMap<string, WriterPassage>
}

export type BootstrapWriterWorkspaceInput = {
  title: string
  chapters: ChapterManifest[]
}

export type BootstrapWriterWorkspaceResult = {
  workspace: WriterWorkspace
  chapters: { id: string; path: string; addedMarker: boolean }[]
}

const idPattern = /^[a-z][a-z0-9_-]*$/
const markerPattern =
  /^(?:\uFEFF)?[\t ]*<!--\s*novel-agent:passage\s+([a-z][a-z0-9_-]*):([a-z][a-z0-9_-]*)\s*-->[\t ]*(?:\r?\n|$)/gm

export async function loadWriterWorkspace(root: string, manifestName = "novel.json"): Promise<WriterWorkspace> {
  const workspaceRoot = await realpath(resolve(root))
  const manifestPath = await containedPath(workspaceRoot, manifestName, "manifest")
  const manifest = parseWriterWorkspaceManifest(JSON.parse(await readFile(manifestPath, "utf8")))
  const chapterIds = new Set<string>()
  const chapterPaths = new Set<string>()
  const passages = new Map<string, WriterPassage>()
  const chapters: WriterChapter[] = []

  for (const chapter of manifest.chapters) {
    if (chapterIds.has(chapter.id)) throw new Error(`duplicate chapter id: ${chapter.id}`)
    chapterIds.add(chapter.id)
    const absolutePath = await containedPath(workspaceRoot, chapter.path, `chapter ${chapter.id}`)
    const normalizedPath = relative(workspaceRoot, absolutePath).replaceAll("\\", "/")
    if (chapterPaths.has(normalizedPath)) throw new Error(`duplicate chapter path: ${chapter.path}`)
    chapterPaths.add(normalizedPath)
    const source = await readFile(absolutePath, "utf8")
    const parsed = parseChapterPassages(chapter.id, normalizedPath, source)
    for (const passage of parsed) {
      if (passages.has(passage.ref)) throw new Error(`duplicate passage ref: ${passage.ref}`)
      passages.set(passage.ref, passage)
    }
    chapters.push({ ...chapter, path: normalizedPath, absolutePath, source, passages: parsed })
  }

  return { root: workspaceRoot, manifestPath, manifest, chapters, passages }
}

export async function bootstrapWriterWorkspace(
  root: string,
  input: BootstrapWriterWorkspaceInput,
): Promise<BootstrapWriterWorkspaceResult> {
  const workspaceRoot = await realpath(resolve(root))
  const manifestPath = resolve(workspaceRoot, "novel.json")
  ensureContained(workspaceRoot, manifestPath, "novel.json", "manifest")
  const existing = await readFile(manifestPath, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return undefined
    throw error
  })
  if (existing !== undefined) throw new Error("novel.json already exists; refusing to overwrite the workspace")
  const manifest = parseWriterWorkspaceManifest({
    formatVersion: writerWorkspaceFormatVersion,
    title: input.title,
    chapters: input.chapters,
  })
  const ids = new Set<string>()
  const paths = new Set<string>()
  const planned: { id: string; path: string; absolutePath: string; before: string; after: string }[] = []
  const summary: BootstrapWriterWorkspaceResult["chapters"] = []
  for (const chapter of manifest.chapters) {
    if (ids.has(chapter.id)) throw new Error(`duplicate chapter id: ${chapter.id}`)
    ids.add(chapter.id)
    const absolutePath = await containedPath(workspaceRoot, chapter.path, `chapter ${chapter.id}`)
    const normalizedPath = relative(workspaceRoot, absolutePath).replaceAll("\\", "/")
    if (paths.has(normalizedPath)) throw new Error(`duplicate chapter path: ${chapter.path}`)
    paths.add(normalizedPath)
    const before = await readFile(absolutePath, "utf8")
    if (!before.trim()) throw new Error(`chapter ${chapter.id} is empty`)
    const mentionsMarker = before.includes("novel-agent:passage")
    let after = before
    if (mentionsMarker) {
      parseChapterPassages(chapter.id, normalizedPath, before)
    } else {
      const newline = before.includes("\r\n") ? "\r\n" : "\n"
      const bom = before.startsWith("\uFEFF") ? "\uFEFF" : ""
      const body = bom ? before.slice(1) : before
      after = `${bom}<!-- novel-agent:passage ${chapter.id}:p0001 -->${newline}${body}`
      parseChapterPassages(chapter.id, normalizedPath, after)
      planned.push({ id: chapter.id, path: normalizedPath, absolutePath, before, after })
    }
    summary.push({ id: chapter.id, path: normalizedPath, addedMarker: !mentionsMarker })
  }

  const changed: typeof planned = []
  let manifestCreated = false
  try {
    for (const chapter of planned) {
      await atomicReplace(chapter.absolutePath, chapter.after)
      changed.push(chapter)
    }
    await atomicCreate(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    manifestCreated = true
    const workspace = await loadWriterWorkspace(workspaceRoot)
    return { workspace, chapters: summary }
  } catch (error) {
    const failures: string[] = []
    if (manifestCreated) await rm(manifestPath, { force: true }).catch((failure) => failures.push(message(failure)))
    for (const chapter of changed.toReversed()) {
      await atomicReplace(chapter.absolutePath, chapter.before).catch((failure) => failures.push(message(failure)))
    }
    if (failures.length)
      throw new Error(`workspace bootstrap failed and rollback was incomplete: ${failures.join("; ")}`, {
        cause: error,
      })
    throw error
  }
}

export function parseWriterWorkspaceManifest(value: unknown): WriterWorkspaceManifest {
  const input = object(value, "manifest")
  if (input.formatVersion !== writerWorkspaceFormatVersion) {
    throw new Error(`manifest.formatVersion must be ${writerWorkspaceFormatVersion}`)
  }
  const title = text(input.title, "manifest.title")
  if (!Array.isArray(input.chapters) || input.chapters.length === 0) {
    throw new Error("manifest.chapters must contain at least one chapter")
  }
  const chapters = input.chapters.map((value, index) => {
    const chapter = object(value, `manifest.chapters[${index}]`)
    const id = identifier(chapter.id, `manifest.chapters[${index}].id`)
    const path = text(chapter.path, `manifest.chapters[${index}].path`)
    const title = chapter.title === undefined ? undefined : text(chapter.title, `manifest.chapters[${index}].title`)
    return { id, path, ...(title ? { title } : {}) }
  })
  return { formatVersion: writerWorkspaceFormatVersion, title, chapters }
}

export function parseChapterPassages(chapterId: string, path: string, source: string): WriterPassage[] {
  identifier(chapterId, "chapter id")
  const matches = [...source.matchAll(markerPattern)]
  if (matches.length === 0) throw new Error(`chapter ${chapterId} has no novel-agent passage markers`)

  return matches.map((match, index) => {
    const markedChapter = match[1]
    const passageId = match[2]
    if (!markedChapter || !passageId || match.index === undefined) throw new Error(`invalid passage marker in ${path}`)
    if (markedChapter !== chapterId) {
      throw new Error(`passage ${markedChapter}:${passageId} is in chapter ${chapterId}`)
    }
    const next = matches[index + 1]
    const textStart = match.index + match[0].length
    const boundary = next?.index ?? source.length
    const segment = source.slice(textStart, boundary)
    const trailing = segment.match(/(?:\r?\n[\t ]*)+$/)?.[0].length ?? 0
    const textEnd = boundary - trailing
    const passageText = source.slice(textStart, textEnd)
    if (!passageText.trim()) throw new Error(`passage ${markedChapter}:${passageId} is empty`)
    const ref = `${markedChapter}:${passageId}`
    return {
      ref,
      chapterId,
      passageId,
      path,
      text: passageText,
      sha256: digest(passageText),
      markerStart: match.index,
      textStart,
      textEnd,
    }
  })
}

export function passage(workspace: WriterWorkspace, ref: string): WriterPassage {
  const result = workspace.passages.get(ref)
  if (!result) throw new Error(`unknown passage ref: ${ref}`)
  return result
}

export function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

async function containedPath(root: string, candidate: string, label: string) {
  if (!candidate || isAbsolute(candidate)) throw new Error(`${label} path must be relative to the workspace`)
  const lexical = resolve(root, candidate)
  ensureContained(root, lexical, candidate, label)
  const result = await realpath(lexical)
  ensureContained(root, result, candidate, label)
  return result
}

function ensureContained(root: string, result: string, candidate: string, label: string) {
  const inside = relative(root, result)
  if (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside)) {
    throw new Error(`${label} path escapes the workspace: ${candidate}`)
  }
}

async function atomicReplace(path: string, value: string) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, value, { flag: "wx", mode: (await stat(path)).mode })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function atomicCreate(path: string, value: string) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temporary, value, { flag: "wx" })
    await link(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function identifier(value: unknown, label: string) {
  const result = text(value, label)
  if (!idPattern.test(result)) throw new Error(`${label} must match ${idPattern}`)
  return result
}
