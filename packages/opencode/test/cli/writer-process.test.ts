import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { reply } from "../lib/llm-server"
import { cliIt, testModelID } from "../lib/cli-process"

describe("writer CLI subprocess", () => {
  cliIt.concurrent(
    "runs the production Writer contract and emits one headless JSON result",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(home, "novel.json"),
            JSON.stringify({
              formatVersion: 1,
              title: "Bell House",
              chapters: [{ id: "ch01", path: "ch01.md" }],
            }),
          )
          await Bun.write(path.join(home, "ch01.md"), "<!-- novel-agent:passage ch01:p001 -->\nThe bell rang once.\n")
        })
        yield* llm.push(
          reply().tool("StructuredOutput", {
            focusRefs: ["ch01:p001"],
            dependencyRefs: [],
            preservationRefs: [],
            preservationLiterals: [],
            excludeRefs: [],
            throughRef: "ch01:p001",
            rationale: "The only passage contains the bell event.",
          }),
          reply().tool("StructuredOutput", {
            answer: "The bell rings once [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )

        const result = yield* opencode.spawn([
          "writer",
          "run",
          "Explain the bell",
          "--model",
          testModelID,
          "--dir",
          home,
          "--job",
          "explain",
        ])

        opencode.expectExit(result, 0)
        const output = JSON.parse(result.stdout)
        expect(output.protocolVersion).toBe(1)
        expect(output.job).toBe("explain")
        expect(output.authority).toBe("read")
        expect(output.selection.contextSpec.focusRefs).toEqual(["ch01:p001"])
        expect(output.contextTrace.selectedRefs).toEqual(["ch01:p001"])
        expect(output.result.answer).toContain("ch01:p001")
        expect(output.result.proposal).toBeUndefined()
      }),
    60_000,
  )

  cliIt.concurrent(
    "runs revise, review, and explicit author-confirmed commit end to end",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const root = path.join(home, "novel")
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(root, "novel.json"),
            JSON.stringify({
              formatVersion: 1,
              title: "Bell House",
              chapters: [{ id: "ch01", path: "ch01.md" }],
            }),
          )
          await Bun.write(path.join(root, "ch01.md"), "<!-- novel-agent:passage ch01:p001 -->\nThe bell rang once.\n")
          git(root, "init", "--quiet", "--initial-branch=dev")
          git(root, "config", "user.name", "Writer Test")
          git(root, "config", "user.email", "writer@example.test")
          git(root, "add", "novel.json", "ch01.md")
          git(root, "commit", "--quiet", "-m", "Initial novel")
        })
        yield* llm.push(
          reply().tool("StructuredOutput", {
            answer: "Proposed a tighter sentence [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )

        const revision = yield* opencode.spawn([
          "writer",
          "run",
          "Tighten the bell sentence",
          "--model",
          testModelID,
          "--dir",
          root,
          "--job",
          "revise",
          "--focus",
          "ch01:p001",
        ])
        opencode.expectExit(revision, 0, "writer revise")
        const proposed = JSON.parse(revision.stdout)
        const proposalId = proposed.result.proposal.id as string
        expect(proposalId).toMatch(/^sha256:[a-f0-9]{64}$/)

        const review = yield* opencode.spawn(["writer", "review", proposalId, "--dir", root])
        opencode.expectExit(review, 0, "writer review")
        expect(review.stdout).toContain("-The bell rang once.")
        expect(review.stdout).toContain("+Once, the bell rang.")

        const committed = yield* opencode.spawn([
          "writer",
          "commit",
          proposalId,
          "--dir",
          root,
          "--confirmed-by",
          "Test Author",
          "--yes",
        ])
        opencode.expectExit(committed, 0, "writer commit")
        const result = JSON.parse(committed.stdout)
        expect(result.receipt.proposalId).toBe(proposalId)
        expect(result.receipt.confirmation.confirmedBy).toBe("Test Author")
        const chapter = yield* Effect.promise(() => Bun.file(path.join(root, "ch01.md")).text())
        expect(chapter).toContain("Once, the bell rang.")
        expect(git(root, "log", "-1", "--pretty=%s").stdout.toString()).toContain("Apply approved novel revision")
      }),
    60_000,
  )
})

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stderr: "pipe", stdout: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result
}
