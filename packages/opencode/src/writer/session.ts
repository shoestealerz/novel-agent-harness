import {
  compileContext,
  createWriterTask,
  loadWriterWorkspace,
  parseWriterResult,
  renderWriterContract,
  saveEditProposal,
  writerResponseSchema,
  writerSystemPrompt,
  type ContextStrategy,
  type ContextTrace,
  type WriterContextItem,
  type WriterContextSpec,
  type WriterJob,
  type WriterResult,
  type WriterTask,
} from "@novel-agent-harness/writer"
import { Effect } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionPrompt } from "@/session/prompt"
import type { SessionID } from "@/session/schema"

export type Input = {
  sessionID: SessionID
  root: string
  request: string
  job?: WriterJob
  context?: WriterContextItem[]
  contextSpec?: WriterContextSpec
  contextStrategy?: ContextStrategy
  model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  variant?: string
}

export type PreparedTurn = {
  task: WriterTask
  contextTrace: ContextTrace
}

export type Output = PreparedTurn & {
  result: WriterResult
  proposalPath?: string
}

export async function prepare(input: Omit<Input, "sessionID" | "model" | "variant">): Promise<PreparedTurn> {
  const workspace = await loadWriterWorkspace(input.root)
  const catalog = workspace.chapters.flatMap((chapter) =>
    chapter.passages.map((passage) => ({
      ref: passage.ref,
      text: passage.text,
      kind: "manuscript" as const,
      metadata: {
        chapterId: passage.chapterId,
        path: passage.path,
        sha256: passage.sha256,
      },
    })),
  )
  const compiled = compileContext(
    { context: input.context, contextSpec: input.contextSpec },
    catalog,
    input.contextStrategy ?? (input.contextSpec ? "task-aware" : "supplied"),
  )
  return {
    task: createWriterTask({
      request: input.request,
      job: input.job,
      context: compiled.task.context ?? [],
      contextSpec: compiled.task.contextSpec,
    }),
    contextTrace: compiled.trace,
  }
}

export function promptInput(input: Pick<Input, "sessionID" | "model" | "variant">, turn: PreparedTurn) {
  return {
    sessionID: input.sessionID,
    agent: "writer",
    ...(input.model ? { model: input.model } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    system: writerSystemPrompt,
    format: { type: "json_schema" as const, schema: writerResponseSchema, retryCount: 2 },
    parts: [{ type: "text" as const, text: renderWriterContract(turn.task) }],
  }
}

export async function finalize(root: string, turn: PreparedTurn, value: unknown): Promise<Output> {
  const result = parseWriterResult(turn.task, value)
  const proposalPath = result.proposal ? await saveEditProposal(root, result.proposal) : undefined
  return { ...turn, result, ...(proposalPath ? { proposalPath } : {}) }
}

export const run = Effect.fn("WriterSession.run")(function* (input: Input) {
  const session = yield* SessionPrompt.Service
  const turn = yield* Effect.promise(() => prepare(input))
  const response = yield* session.prompt(promptInput(input, turn))
  const info = response.info
  if (info.role !== "assistant") throw new Error("writer session did not return an assistant response")
  if (info.structured === undefined) throw new Error("writer session did not return structured output")
  return yield* Effect.promise(() => finalize(input.root, turn, info.structured))
})

export * as WriterSession from "./session"
