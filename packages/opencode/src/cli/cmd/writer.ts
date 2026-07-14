import {
  commitEditProposal,
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
import path from "node:path"
import type { Argv } from "yargs"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { WriterSession } from "@/writer/session"
import { effectCmd, fail } from "../effect-cmd"
import { cmd } from "./cmd"

const jobs = ["explain", "diagnose", "plan", "revise"] as const

export const WriterCommand = cmd({
  command: "writer",
  describe: "run the Novel Agent Harness headlessly",
  builder: (yargs: Argv) =>
    yargs
      .command(WriterRunCommand)
      .command(WriterReviewCommand)
      .command(WriterCommitCommand)
      .command(WriterStateCommand)
      .demandCommand(),
  async handler() {},
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
    const session = yield* sessions.create({
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
  describe: "commit an author-confirmed manuscript proposal and emit its receipt",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .positional("proposalId", { type: "string", demandOption: true })
      .option("dir", { type: "string", describe: "novel workspace directory" })
      .option("confirmed-by", { type: "string", demandOption: true, describe: "author identity for the receipt" })
      .option("yes", { type: "boolean", default: false, describe: "explicitly approve this exact proposal" })
      .option("message", { type: "string", describe: "optional Git commit message" }),
  handler: Effect.fn("Cli.writer.commit")(function* (args) {
    if (!args.yes) return yield* fail("Refusing to commit without explicit --yes author confirmation")
    const root = path.resolve(process.cwd(), args.dir ?? ".")
    const result = yield* Effect.promise(() =>
      commitEditProposal(
        root,
        args.proposalId,
        {
          confirmationVersion: 1,
          proposalId: args.proposalId as `sha256:${string}`,
          decision: "approve",
          confirmedBy: args["confirmed-by"],
          confirmedAt: new Date().toISOString(),
        },
        { message: args.message },
      ),
    )
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

function headlessResult(sessionID: string, output: WriterSession.Output) {
  return {
    protocolVersion: 1,
    sessionID,
    job: output.task.job,
    authority: output.task.authority,
    selection: output.selection,
    contextTrace: output.contextTrace,
    result: output.result,
    proposalPath: output.proposalPath,
  }
}

function formatWriterText(output: WriterSession.Output) {
  const lines = [output.result.answer]
  if (output.result.evidence.length) lines.push("", `Evidence: ${output.result.evidence.join(", ")}`)
  if (output.result.proposal) lines.push("", `Proposal: ${output.result.proposal.id}`, `Saved: ${output.proposalPath}`)
  return lines.join("\n")
}
