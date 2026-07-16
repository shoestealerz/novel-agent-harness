import { describe, expect, test } from "bun:test"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Effect, Layer } from "effect"
import { MessageID, SessionID } from "@/session/schema"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { WriterSession } from "@/writer/session"
import { tmpdir } from "../fixture/fixture"

const unusedSessionLayer = Layer.mock(Session.Service, {
  create: () => Effect.die(new Error("context selector session should not be created")),
})

describe("WriterSession", () => {
  test("merges automatic selection without weakening author constraints", () => {
    const merged = WriterSession.mergeSelectionConstraints(
      {
        focusRefs: ["ch01:p002", "ch01:p003"],
        dependencyRefs: ["ch01:p004"],
        preservationRefs: ["ch01:p005"],
        preservationLiterals: [{ ref: "ch01:p005", text: "selector paraphrase" }],
        excludeRefs: ["ch01:p006"],
        throughRef: "ch01:p007",
        rationale: "Selected cross-scene context.",
      },
      {
        focusRefs: ["ch01:p001"],
        preservationRefs: ["ch01:p005"],
        preservationLiterals: [{ ref: "ch01:p005", text: "Mara waited at the locked door." }],
        excludeRefs: ["ch01:p008"],
        throughRef: "ch01:p009",
      },
    )

    expect(merged.focusRefs).toEqual(["ch01:p001"])
    expect(merged.dependencyRefs).toEqual(["ch01:p002", "ch01:p003", "ch01:p004"])
    expect(merged.preservationRefs).toEqual(["ch01:p005"])
    expect(merged.preservationLiterals).toEqual([
      { ref: "ch01:p005", text: "Mara waited at the locked door." },
    ])
    expect(merged.excludeRefs).toEqual(["ch01:p008", "ch01:p006"])
    expect(merged.throughRef).toBe("ch01:p009")
  })

  test("prepares a least-authority task-aware OpenCode turn", async () => {
    await using tmp = await writerWorkspace()
    const turn = await WriterSession.prepare({
      root: tmp.path,
      request: "Plan a revision before changing the bell scene",
      contextSpec: {
        focusRefs: ["ch01:p001"],
        preservationRefs: ["ch01:p002"],
        throughRef: "ch01:p002",
      },
    })

    expect(turn.task.job).toBe("plan")
    expect(turn.task.authority).toBe("read")
    expect(turn.contextTrace.selectedRefs).toEqual(["ch01:p001", "ch01:p002"])

    const input = WriterSession.promptInput({ sessionID: SessionID.make("ses_writer") }, turn)
    expect(input.agent).toBe("writer")
    expect(input.format.type).toBe("json_schema")
    expect(input.parts[0]?.text).toContain("ch01:p001")
    expect(input.system).toContain("fiction-writing harness")
    expect(input.tools).toEqual({
      StructuredOutput: true,
      novel_list: false,
      novel_read: false,
      novel_context: false,
      novel_proposal: false,
      novel_state: false,
    })
    const selection = WriterSession.selectionPromptInput({
      sessionID: SessionID.make("ses_writer_selection"),
      request: "Explain the bell",
      manuscript: [{ ref: "ch01:p001", text: "The bell rang once." }],
    })
    expect(selection.tools).toEqual({
      StructuredOutput: true,
      novel_list: false,
      novel_read: false,
      novel_context: false,
      novel_state: false,
      novel_proposal: false,
    })
    expect(selection.parts[0]?.text).toContain("The bell rang once.")
  })

  test("executes complete manuscript context through an author boundary without a selector session", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_maximum")
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: () =>
        Effect.succeed(
          assistant(
            sessionID,
            tmp.path,
            {
              answer: "The bell and the locked-door reaction form one beat [ch01:p001] [ch01:p002].",
              evidence: ["ch01:p001", "ch01:p002"],
              findings: [],
              edits: [],
              data: { observations: [], inferences: [], unresolved: [], preservation: [] },
            },
            1,
          ),
        ),
    })

    const output = await Effect.runPromise(
      WriterSession.run({
        sessionID,
        root: tmp.path,
        request: "Explain the complete beat through ch01:p002",
        job: "explain",
        contextStrategy: "maximum",
        contextSpec: { focusRefs: ["ch01:p001"], throughRef: "ch01:p002" },
      }).pipe(Effect.provide(Layer.merge(layer, unusedSessionLayer))),
    )

    expect(output.selection).toBeUndefined()
    expect(output.contextTrace.strategy).toBe("maximum")
    expect(output.contextTrace.selectedRefs).toEqual(["ch01:p001", "ch01:p002"])
    expect(output.task.contextSpec?.focusRefs).toEqual(["ch01:p001"])
    expect(output.result.evidence).toEqual(["ch01:p001", "ch01:p002"])
  })

  test("seals and persists a structured revision response", async () => {
    await using tmp = await writerWorkspace()
    const turn = await WriterSession.prepare({
      root: tmp.path,
      request: "Tighten ch01:p001 without changing the locked-door sentence",
      job: "revise",
      contextSpec: {
        focusRefs: ["ch01:p001"],
        preservationRefs: ["ch01:p002"],
        preservationLiterals: [{ ref: "ch01:p002", text: "Mara waited at the locked door." }],
      },
    })
    const output = await WriterSession.finalize(tmp.path, turn, {
      answer: "Proposed only. Preservation: Mara waited at the locked door.",
      evidence: ["ch01:p001", "ch01:p002"],
      findings: [],
      edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
      data: {
        observations: [],
        inferences: [],
        unresolved: [],
        preservation: ["Mara waited at the locked door."],
      },
    })

    expect(output.result.proposal?.validation.valid).toBe(true)
    expect(output.proposalPath).toBeDefined()
    expect(await Bun.file(output.proposalPath!).exists()).toBe(true)
  })

  test("retries through the OpenCode session service when structured output is omitted", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_run")
    const structured = {
      answer: "The bell is a one-time signal [ch01:p001].",
      evidence: ["ch01:p001"],
      findings: [],
      edits: [],
      data: { observations: [], inferences: [], unresolved: [], preservation: [] },
    }
    const state = { calls: 0 }
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: (input) => {
        expect(input.agent).toBe("writer")
        expect(input.format?.type).toBe("json_schema")
        const retry = state.calls++ > 0
        if (retry) {
          expect(input.parts[0]?.type).toBe("text")
          if (input.parts[0]?.type === "text") {
            expect(input.parts[0].text).toContain("previous response was not captured")
          }
        }
        return Effect.succeed({
          info: {
            id: MessageID.make(`msg_writer_answer_${state.calls}`),
            sessionID,
            role: "assistant",
            time: { created: Date.now(), completed: Date.now() },
            parentID: MessageID.make("msg_writer_question"),
            modelID: ModelV2.ID.make("deepseek-chat"),
            providerID: ProviderV2.ID.make("deepseek"),
            mode: "writer",
            agent: "writer",
            path: { cwd: tmp.path, root: tmp.path },
            cost: 0,
            tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
            structured: retry ? structured : undefined,
            finish: "stop",
          },
          parts: [],
        } satisfies SessionV1.WithParts)
      },
    })

    const output = await Effect.runPromise(
      WriterSession.run({
        sessionID,
        root: tmp.path,
        request: "Explain the bell",
        job: "explain",
        contextSpec: { focusRefs: ["ch01:p001"] },
      }).pipe(Effect.provide(Layer.merge(layer, unusedSessionLayer))),
    )

    expect(output.result.answer).toContain("ch01:p001")
    expect(output.result.proposal).toBeUndefined()
    expect(state.calls).toBe(2)
    expect(output.usage).toEqual({ inputTokens: 2, outputTokens: 2, costUsd: 0 })
  })

  test("repairs a structured response that violates the Writer contract", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_contract_repair")
    const valid = {
      answer: "The bell is a one-time signal [ch01:p001].",
      evidence: ["ch01:p001"],
      findings: [],
      edits: [],
      data: { observations: [], inferences: [], unresolved: [], preservation: [] },
    }
    const responses = [{ ...valid, evidence: ["In ch01:p001 the bell rings once."] }, valid]
    const state = { calls: 0 }
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: (input) => {
        if (state.calls === 1) {
          expect(input.parts[0]?.type).toBe("text")
          if (input.parts[0]?.type === "text") {
            expect(input.parts[0].text).toContain("failed contract validation")
            expect(input.parts[0].text).toContain("unsupported evidence")
          }
        }
        const structured = responses[state.calls++]
        if (!structured) throw new Error("unexpected writer session prompt")
        return Effect.succeed(assistant(sessionID, tmp.path, structured, state.calls))
      },
    })

    const output = await Effect.runPromise(
      WriterSession.run({
        sessionID,
        root: tmp.path,
        request: "Explain the bell",
        job: "explain",
        contextSpec: { focusRefs: ["ch01:p001"] },
      }).pipe(Effect.provide(Layer.merge(layer, unusedSessionLayer))),
    )

    expect(state.calls).toBe(2)
    expect(output.result.evidence).toEqual(["ch01:p001"])
    expect(output.usage).toEqual({ inputTokens: 2, outputTokens: 2, costUsd: 0 })
  })

  test("fails closed after two Writer contract repair attempts", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_contract_reject")
    const state = { calls: 0 }
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: () => {
        state.calls++
        return Effect.succeed(
          assistant(
            sessionID,
            tmp.path,
            {
              answer: "The bell rings once.",
              evidence: ["invented:p999"],
              findings: [],
              edits: [],
              data: { observations: [], inferences: [], unresolved: [], preservation: [] },
            },
            state.calls,
          ),
        )
      },
    })

    await expect(
      Effect.runPromise(
        WriterSession.run({
          sessionID,
          root: tmp.path,
          request: "Explain the bell",
          job: "explain",
          contextSpec: { focusRefs: ["ch01:p001"] },
        }).pipe(Effect.provide(Layer.merge(layer, unusedSessionLayer))),
      ),
    ).rejects.toThrow("unsupported evidence")
    expect(state.calls).toBe(3)
  })

  test("selects context before executing an unscoped writer request", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_select")
    const selectorID = SessionID.make("ses_writer_selector")
    const responses = [
      {
        focusRefs: ["ch01:p002"],
        dependencyRefs: [],
        preservationRefs: [],
        preservationLiterals: [],
        excludeRefs: [],
        throughRef: "ch01:p001",
        rationale: "This boundary accidentally excludes the declared focus.",
      },
      {
        focusRefs: ["ch01:p001"],
        dependencyRefs: [],
        preservationRefs: ["ch01:p002"],
        preservationLiterals: [],
        excludeRefs: [],
        throughRef: "ch01:p001",
        rationale: "This boundary still accidentally excludes a declared preservation passage.",
      },
      {
        focusRefs: ["ch01:p001"],
        dependencyRefs: [],
        preservationRefs: ["ch01:p002"],
        preservationLiterals: [],
        excludeRefs: [],
        throughRef: "ch01:p002",
        rationale: "The signal and immediate reaction answer the question.",
      },
      {
        answer: "The bell signals the locked-door wait [ch01:p001] [ch01:p002].",
        evidence: ["ch01:p001", "ch01:p002"],
        findings: [],
        edits: [],
        data: { observations: [], inferences: [], unresolved: [], preservation: [] },
      },
    ]
    const state = { calls: 0 }
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: (input) => {
        expect(input.agent).toBe("writer")
        expect(input.sessionID).toBe(state.calls < 3 ? selectorID : sessionID)
        if (state.calls === 1 || state.calls === 2) {
          expect(input.parts[0]?.type).toBe("text")
          if (input.parts[0]?.type === "text") {
            expect(input.parts[0].text).toContain("failed contract validation")
            expect(input.parts[0].text).toContain("selected context is missing declared passages")
          }
        }
        const structured = responses[state.calls++]
        if (!structured) throw new Error("unexpected writer session prompt")
        return Effect.succeed(assistant(input.sessionID, tmp.path, structured, state.calls))
      },
    })
    const sessionLayer = Layer.mock(Session.Service, {
      get: (id) => {
        if (id === selectorID) {
          return Effect.succeed({
            id: selectorID,
            slug: "writer-context-selection",
            projectID: ProjectV2.ID.make("project"),
            directory: tmp.path,
            parentID: sessionID,
            title: "Writer context selection",
            agent: "writer",
            version: "test",
            cost: 2,
            tokens: { input: 3, output: 4, reasoning: 5, cache: { read: 6, write: 7 } },
            time: { created: Date.now(), updated: Date.now() },
          })
        }
        expect(id).toBe(sessionID)
        return Effect.succeed({
          id: sessionID,
          slug: "writer-session",
          projectID: ProjectV2.ID.make("project"),
          directory: tmp.path,
          title: "Writer session",
          agent: "writer",
          model: {
            id: ModelV2.ID.make("deepseek-chat"),
            providerID: ProviderV2.ID.make("deepseek"),
            variant: "default",
          },
          version: "test",
          time: { created: Date.now(), updated: Date.now() },
        })
      },
      create: (input) => {
        expect(input?.parentID).toBe(sessionID)
        expect(input?.agent).toBe("writer")
        expect(input?.model?.id).toBe(ModelV2.ID.make("deepseek-chat"))
        return Effect.succeed({
          id: selectorID,
          slug: "writer-context-selection",
          projectID: ProjectV2.ID.make("project"),
          directory: tmp.path,
          parentID: sessionID,
          title: "Writer context selection",
          agent: "writer",
          version: "test",
          metadata: { "novel.writer.phase": "context-selection" },
          time: { created: Date.now(), updated: Date.now() },
        })
      },
    })

    const output = await Effect.runPromise(
      WriterSession.run({
        sessionID,
        root: tmp.path,
        request: "Explain what the bell means for Mara",
        autoContext: true,
        contextSpec: { focusRefs: ["ch01:p001"], preservationRefs: ["ch01:p002"] },
      }).pipe(Effect.provide(Layer.merge(layer, sessionLayer))),
    )

    expect(state.calls).toBe(4)
    expect(output.selection?.sessionID).toBe(selectorID)
    expect(output.selection?.contextSpec.rationale).toContain("signal")
    expect(output.selection?.usage).toEqual({ inputTokens: 16, outputTokens: 9, costUsd: 2 })
    expect(output.usage).toEqual({ inputTokens: 17, outputTokens: 10, costUsd: 2 })
    expect(output.task.contextSpec).not.toHaveProperty("rationale")
    expect(output.contextTrace.selectedRefs).toEqual(["ch01:p001", "ch01:p002"])
    expect(output.result.evidence).toEqual(["ch01:p001", "ch01:p002"])
  })
})

function assistant(sessionID: SessionID, root: string, structured: unknown, index: number) {
  return {
    info: {
      id: MessageID.make(`msg_writer_answer_${index}`),
      sessionID,
      role: "assistant" as const,
      time: { created: Date.now(), completed: Date.now() },
      parentID: MessageID.make(`msg_writer_question_${index}`),
      modelID: ModelV2.ID.make("deepseek-chat"),
      providerID: ProviderV2.ID.make("deepseek"),
      mode: "writer",
      agent: "writer",
      path: { cwd: root, root },
      cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      structured,
      finish: "stop",
    },
    parts: [],
  } satisfies SessionV1.WithParts
}

async function writerWorkspace() {
  return tmpdir({
    init: async (root) => {
      await Bun.write(
        path.join(root, "novel.json"),
        JSON.stringify({ formatVersion: 1, title: "Bell House", chapters: [{ id: "ch01", path: "ch01.md" }] }),
      )
      await Bun.write(
        path.join(root, "ch01.md"),
        [
          "# Chapter One",
          "",
          "<!-- novel-agent:passage ch01:p001 -->",
          "The bell rang once.",
          "",
          "<!-- novel-agent:passage ch01:p002 -->",
          "Mara waited at the locked door.",
          "",
        ].join("\n"),
      )
    },
  })
}
