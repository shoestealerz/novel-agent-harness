import { describe, expect, test } from "bun:test"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect, Layer } from "effect"
import { MessageID, SessionID } from "@/session/schema"
import { SessionPrompt } from "@/session/prompt"
import { WriterSession } from "@/writer/session"
import { tmpdir } from "../fixture/fixture"

describe("WriterSession", () => {
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

  test("runs through the OpenCode session service", async () => {
    await using tmp = await writerWorkspace()
    const sessionID = SessionID.make("ses_writer_run")
    const structured = {
      answer: "The bell is a one-time signal [ch01:p001].",
      evidence: ["ch01:p001"],
      findings: [],
      edits: [],
      data: { observations: [], inferences: [], unresolved: [], preservation: [] },
    }
    const layer = Layer.mock(SessionPrompt.Service, {
      prompt: (input) => {
        expect(input.agent).toBe("writer")
        expect(input.format?.type).toBe("json_schema")
        return Effect.succeed({
          info: {
            id: MessageID.make("msg_writer_answer"),
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
            structured,
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
      }).pipe(Effect.provide(layer)),
    )

    expect(output.result.answer).toContain("ch01:p001")
    expect(output.result.proposal).toBeUndefined()
  })
})

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
