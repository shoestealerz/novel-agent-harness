import {
  bootstrapWriterWorkspace,
  commitEditProposal,
  commitStoryStateProposal,
  initializeStoryState,
  loadEditProposal,
  loadStoryState,
  loadStoryStateProposal,
  loadWriterWorkspace,
  renderProposalDiff,
  renderStoryStateDiff,
  type WriterContextSpec,
  type WriterJob,
} from "@novel-agent-harness/writer"
import { Effect } from "effect"
import { execFile } from "node:child_process"
import { realpath } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { Argv } from "yargs"
import { Provider } from "@/provider/provider"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { WriterSession } from "@/writer/session"
import { effectCmd, fail } from "../effect-cmd"
import { cmd } from "./cmd"
import { WriterChatCommand } from "./writer-chat"

const jobs = ["explain", "diagnose", "plan", "revise"] as const
const execute = promisify(execFile)

export const WriterCommand = cmd({
  command: "writer",
  describe: "work with novels through the Novel Agent Harness",
  builder: (yargs: Argv) =>
    yargs
      .command(WriterRunCommand)
      .command(WriterChatCommand)
      .command(WriterInitCommand)
      .command(WriterReviewCommand)
      .command(WriterCommitCommand)
      .command(WriterStateCommand)
      .demandCommand(),
  async handler() {},
})

export const WriterInitCommand = effectCmd({
  command: "init",
  describe: "initialize a Git-backed novel workspace, auto-discovering tracked chapter files",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("title", { type: "string", describe: "novel title; defaults to the directory name" })
      .option("chapter", {
        type: "string",
        array: true,
        describe: "chapter mapping as stable-id=relative/path.md; otherwise conservatively auto-discovered",
      })
      .option("yes", {
        type: "boolean",
        default: false,
        describe: "approve adding one whole-chapter marker where markers are absent",
      }),
  handler: Effect.fn("Cli.writer.init")(function* (args) {
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const title = args.title?.trim() || titleFromDirectory(root)
    const chapters = args.chapter?.length
      ? parseChapterArgs(args.chapter)
      : yield* Effect.tryPromise({
          try: () => discoverTrackedChapters(root),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }).pipe(Effect.catch((error) => fail(error.message)))
    if (!args.yes) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return yield* fail("Refusing to modify chapter files without interactive confirmation or --yes")
      }
      console.log(`Initialize “${title}” with:`)
      for (const chapter of chapters) console.log(`  ${chapter.id}  ${chapter.path}`)
      const reader = createInterface({ input: process.stdin, output: process.stdout })
      const confirmation = yield* Effect.promise(() => reader.question("Type INIT to insert stable passage markers: "))
      reader.close()
      if (confirmation !== "INIT") return yield* fail("Initialization cancelled")
    }
    const result = yield* Effect.promise(async () => {
      await ensureCleanTrackedWorkspace(
        root,
        chapters.map((chapter) => chapter.path),
      )
      return bootstrapWriterWorkspace(root, { title, chapters })
    })
    console.log(
      JSON.stringify(
        {
          formatVersion: result.workspace.manifest.formatVersion,
          root: result.workspace.root,
          manifestPath: result.workspace.manifestPath,
          title: result.workspace.manifest.title,
          chapters: result.chapters,
          passages: result.workspace.passages.size,
          next: "Review the inserted markers, then commit novel.json and changed chapter files to Git.",
        },
        null,
        2,
      ),
    )
  }),
})

export const WriterRunCommand = effectCmd({
  command: "run <request..>",
  describe: "run a grounded Writer task and return a structured result",
  directory: (args) => path.resolve(process.cwd(), args.dir ?? "."),
  builder: (yargs: Argv) =>
    yargs
      .positional("request", { type: "string", array: true, demandOption: true })
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("job", { type: "string", choices: jobs })
      .option("model", { alias: "m", type: "string", describe: "model as provider/model" })
      .option("variant", { type: "string", describe: "provider-specific model variant" })
      .option("session", { type: "string", describe: "resume a prior headless Writer session" })
      .option("focus", { type: "string", array: true, describe: "stable focus passage reference" })
      .option("dependency", { type: "string", array: true, describe: "stable dependency passage reference" })
      .option("preserve", { type: "string", array: true, describe: "stable passage reference to preserve" })
      .option("preserve-literal", {
        type: "string",
        array: true,
        describe: "exact preservation receipt as passage-ref=literal",
      })
      .option("exclude", { type: "string", array: true, describe: "stable passage reference to exclude" })
      .option("through", { type: "string", describe: "inclusive temporal boundary passage reference" })
      .option("format", { type: "string", choices: ["json", "text"] as const, default: "json" }),
  handler: Effect.fn("Cli.writer.run")(function* (args) {
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const request = args.request.join(" ").trim()
    if (!request) return yield* fail("Writer request must not be empty")
    const contextSpec = contextSpecFromArgs(args)
    const parsed = args.model ? Provider.parseModel(args.model) : undefined
    const sessions = yield* Session.Service
    const session = args.session
      ? yield* sessions
          .get(SessionID.make(args.session))
          .pipe(Effect.catchCause(() => fail(`Writer session not found: ${args.session}`)))
      : yield* sessions.create({
          title: `Writer: ${request.slice(0, 72)}`,
          agent: "writer",
          ...(parsed
            ? {
                model: {
                  id: parsed.modelID,
                  providerID: parsed.providerID,
                  variant: args.variant ?? "default",
                },
              }
            : {}),
          metadata: { "novel.writer.phase": "execution", "novel.writer.interface": "headless" },
        })
    if (args.session) {
      const [sessionRoot, requestedRoot] = yield* Effect.promise(() =>
        Promise.all([realpath(session.directory), realpath(root)]),
      )
      if (path.relative(sessionRoot, requestedRoot)) {
        return yield* fail("Writer session belongs to a different novel workspace")
      }
      if (session.agent !== "writer" || session.metadata?.["novel.writer.interface"] !== "headless") {
        return yield* fail("Only a prior headless Writer session can be resumed")
      }
    }
    const output = yield* WriterSession.run({
      sessionID: session.id,
      root,
      request,
      job: args.job as WriterJob | undefined,
      ...(contextSpec ? { contextSpec } : {}),
      ...(parsed ? { model: parsed } : {}),
      ...(args.variant ? { variant: args.variant } : {}),
    }).pipe(Effect.orDie)
    console.log(
      args.format === "text" ? formatWriterText(output) : JSON.stringify(headlessResult(session.id, output), null, 2),
    )
  }),
})

export const WriterReviewCommand = effectCmd({
  command: "review <proposalId>",
  describe: "render a stale-safe manuscript or story-state proposal diff",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .positional("proposalId", { type: "string", demandOption: true })
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("kind", {
        type: "string",
        choices: ["manuscript", "state"] as const,
        default: "manuscript",
      }),
  handler: Effect.fn("Cli.writer.review")(function* (args) {
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const output = yield* Effect.promise(async () => {
      if (args.kind === "state") {
        const current = await loadStoryState(root)
        const proposal = await loadStoryStateProposal(root, args.proposalId)
        return renderStoryStateDiff(current.state, proposal)
      }
      const workspace = await loadWriterWorkspace(root)
      const proposal = await loadEditProposal(root, args.proposalId)
      return renderProposalDiff(workspace, proposal)
    })
    console.log(output)
  }),
})

export const WriterCommitCommand = effectCmd({
  command: "commit <proposalId>",
  describe: "commit an author-confirmed manuscript or story-state proposal and emit its receipt",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .positional("proposalId", { type: "string", demandOption: true })
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("kind", {
        type: "string",
        choices: ["manuscript", "state"] as const,
        default: "manuscript",
      })
      .option("confirmed-by", { type: "string", demandOption: true, describe: "author identity for the receipt" })
      .option("yes", { type: "boolean", default: false, describe: "explicitly approve this exact proposal" })
      .option("message", { type: "string", describe: "optional Git commit message" }),
  handler: Effect.fn("Cli.writer.commit")(function* (args) {
    if (!args.yes) return yield* fail("Refusing to commit without explicit --yes author confirmation")
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const confirmation = {
      confirmationVersion: 1 as const,
      proposalId: args.proposalId as `sha256:${string}`,
      decision: "approve" as const,
      confirmedBy: args["confirmed-by"],
      confirmedAt: new Date().toISOString(),
    }
    const result = yield* Effect.promise(async () => {
      if (args.kind === "state") {
        return commitStoryStateProposal(root, args.proposalId, confirmation, { message: args.message })
      }
      return commitEditProposal(root, args.proposalId, confirmation, { message: args.message })
    })
    console.log(JSON.stringify(result, null, 2))
  }),
})

export const WriterStateCommand = effectCmd({
  command: "state",
  describe: "initialize or inspect the validated story-state store",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("init", { type: "boolean", default: false, describe: "create an empty store if absent" }),
  handler: Effect.fn("Cli.writer.state")(function* (args) {
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const loaded = yield* Effect.promise(() => (args.init ? initializeStoryState(root) : loadStoryState(root)))
    console.log(JSON.stringify(loaded, null, 2))
  }),
})

type ContextArgs = {
  focus?: string[]
  dependency?: string[]
  preserve?: string[]
  preserveLiteral?: string[]
  exclude?: string[]
  through?: string
}

export function contextSpecFromArgs(args: ContextArgs): WriterContextSpec | undefined {
  const supplied = [args.focus, args.dependency, args.preserve, args.preserveLiteral, args.exclude, args.through].some(
    (value) => value !== undefined,
  )
  if (!supplied) return undefined
  if (!args.focus?.length) throw new Error("--focus is required when supplying explicit context")
  const preservationRefs = args.preserve ?? []
  const preservationLiterals = (args.preserveLiteral ?? []).map((value) => {
    const index = value.indexOf("=")
    if (index < 1 || index === value.length - 1) throw new Error("--preserve-literal must use passage-ref=literal")
    const ref = value.slice(0, index)
    if (!preservationRefs.includes(ref)) throw new Error(`preservation literal requires --preserve ${ref}`)
    return { ref, text: value.slice(index + 1) }
  })
  return {
    focusRefs: args.focus,
    dependencyRefs: args.dependency ?? [],
    preservationRefs,
    preservationLiterals,
    excludeRefs: args.exclude ?? [],
    ...(args.through ? { throughRef: args.through } : {}),
  }
}

export function parseChapterArgs(values: string[]) {
  const chapters = values.map((value) => {
    const index = value.indexOf("=")
    if (index < 1 || index === value.length - 1) throw new Error("--chapter must use stable-id=relative/path.md")
    return { id: value.slice(0, index), path: value.slice(index + 1) }
  })
  if (new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length) {
    throw new Error("--chapter contains duplicate stable IDs")
  }
  if (new Set(chapters.map((chapter) => chapter.path)).size !== chapters.length) {
    throw new Error("--chapter contains duplicate paths")
  }
  return chapters
}

export function chapterMappingsFromTrackedPaths(values: string[]) {
  const candidates = values
    .map((value) => value.replaceAll("\\", "/"))
    .filter((value) => {
      if (!/\.(md|markdown|txt)$/i.test(value)) return false
      if (value.startsWith(".") || value.includes("/.")) return false
      const name = path.posix.basename(value, path.posix.extname(value))
      return (
        /(^|\/)(manuscript|chapters?|draft)(\/|$)/i.test(value) ||
        /^(chapter|ch)[-_ ]*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:[-_ ].*)?$/i.test(name) ||
        /^(prologue|epilogue|interlude)[-_ ]*\d*$/i.test(name)
      )
    })
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
  return candidates.map((chapterPath, index) => ({ id: `ch${String(index + 1).padStart(2, "0")}`, path: chapterPath }))
}

async function discoverTrackedChapters(root: string) {
  const tracked = (await execute("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })).stdout
    .split("\0")
    .filter(Boolean)
  const chapters = chapterMappingsFromTrackedPaths(tracked)
  if (!chapters.length) {
    throw new Error(
      "No tracked chapter files were found under manuscript/, chapter(s)/, or draft/. Add and commit them first, or pass --chapter ch01=relative/path.md.",
    )
  }
  return chapters
}

function titleFromDirectory(root: string) {
  const value = path.basename(root).replace(/[-_]+/g, " ").trim()
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) || "Untitled Novel"
}

async function ensureCleanTrackedWorkspace(root: string, chapterPaths: string[]) {
  const repository = (
    await execute("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" })
  ).stdout.trim()
  const [workspaceRoot, repositoryRoot] = await Promise.all([realpath(root), realpath(repository)])
  if (path.relative(workspaceRoot, repositoryRoot)) throw new Error("writer workspace must be the Git repository root")
  const status = (
    await execute("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8" })
  ).stdout
  if (status) throw new Error("writer workspace must be clean before bootstrap")
  for (const chapter of chapterPaths) {
    await execute("git", ["ls-files", "--error-unmatch", "--", chapter], { cwd: root, encoding: "utf8" }).catch(() => {
      throw new Error(`chapter must already be tracked by Git: ${chapter}`)
    })
  }
}

function headlessResult(sessionID: string, output: WriterSession.Output) {
  return {
    protocolVersion: 1,
    sessionID,
    job: output.task.job,
    authority: output.task.authority,
    selection: output.selection,
    contextTrace: output.contextTrace,
    result: output.result,
    usage: output.usage,
    proposalPath: output.proposalPath,
  }
}

function formatWriterText(output: WriterSession.Output) {
  const lines = [output.result.answer]
  if (output.result.evidence.length) lines.push("", `Evidence: ${output.result.evidence.join(", ")}`)
  if (output.result.proposal) lines.push("", `Proposal: ${output.result.proposal.id}`, `Saved: ${output.proposalPath}`)
  return lines.join("\n")
}
