import { describe, expect, test } from "bun:test"
import { contextSpecFromArgs } from "@/cli/cmd/writer"

describe("writer CLI", () => {
  test("leaves context selection to the Writer session when no explicit packet is supplied", () => {
    expect(contextSpecFromArgs({})).toBeUndefined()
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
})
