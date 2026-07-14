import { afterEach, describe, expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { NovelContextTool, NovelListTool, NovelProposalTool, NovelReadTool } from "@/tool/novel"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { createWriterTask, parseWriterResult, saveEditProposal } from "@novel-agent-harness/writer"
import { disposeAllInstances, provideInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Agent.node, Truncate.node])))
const context = {
  sessionID: SessionID.make("ses_novel"),
  messageID: MessageID.make("msg_novel"),
  agent: "writer",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
} satisfies Tool.Context

afterEach(async () => {
  await disposeAllInstances()
})

describe("novel tools", () => {
  it.instance("lists structure and reads exact passages", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* writeWorkspace(test.directory)
      const listInfo = yield* NovelListTool
      const list = yield* listInfo.init()
      const listed = yield* provideInstance(test.directory)(list.execute({}, context))
      expect(JSON.parse(listed.output).chapters[0].passages).toEqual(["ch01:p001", "ch01:p002", "ch01:p003"])

      const readInfo = yield* NovelReadTool
      const read = yield* readInfo.init()
      const result = yield* provideInstance(test.directory)(
        read.execute({ refs: ["ch01:p001", "ch01:p003"], throughRef: "ch01:p002" }, context),
      )
      const output = JSON.parse(result.output)
      expect(output.trace.selectedRefs).toEqual(["ch01:p001"])
      expect(result.metadata.excludedRefs).toEqual(["ch01:p003"])
      expect(output.passages[0].text).toBe("The bell rang once.")
    }),
  )

  it.instance("compiles a temporally bounded context packet", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* writeWorkspace(test.directory)
      const info = yield* NovelContextTool
      const tool = yield* info.init()
      const result = yield* provideInstance(test.directory)(
        tool.execute(
          {
            focusRefs: ["ch01:p002"],
            dependencyRefs: ["ch01:p001", "ch01:p003"],
            preservationRefs: [],
            preservationLiterals: [],
            excludeRefs: [],
            throughRef: "ch01:p002",
          },
          context,
        ),
      )
      const output = JSON.parse(result.output)
      expect(output.trace.selectedRefs).toEqual(["ch01:p001", "ch01:p002"])
      expect(output.trace.excludedRefs).toContain("ch01:p003")
    }),
  )

  it.instance("renders proposals without exposing commit authority", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* writeWorkspace(test.directory)
      const task = createWriterTask({
        request: "Tighten the bell",
        job: "revise",
        context: [{ ref: "ch01:p001", text: "The bell rang once.", kind: "manuscript" }],
        contextSpec: { focusRefs: ["ch01:p001"] },
      })
      const result = parseWriterResult(task, {
        answer: "Proposed revision [ch01:p001].",
        evidence: ["ch01:p001"],
        findings: [],
        edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
        data: { observations: [], inferences: [], unresolved: [], preservation: [] },
      })
      const proposal = result.proposal
      if (!proposal) throw new Error("proposal was not sealed")
      yield* Effect.promise(() => saveEditProposal(test.directory, proposal))

      const info = yield* NovelProposalTool
      const tool = yield* info.init()
      const review = yield* provideInstance(test.directory)(tool.execute({ proposalId: proposal.id }, context))
      expect(review.output).toContain("diff --novel")
      expect(review.output).not.toMatch(/approve|commit/i)
    }),
  )
})

function writeWorkspace(root: string) {
  return Effect.promise(async () => {
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
        "<!-- novel-agent:passage ch01:p003 -->",
        "At dawn, Mara opened it.",
        "",
      ].join("\n"),
    )
  })
}
