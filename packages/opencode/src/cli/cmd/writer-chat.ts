import {
  commitEditProposal,
  loadEditProposal,
  loadWriterWorkspace,
  renderProposalDiff,
  type WriterJob,
} from "@novel-agent-harness/writer"
import { Cause, Effect, Exit } from "effect"
import { execFile } from "node:child_process"
import { createInterface } from "node:readline"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { Argv } from "yargs"
import { Provider } from "@/provider/provider"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { WriterSession } from "@/writer/session"
import { effectCmd, fail } from "../effect-cmd"

const execute = promisify(execFile)
const jobs = ["explain", "diagnose", "plan", "revise"] as const

type ParsedInput =
  | { type: "prompt"; text: string }
  | { type: "command"; name: string; argument: string }
  | { type: "empty" }

export function parseWriterChatInput(value: string): ParsedInput {
  const text = value.trim()
  if (!text) return { type: "empty" }
  if (!text.startsWith("/")) return { type: "prompt", text }
  const index = text.indexOf(" ")
  return {
    type: "command",
    name: text.slice(1, index < 0 ? undefined : index).toLowerCase(),
    argument: index < 0 ? "" : text.slice(index + 1).trim(),
  }
}

export const WriterChatCommand = effectCmd({
  command: "chat [request..]",
  describe: "open an interactive Writer agent in the current novel workspace",
  directory: (args) => path.resolve(process.cwd(), args.dir ?? "."),
  builder: (yargs: Argv) =>
    yargs
      .positional("request", { type: "string", array: true, describe: "optional first Writer request" })
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("model", { alias: "m", type: "string", describe: "model as provider/model" })
      .option("variant", { type: "string", describe: "provider-specific model variant" })
      .option("session", { type: "string", describe: "resume a prior Writer session" })
      .option("continue", { alias: "c", type: "boolean", default: false, describe: "resume the newest Writer session" })
      .option("job", { type: "string", choices: jobs, describe: "force a job for every prompt until /job auto" })
      .option("author", { type: "string", describe: "author identity used by /approve receipts" }),
  handler: Effect.fn("Cli.writer.chat")(function* (args) {
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    if (args.session && args.continue) return yield* fail("Use either --session or --continue, not both")
    const workspace = yield* Effect.tryPromise({
      try: () => loadWriterWorkspace(root),
      catch: () => new Error(`No valid Novel Agent workspace found at ${root}. Run \`novel init\` there first.`),
    }).pipe(Effect.catch((error) => fail(error.message)))

    const sessions = yield* Session.Service
    const requestedModel = args.model ? Provider.parseModel(args.model) : undefined
    let session = args.session
      ? yield* loadInteractiveSession(sessions, root, args.session)
      : args.continue
        ? yield* newestInteractiveSession(sessions, root).pipe(
            Effect.flatMap((found) => (found ? Effect.succeed(found) : fail("No prior Writer session exists here"))),
          )
        : yield* sessions.create({
            title: `Writer: ${workspace.manifest.title}`,
            agent: "writer",
            ...(requestedModel
              ? {
                  model: {
                    id: requestedModel.modelID,
                    providerID: requestedModel.providerID,
                    variant: args.variant ?? "default",
                  },
                }
              : {}),
            metadata: { "novel.writer.phase": "execution", "novel.writer.interface": "interactive" },
          })

    if (requestedModel && (args.session || args.continue)) {
      const savedModel = {
        id: requestedModel.modelID,
        providerID: requestedModel.providerID,
        variant: args.variant ?? "default",
      }
      yield* sessions.setAgentModel({ sessionID: session.id, agent: "writer", model: savedModel, time: Date.now() })
      session = { ...session, model: savedModel }
    }

    let model = requestedModel
    let variant = args.variant
    let forcedJob = args.job as WriterJob | undefined
    let pendingProposal: string | undefined
    let author = args.author
    const first = args.request?.join(" ").trim()
    const queued = first ? [first] : []
    const terminal = process.stdin.isTTY && process.stdout.isTTY
    const reader = bufferedLineReader(terminal)

    writeLine("")
    writeLine(`Novel Agent Harness — ${workspace.manifest.title}`)
    writeLine(`Workspace: ${root}`)
    writeLine(`Session:   ${session.id}`)
    writeLine(`Model:     ${modelLabel(model, session.model)}`)
    writeLine("Type /help for commands. Manuscript changes remain proposals until /approve.")
    writeLine("")

    try {
      while (true) {
        const line = queued.shift() ?? (yield* Effect.promise(() => reader.read("you> ")))
        if (line === undefined) break
        const input = parseWriterChatInput(line)
        if (input.type === "empty") continue
        if (input.type === "command") {
          const command = input.name === "quit" || input.name === "q" ? "exit" : input.name
          if (command === "exit") break
          if (command === "help") {
            printHelp()
            continue
          }
          if (command === "session") {
            writeLine(`Session: ${session.id}`)
            continue
          }
          if (command === "status") {
            const status = yield* Effect.promise(() => gitStatus(root))
            writeLine(`Novel:    ${workspace.manifest.title}`)
            writeLine(`Session:  ${session.id}`)
            writeLine(`Model:    ${modelLabel(model, session.model)}`)
            writeLine(`Job:      ${forcedJob ?? "auto"}`)
            writeLine(`Proposal: ${pendingProposal ?? "none"}`)
            writeLine(`Git:      ${status || "clean"}`)
            continue
          }
          if (command === "job") {
            if (!input.argument || input.argument === "auto") {
              forcedJob = undefined
              writeLine("Job routing: auto")
              continue
            }
            if (!isWriterJob(input.argument)) {
              writeLine(`Unknown job: ${input.argument}. Use auto, ${jobs.join(", ")}.`)
              continue
            }
            forcedJob = input.argument
            writeLine(`Job routing: ${forcedJob}`)
            continue
          }
          if (command === "model") {
            if (!input.argument) {
              writeLine(`Model: ${modelLabel(model, session.model)}`)
              writeLine("Set one with /model provider/model. Configure credentials with `novel providers login`.")
              continue
            }
            const parsed = Provider.parseModel(input.argument)
            const savedModel = { id: parsed.modelID, providerID: parsed.providerID, variant: "default" }
            yield* sessions.setAgentModel({
              sessionID: session.id,
              agent: "writer",
              model: savedModel,
              time: Date.now(),
            })
            session = { ...session, model: savedModel }
            model = parsed
            variant = undefined
            writeLine(`Model: ${input.argument}`)
            continue
          }
          if (command === "new") {
            session = yield* sessions.create({
              title: `Writer: ${workspace.manifest.title}`,
              agent: "writer",
              ...(model
                ? { model: { id: model.modelID, providerID: model.providerID, variant: variant ?? "default" } }
                : {}),
              metadata: { "novel.writer.phase": "execution", "novel.writer.interface": "interactive" },
            })
            pendingProposal = undefined
            writeLine(`Started session ${session.id}`)
            continue
          }
          if (command === "review") {
            const proposalID = input.argument || pendingProposal
            if (!proposalID) {
              writeLine("No pending proposal. Pass an ID as /review sha256:…")
              continue
            }
            const review = yield* Effect.exit(proposalReview(root, proposalID))
            if (Exit.isFailure(review)) {
              writeLine(`Unable to review ${proposalID}: ${formatCause(review.cause)}`)
              continue
            }
            writeLine(review.value.diff)
            pendingProposal = proposalID
            continue
          }
          if (command === "reject") {
            const rejected = input.argument || pendingProposal
            if (!rejected) {
              writeLine("No pending proposal to reject.")
              continue
            }
            if (pendingProposal === rejected) pendingProposal = undefined
            writeLine(`Dismissed ${rejected} from this session. Its immutable proposal file was retained for audit.`)
            continue
          }
          if (command === "approve") {
            const proposalID = input.argument || pendingProposal
            if (!proposalID) {
              writeLine("No pending proposal. Pass an ID as /approve sha256:…")
              continue
            }
            const review = yield* Effect.exit(proposalReview(root, proposalID))
            if (Exit.isFailure(review)) {
              writeLine(`Unable to review ${proposalID}: ${formatCause(review.cause)}`)
              writeLine("Not applied.")
              continue
            }
            writeLine(review.value.diff)
            writeLine("")
            const decision = yield* Effect.promise(() => reader.read(`Type APPLY to commit ${proposalID}: `))
            if (decision !== "APPLY") {
              writeLine("Not applied.")
              continue
            }
            author ??= yield* Effect.promise(() => gitAuthor(root))
            if (!author) author = (yield* Effect.promise(() => reader.read("Author name for the receipt: ")))?.trim()
            if (!author) {
              writeLine("Not applied: an author name is required.")
              continue
            }
            const committed = yield* Effect.exit(
              Effect.tryPromise({
                try: () =>
                  commitEditProposal(root, review.value.proposal.id, {
                    confirmationVersion: 1,
                    proposalId: review.value.proposal.id,
                    decision: "approve",
                    confirmedBy: author!,
                    confirmedAt: new Date().toISOString(),
                  }),
                catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
              }),
            )
            if (Exit.isFailure(committed)) {
              writeLine(`Not applied: ${formatCause(committed.cause)}`)
              continue
            }
            const result = committed.value
            pendingProposal = undefined
            writeLine(`Committed ${result.commit}`)
            writeLine(`Receipt: ${result.receipt.id}`)
            continue
          }
          writeLine(`Unknown command: /${input.name}. Type /help.`)
          continue
        }

        writeLine("writer> working…")
        const result = yield* Effect.exit(
          WriterSession.run({
            sessionID: session.id,
            root,
            request: input.text,
            ...(forcedJob ? { job: forcedJob } : {}),
            ...(model ? { model } : {}),
            ...(variant ? { variant } : {}),
          }),
        )
        if (Exit.isFailure(result)) {
          writeLine(`writer> ${formatCause(result.cause)}`)
          writeLine("Check the model and credentials with `novel models` and `novel providers list`.")
          continue
        }
        const output = result.value
        writeLine(`writer> ${output.result.answer}`)
        if (output.result.evidence.length) writeLine(`Evidence: ${output.result.evidence.join(", ")}`)
        if (output.result.proposal) {
          pendingProposal = output.result.proposal.id
          writeLine(`Proposal: ${pendingProposal}`)
          writeLine("Use /review to inspect it, then /approve to apply it.")
        }
        writeLine(
          `Usage: ${output.usage.inputTokens} input, ${output.usage.outputTokens} output, $${output.usage.costUsd.toFixed(4)}`,
        )
        writeLine("")
      }
    } finally {
      reader.close()
    }
    writeLine(`Session saved: ${session.id}`)
    writeLine(`Resume with: novel --session ${session.id}`)
    return undefined
  }),
})

function printHelp() {
  writeLine("/status              workspace, model, job, Git, and pending proposal")
  writeLine("/job auto|JOB        route automatically or force explain, diagnose, plan, revise")
  writeLine("/model [PROVIDER/ID] show or change the model for later prompts")
  writeLine("/review [ID]         render the latest or named immutable proposal diff")
  writeLine("/approve [ID]        review, require typed APPLY, then create a verified Git commit")
  writeLine("/reject [ID]         dismiss a proposal without deleting its audit artifact")
  writeLine("/new                 start a new conversation in this novel")
  writeLine("/session             print the resumable session ID")
  writeLine("/exit                save and leave the Writer agent")
}

function writeLine(value: string) {
  process.stdout.write(value + "\n")
}

type LineReader = {
  read(prompt: string): Promise<string | undefined>
  close(): void
}

function bufferedLineReader(terminal: boolean): LineReader {
  const reader = createInterface({ input: process.stdin, output: process.stdout, terminal })
  const queued: string[] = []
  const waiting: Array<(value: string | undefined) => void> = []
  let ended = false
  reader.on("line", (line) => {
    const resolve = waiting.shift()
    if (resolve) resolve(line)
    else queued.push(line)
  })
  reader.on("close", () => {
    ended = true
    while (waiting.length) waiting.shift()!(undefined)
  })
  reader.on("SIGINT", () => {
    reader.close()
  })
  return {
    read(prompt) {
      process.stdout.write(prompt)
      const line = queued.shift()
      if (line !== undefined) return Promise.resolve(line)
      if (ended) return Promise.resolve(undefined)
      return new Promise((resolve) => waiting.push(resolve))
    },
    close() {
      reader.close()
    },
  }
}

function isWriterJob(value: string): value is WriterJob {
  return jobs.some((job) => job === value)
}

function modelLabel(selected: ReturnType<typeof Provider.parseModel> | undefined, saved: Session.Info["model"]) {
  if (selected) return `${selected.providerID}/${selected.modelID}`
  if (saved) return `${saved.providerID}/${saved.id}`
  return "configured default"
}

function formatCause(cause: Cause.Cause<unknown>) {
  const failure = Cause.squash(cause)
  return failure instanceof Error ? failure.message : String(failure)
}

function proposalReview(root: string, proposalID: string) {
  return Effect.tryPromise({
    try: async () => {
      const proposal = await loadEditProposal(root, proposalID)
      return { proposal, diff: renderProposalDiff(await loadWriterWorkspace(root), proposal) }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })
}

async function sameRoot(left: string, right: string) {
  const [a, b] = await Promise.all([realpath(left), realpath(right)])
  return path.relative(a, b) === ""
}

function validWriterSession(session: Session.Info) {
  return (
    !session.parentID &&
    session.agent === "writer" &&
    session.metadata?.["novel.writer.phase"] === "execution" &&
    ["headless", "interactive"].includes(String(session.metadata?.["novel.writer.interface"]))
  )
}

function loadInteractiveSession(sessions: Session.Interface, root: string, id: string) {
  return sessions.get(SessionID.make(id)).pipe(
    Effect.catchCause(() => fail(`Writer session not found: ${id}`)),
    Effect.flatMap((session) =>
      Effect.promise(() => sameRoot(session.directory, root)).pipe(
        Effect.flatMap((same) =>
          same && validWriterSession(session)
            ? Effect.succeed(session)
            : fail("Session is not a resumable Writer conversation for this novel workspace"),
        ),
      ),
    ),
  )
}

function newestInteractiveSession(sessions: Session.Interface, root: string) {
  return Effect.gen(function* () {
    const all = (yield* sessions.list()).filter(validWriterSession).sort((a, b) => b.time.updated - a.time.updated)
    for (const session of all) {
      if (yield* Effect.promise(() => sameRoot(session.directory, root))) return session
    }
    return undefined
  })
}

async function gitStatus(root: string) {
  return (await execute("git", ["status", "--short"], { cwd: root, encoding: "utf8" })).stdout.trim()
}

async function gitAuthor(root: string) {
  return execute("git", ["config", "user.name"], { cwd: root, encoding: "utf8" })
    .then((result) => result.stdout.trim() || undefined)
    .catch(() => undefined)
}
