import {
  compileContext,
  loadEditProposal,
  loadWriterWorkspace,
  renderProposalDiff,
  type WriterContextItem,
  type WriterWorkspace,
} from "@novel-agent-harness/writer"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Tool } from "./tool"

const References = Schema.mutable(Schema.Array(Schema.String))
const RequiredReferences = Schema.mutable(Schema.NonEmptyArray(Schema.String))
const PreservationLiterals = Schema.mutable(Schema.Array(Schema.Struct({ ref: Schema.String, text: Schema.String })))
const ListParameters = Schema.Struct({})
const ReadParameters = Schema.Struct({
  refs: RequiredReferences.annotate({ description: "Stable passage references to read" }),
  throughRef: Schema.optional(Schema.String).annotate({
    description: "Optional inclusive temporal boundary; later passages are never returned",
  }),
})
const ContextParameters = Schema.Struct({
  focusRefs: RequiredReferences,
  dependencyRefs: Schema.optional(References),
  preservationRefs: Schema.optional(References),
  preservationLiterals: Schema.optional(PreservationLiterals),
  excludeRefs: Schema.optional(References),
  throughRef: Schema.optional(Schema.String),
})
const ProposalParameters = Schema.Struct({
  proposalId: Schema.String.annotate({ description: "The proposal's sha256: content address" }),
})

export const NovelListTool = Tool.define(
  "novel_list",
  Effect.succeed({
    description:
      "List the novel's Git-backed chapter and stable passage structure without reading passage prose. Use this before selecting context when the relevant references are unknown.",
    parameters: ListParameters,
    execute: (_params: Schema.Schema.Type<typeof ListParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({ permission: "novel_list", patterns: ["*"], always: ["*"], metadata: {} })
        const workspace = yield* writerWorkspace()
        const structure = {
          title: workspace.manifest.title,
          formatVersion: workspace.manifest.formatVersion,
          chapters: workspace.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            path: chapter.path,
            passages: chapter.passages.map((passage) => passage.ref),
          })),
        }
        return {
          title: workspace.manifest.title,
          output: JSON.stringify(structure, null, 2),
          metadata: { chapters: workspace.chapters.length, passages: workspace.passages.size },
        }
      }).pipe(Effect.orDie),
  }),
)

export const NovelReadTool = Tool.define(
  "novel_read",
  Effect.succeed({
    description:
      "Read exact stable passages from the novel. When throughRef is supplied, passages later in manuscript order are excluded before prose is returned.",
    parameters: ReadParameters,
    execute: (params: Schema.Schema.Type<typeof ReadParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({ permission: "novel_read", patterns: params.refs, always: ["*"], metadata: {} })
        const workspace = yield* writerWorkspace()
        const compiled = compileContext(
          { contextSpec: { focusRefs: params.refs, throughRef: params.throughRef } },
          contextCatalog(workspace),
          "task-aware",
        )
        return {
          title: `Read ${compiled.trace.selectedRefs.length} novel passages`,
          output: JSON.stringify({ passages: compiled.task.context, trace: compiled.trace }, null, 2),
          metadata: {
            selectedRefs: compiled.trace.selectedRefs,
            excludedRefs: params.refs.filter((ref) => !compiled.trace.selectedRefs.includes(ref)),
          },
        }
      }).pipe(Effect.orDie),
  }),
)

export const NovelContextTool = Tool.define(
  "novel_context",
  Effect.succeed({
    description:
      "Compile a controlled manuscript packet from explicit focus, dependency, preservation, exclusion, and temporal-boundary references. Exact preservation literals are validated against source prose.",
    parameters: ContextParameters,
    execute: (params: Schema.Schema.Type<typeof ContextParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const requested = [...params.focusRefs, ...(params.dependencyRefs ?? []), ...(params.preservationRefs ?? [])]
        yield* ctx.ask({ permission: "novel_context", patterns: requested, always: ["*"], metadata: {} })
        const workspace = yield* writerWorkspace()
        const compiled = compileContext(
          {
            contextSpec: {
              focusRefs: params.focusRefs,
              dependencyRefs: params.dependencyRefs,
              preservationRefs: params.preservationRefs,
              preservationLiterals: params.preservationLiterals,
              excludeRefs: params.excludeRefs,
              throughRef: params.throughRef,
            },
          },
          contextCatalog(workspace),
          "task-aware",
        )
        return {
          title: `Compiled ${compiled.trace.selectedRefs.length} novel passages`,
          output: JSON.stringify({ context: compiled.task.context, trace: compiled.trace }, null, 2),
          metadata: compiled.trace,
        }
      }).pipe(Effect.orDie),
  }),
)

export const NovelProposalTool = Tool.define(
  "novel_proposal",
  Effect.succeed({
    description:
      "Inspect a saved immutable proposal and render its stale-safe passage diff. This tool cannot approve, apply, or commit the proposal.",
    parameters: ProposalParameters,
    execute: (params: Schema.Schema.Type<typeof ProposalParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "novel_proposal",
          patterns: [params.proposalId],
          always: ["*"],
          metadata: {},
        })
        const workspace = yield* writerWorkspace()
        const proposal = yield* Effect.promise(() => loadEditProposal(workspace.root, params.proposalId))
        return {
          title: `Proposal ${proposal.id}`,
          output: renderProposalDiff(workspace, proposal),
          metadata: { proposalId: proposal.id, targets: proposal.edits.map((edit) => edit.target) },
        }
      }).pipe(Effect.orDie),
  }),
)

function writerWorkspace() {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    return yield* Effect.promise(() => loadWriterWorkspace(instance.directory))
  })
}

function contextCatalog(workspace: WriterWorkspace): WriterContextItem[] {
  return workspace.chapters.flatMap((chapter) =>
    chapter.passages.map((passage) => ({
      ref: passage.ref,
      text: passage.text,
      kind: "manuscript" as const,
      metadata: { chapterId: passage.chapterId, path: passage.path, sha256: passage.sha256 },
    })),
  )
}
