import {
  compileContext,
  createWriterTask,
  loadWriterWorkspace,
  parseWriterResult,
  parseWriterContextSelection,
  renderWriterContract,
  renderWriterSelectionRequest,
  routeWriterJob,
  saveEditProposal,
  writerResponseSchemaFor,
  writerSelectionSchema,
  writerSelectionSystemPrompt,
  writerSystemPrompt,
  type ContextStrategy,
  type ContextTrace,
  type WriterContextItem,
  type WriterContextSelection,
  type WriterContextSpec,
  type WriterJob,
  type WriterResult,
  type WriterTask,
} from "@novel-agent-harness/writer"
import { Effect } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
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
  usage: { inputTokens: number; outputTokens: number; costUsd: number }
  proposalPath?: string
  selection?: {
    sessionID: SessionID
    contextSpec: WriterContextSelection
    usage: { inputTokens: number; outputTokens: number; costUsd: number }
  }
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
    tools: {
      StructuredOutput: true,
      novel_list: false,
      novel_read: false,
      novel_context: false,
      novel_proposal: false,
      novel_state: false,
    },
    format: new SessionV1.OutputFormatJsonSchema({
      type: "json_schema",
      schema: writerResponseSchemaFor(turn.task),
      retryCount: 2,
    }),
    parts: [{ type: "text" as const, text: renderWriterContract(turn.task) }],
  }
}

export function selectionPromptInput(input: Pick<Input, "sessionID" | "model" | "variant" | "request" | "job">) {
  const job = routeWriterJob(input.request, input.job)
  return {
    sessionID: input.sessionID,
    agent: "writer",
    ...(input.model ? { model: input.model } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    system: writerSelectionSystemPrompt,
    tools: {
      StructuredOutput: true,
      novel_list: true,
      novel_read: true,
      novel_context: true,
      novel_state: true,
      novel_proposal: false,
    },
    format: new SessionV1.OutputFormatJsonSchema({
      type: "json_schema",
      schema: writerSelectionSchema,
      retryCount: 2,
    }),
    parts: [{ type: "text" as const, text: renderWriterSelectionRequest({ request: input.request, job }) }],
  }
}

export async function finalize(root: string, turn: PreparedTurn, value: unknown): Promise<Omit<Output, "usage">> {
  const result = parseWriterResult(turn.task, value)
  const proposalPath = result.proposal ? await saveEditProposal(root, result.proposal) : undefined
  return { ...turn, result, ...(proposalPath ? { proposalPath } : {}) }
}

export const run = Effect.fn("WriterSession.run")(function* (input: Input) {
  const session = yield* SessionPrompt.Service
  const admission =
    input.context?.length || input.contextSpec
      ? { input, selection: undefined }
      : yield* Effect.gen(function* () {
          const sessions = yield* Session.Service
          const parent = input.model ? undefined : yield* sessions.get(input.sessionID)
          const selector = yield* sessions.create({
            parentID: input.sessionID,
            title: "Writer context selection",
            agent: "writer",
            model: input.model
              ? { id: input.model.modelID, providerID: input.model.providerID, variant: input.variant ?? "default" }
              : parent?.model,
            metadata: { "novel.writer.phase": "context-selection" },
          })
          const response = yield* session.prompt(selectionPromptInput({ ...input, sessionID: selector.id }))
          const info = response.info
          if (info.role !== "assistant")
            throw new Error("writer context selection did not return an assistant response")
          if (info.structured === undefined)
            throw new Error("writer context selection did not return structured output")
          const selection = parseWriterContextSelection(info.structured)
          const selectorInfo = yield* sessions.get(selector.id)
          const selectorTokens = selectorInfo.tokens ?? {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          }
          const usage = {
            inputTokens: selectorTokens.input + selectorTokens.cache.read + selectorTokens.cache.write,
            outputTokens: selectorTokens.output + selectorTokens.reasoning,
            costUsd: selectorInfo.cost ?? 0,
          }
          const contextSpec: WriterContextSpec = {
            focusRefs: selection.focusRefs,
            dependencyRefs: selection.dependencyRefs,
            preservationRefs: selection.preservationRefs,
            preservationLiterals: selection.preservationLiterals,
            excludeRefs: selection.excludeRefs,
            throughRef: selection.throughRef,
          }
          return {
            input: { ...input, contextSpec },
            selection: { sessionID: selector.id, contextSpec: selection, usage },
          }
        })
  const turn = yield* Effect.promise(() => prepare(admission.input))
  const response = yield* session.prompt(promptInput(input, turn))
  const info = response.info
  if (info.role !== "assistant") throw new Error("writer session did not return an assistant response")
  if (info.structured === undefined) throw new Error("writer session did not return structured output")
  const output = yield* Effect.promise(() => finalize(input.root, turn, info.structured))
  const selectionUsage = admission.selection?.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  return {
    ...output,
    usage: {
      inputTokens: info.tokens.input + info.tokens.cache.read + info.tokens.cache.write + selectionUsage.inputTokens,
      outputTokens: info.tokens.output + info.tokens.reasoning + selectionUsage.outputTokens,
      costUsd: info.cost + selectionUsage.costUsd,
    },
    ...(admission.selection ? { selection: admission.selection } : {}),
  }
})

export * as WriterSession from "./session"
