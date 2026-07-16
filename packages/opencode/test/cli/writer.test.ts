import { describe, expect, test } from "bun:test"
import { chapterMappingsFromTrackedPaths, contextSpecFromArgs, parseChapterArgs, writerProgressLine } from "@/cli/cmd/writer"
import { parseWriterChatInput } from "@/cli/cmd/writer-chat"

describe("writer CLI", () => {
  test("leaves context selection to the Writer session when no explicit packet is supplied", () => {
    expect(contextSpecFromArgs({})).toBeUndefined()
  })

  test("renders machine-readable progress without contaminating headless JSON stdout", () => {
    const line = writerProgressLine(
      "ses_writer",
      {
        phase: "context-selection",
        status: "completed",
        selectionSessionID: "ses_selector" as never,
        contextItems: 5,
        contextWords: 624,
        usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.01 },
      },
      123.5,
    )
    expect(line.startsWith("writer-progress ")).toBe(true)
    expect(JSON.parse(line.slice("writer-progress ".length))).toMatchObject({
      protocolVersion: 1,
      sessionID: "ses_writer",
      emittedAtMs: 123.5,
      selectionSessionID: "ses_selector",
      phase: "context-selection",
      status: "completed",
      contextItems: 5,
    })
  })

  test("compiles explicit passage and preservation options", () => {
    expect(
      contextSpecFromArgs({
        focus: ["ch01:p002"],
        dependency: ["ch01:p001"],
        preserve: ["ch01:p003"],
        preserveLiteral: ["ch01:p003=The door remained locked."],
        exclude: ["ch02:p001"],
        through: "ch01:p003",
      }),
    ).toEqual({
      focusRefs: ["ch01:p002"],
      dependencyRefs: ["ch01:p001"],
      preservationRefs: ["ch01:p003"],
      preservationLiterals: [{ ref: "ch01:p003", text: "The door remained locked." }],
      excludeRefs: ["ch02:p001"],
      throughRef: "ch01:p003",
    })
  })

  test("rejects partial context and unbound literal receipts", () => {
    expect(() => contextSpecFromArgs({ dependency: ["ch01:p001"] })).toThrow(/--focus is required/)
    expect(() => contextSpecFromArgs({ focus: ["ch01:p001"], preserveLiteral: ["ch01:p002=Keep me"] })).toThrow(
      /requires --preserve ch01:p002/,
    )
    expect(() => contextSpecFromArgs({ focus: ["ch01:p001"], preserveLiteral: ["invalid"] })).toThrow(
      /passage-ref=literal/,
    )
  })

  test("parses stable chapter mappings and rejects ambiguous inputs", () => {
    expect(parseChapterArgs(["ch01=manuscript/one.md", "ch02=manuscript/two.md"])).toEqual([
      { id: "ch01", path: "manuscript/one.md" },
      { id: "ch02", path: "manuscript/two.md" },
    ])
    expect(() => parseChapterArgs(["invalid"])).toThrow(/stable-id=relative\/path.md/)
    expect(() => parseChapterArgs(["ch01=one.md", "ch01=two.md"])).toThrow(/duplicate stable IDs/)
    expect(() => parseChapterArgs(["ch01=one.md", "ch02=one.md"])).toThrow(/duplicate paths/)
  })

  test("conservatively discovers tracked manuscript chapters in natural order", () => {
    expect(
      chapterMappingsFromTrackedPaths([
        "README.md",
        "notes/ideas.md",
        "chapter-one.md",
        "manuscript/chapter-10.md",
        "manuscript/chapter-2.md",
        "draft/prologue.md",
        ".private/chapter-1.md",
      ]),
    ).toEqual([
      { id: "ch01", path: "chapter-one.md" },
      { id: "ch02", path: "draft/prologue.md" },
      { id: "ch03", path: "manuscript/chapter-2.md" },
      { id: "ch04", path: "manuscript/chapter-10.md" },
    ])
  })

  test("parses Writer chat prompts and slash commands without treating prose as control input", () => {
    expect(parseWriterChatInput("  Diagnose the opening. ")).toEqual({
      type: "prompt",
      text: "Diagnose the opening.",
    })
    expect(parseWriterChatInput("/review sha256:abc")).toEqual({
      type: "command",
      name: "review",
      argument: "sha256:abc",
    })
    expect(parseWriterChatInput("   ")).toEqual({ type: "empty" })
  })
})
