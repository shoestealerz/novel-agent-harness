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
  WriterContractError,
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
  autoContext?: boolean
  contextStrategy?: ContextStrategy
  model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  variant?: string
  onProgress?: (event: ProgressEvent) => void
}

export type ProgressEvent =
  | { phase: "context-selection"; status: "started" }
  | {
      phase: "context-selection"
      status: "completed"
      selectionSessionID: SessionID
      contextItems: number
      contextWords: number
      usage: { inputTokens: number; outputTokens: number; costUsd: number }
    }
  | { phase: "execution"; status: "started"; contextItems: number; contextWords: number }
  | {
      phase: "execution"
      status: "completed"
      usage: { inputTokens: number; outputTokens: number; costUsd: number }
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

export function selectionPromptInput(
  input: Pick<Input, "sessionID" | "model" | "variant" | "request" | "job"> & {
    manuscript: Pick<WriterContextItem, "ref" | "text" | "metadata">[]
  },
) {
  const job = routeWriterJob(input.request, input.job)
  return {
    sessionID: input.sessionID,
    agent: "writer",
    ...(input.model ? { model: input.model } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    system: writerSelectionSystemPrompt,
    tools: {
      StructuredOutput: true,
      novel_list: false,
      novel_read: false,
      novel_context: false,
      novel_state: false,
      novel_proposal: false,
    },
    format: new SessionV1.OutputFormatJsonSchema({
      type: "json_schema",
      schema: writerSelectionSchema,
      retryCount: 2,
    }),
    parts: [
      {
        type: "text" as const,
        text: renderWriterSelectionRequest({ request: input.request, job, manuscript: input.manuscript }),
      },
    ],
  }
}

export function mergeSelectionConstraints(
  selection: WriterContextSelection,
  constraints?: WriterContextSpec,
): WriterContextSelection {
  if (!constraints) return selection
  const declaredFocus = new Set(constraints.focusRefs)
  const declaredPreservation = new Set(constraints.preservationRefs ?? [])
  const focusRefs = constraints.focusRefs.length
    ? [...constraints.focusRefs]
    : selection.focusRefs.filter((ref) => !declaredPreservation.has(ref))
  const preservationRefs = unique([
    ...(constraints.preservationRefs ?? []),
    ...selection.preservationRefs.filter((ref) => !declaredFocus.has(ref)),
  ])
  const selectedFocusDependencies = constraints.focusRefs.length
    ? selection.focusRefs.filter((ref) => !declaredFocus.has(ref) && !declaredPreservation.has(ref))
    : []
  const occupied = new Set([...focusRefs, ...preservationRefs])
  const dependencyRefs = unique([
    ...(constraints.dependencyRefs ?? []),
    ...selectedFocusDependencies,
    ...selection.dependencyRefs,
  ]).filter((ref) => !occupied.has(ref))
  const declaredLiteralRefs = new Set(constraints.preservationLiterals?.map((item) => item.ref) ?? [])
  const preservationLiterals = [
    ...selection.preservationLiterals.filter((item) => !declaredLiteralRefs.has(item.ref)),
    ...(constraints.preservationLiterals ?? []),
  ]
  return {
    ...selection,
    focusRefs,
    dependencyRefs,
    preservationRefs,
    preservationLiterals,
    excludeRefs: unique([...(constraints.excludeRefs ?? []), ...selection.excludeRefs]),
    throughRef: constraints.throughRef ?? selection.throughRef,
  }
}

export function structuredRetryInput<
  T extends ReturnType<typeof promptInput> | ReturnType<typeof selectionPromptInput>,
>(input: T): T {
  return {
    ...input,
    parts: [
      {
        type: "text" as const,
        text: "Your previous response was not captured as structured output. Do not restate prose. Call StructuredOutput now with one complete object matching the requested schema and task.",
      },
    ],
  } as T
}

export function contractRetryInput<
  T extends ReturnType<typeof promptInput> | ReturnType<typeof selectionPromptInput>,
>(input: T, subject: "writer response" | "context selection", error: Error): T {
  return {
    ...input,
    parts: [
      {
        type: "text" as const,
        text: [
          `Your previous structured ${subject} failed contract validation: ${error.message}`,
          "Return one corrected complete object matching the requested schema and original task.",
          "Preserve valid content, use only exact stable references admitted by the task, and do not add prose outside StructuredOutput.",
          subject === "context selection"
            ? "The temporal boundary must include every declared focus, dependency, and preservation reference; otherwise remove the reference or move the boundary later."
            : "Every evidence value and finding evidence value must be an exact selected passage reference with no quote or commentary appended.",
        ].join(" "),
      },
    ],
  } as T
}

export async function finalize(root: string, turn: PreparedTurn, value: unknown): Promise<Omit<Output, "usage">> {
  const result = parseWriterResult(turn.task, value)
  const proposalPath = result.proposal ? await saveEditProposal(root, result.proposal) : undefined
  return { ...turn, result, ...(proposalPath ? { proposalPath } : {}) }
}

export const run = Effect.fn("WriterSession.run")(function* (input: Input) {
  const session = yield* SessionPrompt.Service
  const admission =
    input.context?.length || input.contextStrategy === "maximum" || (input.contextSpec && !input.autoContext)
      ? {
          input,
          selection: undefined,
          turn: yield* Effect.promise(() => prepare(input)),
        }
      : yield* Effect.gen(function* () {
          notifyProgress(input, { phase: "context-selection", status: "started" })
          const sessions = yield* Session.Service
          const workspace = yield* Effect.promise(() => loadWriterWorkspace(input.root))
          const manuscript = workspace.chapters.flatMap((chapter) =>
            chapter.passages.map((passage) => ({
              ref: passage.ref,
              text: passage.text,
              metadata: { chapterId: passage.chapterId, path: passage.path, sha256: passage.sha256 },
            })),
          )
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
          const request = selectionPromptInput({ ...input, sessionID: selector.id, manuscript })
          let response = yield* session.prompt(request)
          let info = response.info
          if (info.role !== "assistant")
            throw new Error("writer context selection did not return an assistant response")
          if (info.structured === undefined) {
            response = yield* session.prompt(structuredRetryInput(request))
            info = response.info
            if (info.role !== "assistant")
              throw new Error("writer context selection retry did not return an assistant response")
          }
          if (info.structured === undefined)
            throw new Error("writer context selection did not return structured output")
          const selectionValue = info.structured
          const admit = (value: unknown) =>
            attempt(async () => {
              const selection = mergeSelectionConstraints(parseWriterContextSelection(value), input.contextSpec)
              const contextSpec: WriterContextSpec = {
                focusRefs: selection.focusRefs,
                dependencyRefs: selection.dependencyRefs,
                preservationRefs: selection.preservationRefs,
                preservationLiterals: selection.preservationLiterals,
                excludeRefs: selection.excludeRefs,
                throughRef: selection.throughRef,
              }
              const selectedInput = { ...input, contextSpec }
              return { input: selectedInput, contextSpec: selection, turn: await prepare(selectedInput) }
            })
          let admitted = yield* Effect.promise(() => admit(selectionValue))
          let contractRetries = 0
          while (!admitted.ok && repairableSelectionError(admitted.error) && contractRetries < 2) {
            response = yield* session.prompt(contractRetryInput(request, "context selection", admitted.error))
            info = response.info
            if (info.role !== "assistant")
              throw new Error("writer context selection contract retry did not return an assistant response")
            if (info.structured === undefined)
              throw new Error("writer context selection contract retry did not return structured output")
            const correctedSelectionValue = info.structured
            admitted = yield* Effect.promise(() => admit(correctedSelectionValue))
            contractRetries++
          }
          if (!admitted.ok) throw admitted.error
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
          notifyProgress(input, {
            phase: "context-selection",
            status: "completed",
            selectionSessionID: selector.id,
            contextItems: admitted.value.turn.contextTrace.contextItems,
            contextWords: admitted.value.turn.contextTrace.contextWords,
            usage,
          })
          return {
            input: admitted.value.input,
            turn: admitted.value.turn,
            selection: { sessionID: selector.id, contextSpec: admitted.value.contextSpec, usage },
          }
        })
  const turn = admission.turn
  notifyProgress(input, {
    phase: "execution",
    status: "started",
    contextItems: turn.contextTrace.contextItems,
    contextWords: turn.contextTrace.contextWords,
  })
  const request = promptInput(input, turn)
  let response = yield* session.prompt(request)
  let info = response.info
  if (info.role !== "assistant") throw new Error("writer session did not return an assistant response")
  let executionUsage = assistantUsage(info)
  if (info.structured === undefined) {
    response = yield* session.prompt(structuredRetryInput(request))
    info = response.info
    if (info.role !== "assistant") throw new Error("writer session retry did not return an assistant response")
    executionUsage = addUsage(executionUsage, assistantUsage(info))
  }
  if (info.structured === undefined) throw new Error("writer session did not return structured output")
  const writerValue = info.structured
  let finalized = yield* Effect.promise(() => attempt(() => finalize(input.root, turn, writerValue)))
  let contractRetries = 0
  while (!finalized.ok && finalized.error instanceof WriterContractError && contractRetries < 2) {
    response = yield* session.prompt(contractRetryInput(request, "writer response", finalized.error))
    info = response.info
    if (info.role !== "assistant") throw new Error("writer session contract retry did not return an assistant response")
    executionUsage = addUsage(executionUsage, assistantUsage(info))
    if (info.structured === undefined) throw new Error("writer session contract retry did not return structured output")
    const correctedWriterValue = info.structured
    finalized = yield* Effect.promise(() => attempt(() => finalize(input.root, turn, correctedWriterValue)))
    contractRetries++
  }
  if (!finalized.ok) throw finalized.error
  const output = finalized.value
  const selectionUsage = admission.selection?.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  const usage = {
    inputTokens: executionUsage.inputTokens + selectionUsage.inputTokens,
    outputTokens: executionUsage.outputTokens + selectionUsage.outputTokens,
    costUsd: executionUsage.costUsd + selectionUsage.costUsd,
  }
  notifyProgress(input, { phase: "execution", status: "completed", usage })
  return {
    ...output,
    usage,
    ...(admission.selection ? { selection: admission.selection } : {}),
  }
})

function assistantUsage(info: SessionV1.Assistant) {
  return {
    inputTokens: info.tokens.input + info.tokens.cache.read + info.tokens.cache.write,
    outputTokens: info.tokens.output + info.tokens.reasoning,
    costUsd: info.cost,
  }
}

function addUsage(
  left: { inputTokens: number; outputTokens: number; costUsd: number },
  right: { inputTokens: number; outputTokens: number; costUsd: number },
) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    costUsd: left.costUsd + right.costUsd,
  }
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function repairableSelectionError(error: Error) {
  return /writer context selection|context specification|selected context|preservation literal/i.test(error.message)
}

function attempt<T>(evaluate: () => T | Promise<T>) {
  return Promise.resolve()
    .then(evaluate)
    .then(
      (value) => ({ ok: true as const, value }),
      (cause) => ({ ok: false as const, error: cause instanceof Error ? cause : new Error(String(cause)) }),
    )
}

function notifyProgress(input: Input, event: ProgressEvent) {
  try {
    input.onProgress?.(event)
  } catch {
    // Progress reporting must never change the Writer result or authority boundary.
  }
}

export * as WriterSession from "./session"
