import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { rm } from "node:fs/promises"
import path from "node:path"
import {
  loadStoryState,
  loadWriterWorkspace,
  saveStoryStateProposal,
  sealStoryStateProposal,
} from "@novel-agent-harness/writer"
import { reply } from "../lib/llm-server"
import { cliIt, testModelID } from "../lib/cli-process"

describe("writer CLI subprocess", () => {
  cliIt.concurrent(
    "opens an interactive Writer conversation and resumes its durable session",
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
            rationale: "The bell passage answers the request.",
          }),
          reply().tool("StructuredOutput", {
            answer: "The bell rings once [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )

        const first = yield* opencode.spawn(
          ["writer", "chat", "Explain the bell", "--model", testModelID, "--dir", home],
          { stdin: "/models test\n/login claude\n/session\n/exit\n", timeoutMs: 60_000 },
        )
        opencode.expectExit(first, 0, "writer chat")
        expect(first.stdout).toContain("Novel Agent Harness — Bell House")
        expect(first.stdout).toContain("The bell rings once [ch01:p001].")
        expect(first.stdout).toContain("Available test models:")
        expect(first.stdout).toContain("test/test-model")
        expect(first.stdout).toContain("Use /login chatgpt or /login chatgpt --device-code.")
        const sessionID = first.stdout.match(/Session:\s+(ses_[A-Za-z0-9]+)/)?.[1]
        expect(sessionID).toBeTruthy()

        yield* llm.push(
          reply().tool("StructuredOutput", {
            focusRefs: ["ch01:p001"],
            dependencyRefs: [],
            preservationRefs: [],
            preservationLiterals: [],
            excludeRefs: [],
            throughRef: "ch01:p001",
            rationale: "The same passage confirms the count.",
          }),
          reply().tool("StructuredOutput", {
            answer: "The count remains one [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )
        const resumed = yield* opencode.spawn(
          ["writer", "chat", "Confirm the count", "--session", sessionID!, "--dir", home],
          { stdin: "/exit\n", timeoutMs: 60_000 },
        )
        opencode.expectExit(resumed, 0, "writer chat resume")
        expect(resumed.stdout).toContain(`Session:   ${sessionID}`)
        expect(resumed.stdout).toContain("Model:     test/test-model")
        expect(resumed.stdout).toContain("The count remains one [ch01:p001].")

        const continued = yield* opencode.spawn(["writer", "chat", "--continue", "--dir", home], {
          stdin: "/exit\n",
          timeoutMs: 60_000,
        })
        opencode.expectExit(continued, 0, "writer chat continue")
        expect(continued.stdout).toContain(`Session:   ${sessionID}`)
      }),
    120_000,
  )

  cliIt.concurrent(
    "keeps interactive revisions proposal-only until the author types APPLY",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        const root = path.join(home, "interactive-approval")
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
            focusRefs: ["ch01:p001"],
            dependencyRefs: [],
            preservationRefs: [],
            preservationLiterals: [],
            excludeRefs: [],
            throughRef: "ch01:p001",
            rationale: "The sentence is the revision target.",
          }),
          reply().tool("StructuredOutput", {
            answer: "I prepared a tighter sentence [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [{ target: "ch01:p001", replacement: "Once, the bell rang." }],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )

        const result = yield* opencode.spawn(
          [
            "writer",
            "chat",
            "Tighten the bell sentence",
            "--model",
            testModelID,
            "--job",
            "revise",
            "--author",
            "Test Author",
            "--dir",
            root,
          ],
          { stdin: "/approve\nNO\n/approve\nAPPLY\n/exit\n", timeoutMs: 60_000 },
        )
        opencode.expectExit(result, 0, "writer chat approve")
        expect(result.stdout).toContain("Not applied.")
        expect(result.stdout).toContain("Committed ")
        expect(yield* Effect.promise(() => Bun.file(path.join(root, "ch01.md")).text())).toContain(
          "Once, the bell rang.",
        )
        expect(git(root, "log", "-1", "--pretty=%s").stdout.toString()).toContain("Apply approved novel revision")
      }),
    90_000,
  )

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
        expect(result.stderr).toContain('writer-progress {"protocolVersion":1')
        expect(result.stderr).toContain('"phase":"session","status":"ready"')
        expect(result.stderr).toContain('"phase":"context-selection","status":"started"')
        expect(result.stderr).toContain('"phase":"execution","status":"completed"')
        const output = JSON.parse(result.stdout)
        expect(output.protocolVersion).toBe(1)
        expect(output.job).toBe("explain")
        expect(output.authority).toBe("read")
        expect(output.selection.contextSpec.focusRefs).toEqual(["ch01:p001"])
        expect(output.contextTrace.selectedRefs).toEqual(["ch01:p001"])
        expect(output.result.answer).toContain("ch01:p001")
        expect(output.result.proposal).toBeUndefined()

        yield* llm.push(
          reply().tool("StructuredOutput", {
            answer: "It is still a single ring [ch01:p001].",
            evidence: ["ch01:p001"],
            findings: [],
            edits: [],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )
        const resumed = yield* opencode.spawn([
          "writer",
          "run",
          "Confirm the count",
          "--session",
          output.sessionID,
          "--dir",
          home,
          "--job",
          "explain",
          "--focus",
          "ch01:p001",
        ])
        opencode.expectExit(resumed, 0, "writer resume")
        expect(JSON.parse(resumed.stdout).sessionID).toBe(output.sessionID)
        const inputs = yield* llm.inputs
        expect(JSON.stringify(inputs.at(-1))).toContain("The bell rings once")

        const other = path.join(home, "other-novel")
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(other, "novel.json"),
            JSON.stringify({
              formatVersion: 1,
              title: "Other Novel",
              chapters: [{ id: "ch01", path: "ch01.md" }],
            }),
          )
          await Bun.write(path.join(other, "ch01.md"), "<!-- novel-agent:passage ch01:p001 -->\nAnother bell.\n")
        })
        const crossWorkspace = yield* opencode.spawn([
          "writer",
          "run",
          "Cross the boundary",
          "--session",
          output.sessionID,
          "--dir",
          other,
          "--job",
          "explain",
          "--focus",
          "ch01:p001",
        ])
        opencode.expectExit(crossWorkspace, 1, "writer cross-workspace resume")
        expect(crossWorkspace.stderr).toContain("different novel workspace")
      }),
    60_000,
  )

  cliIt.concurrent(
    "fails closed when the configured model is unavailable",
    ({ home, opencode }) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(home, "novel.json"),
            JSON.stringify({
              formatVersion: 1,
              title: "Provider Failure",
              chapters: [{ id: "ch01", path: "ch01.md" }],
            }),
          )
          await Bun.write(path.join(home, "ch01.md"), "<!-- novel-agent:passage ch01:p001 -->\nNo answer yet.\n")
        })
        const result = yield* opencode.spawn([
          "writer",
          "run",
          "Explain the passage",
          "--model",
          "missing-provider/missing-model",
          "--dir",
          home,
          "--job",
          "explain",
          "--focus",
          "ch01:p001",
        ])
        opencode.expectExit(result, 1, "writer model failure")
        expect(result.stdout.trim()).toBe("")
        expect(result.stderr).toMatch(/model.*not found|missing-provider/i)
        expect(yield* Effect.promise(() => Bun.file(path.join(home, ".novel-agent", "proposals")).exists())).toBe(false)
      }),
    60_000,
  )

  cliIt.concurrent(
    "runs complete bounded context without invoking the selector",
    ({ home, llm, opencode }) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(home, "novel.json"),
            JSON.stringify({
              formatVersion: 1,
              title: "Bounded Bell House",
              chapters: [{ id: "ch01", path: "ch01.md" }],
            }),
          )
          await Bun.write(
            path.join(home, "ch01.md"),
            [
              "<!-- novel-agent:passage ch01:p001 -->",
              "The bell rang once.",
              "",
              "<!-- novel-agent:passage ch01:p002 -->",
              "Mara waited at the locked door.",
            ].join("\n"),
          )
        })
        yield* llm.push(
          reply().tool("StructuredOutput", {
            answer: "The ring leads directly to Mara's wait [ch01:p001] [ch01:p002].",
            evidence: ["ch01:p001", "ch01:p002"],
            findings: [],
            edits: [],
            data: { observations: [], inferences: [], unresolved: [], preservation: [] },
          }),
        )

        const result = yield* opencode.spawn([
          "writer",
          "run",
          "Explain the complete beat",
          "--model",
          testModelID,
          "--dir",
          home,
          "--job",
          "explain",
          "--maximum-context",
          "--focus",
          "ch01:p001",
          "--through",
          "ch01:p002",
        ])
        opencode.expectExit(result, 0, "writer maximum context")
        expect(result.stderr).not.toContain('"phase":"context-selection"')
        const output = JSON.parse(result.stdout)
        expect(output.selection).toBeUndefined()
        expect(output.contextTrace.strategy).toBe("maximum")
        expect(output.contextTrace.selectedRefs).toEqual(["ch01:p001", "ch01:p002"])

        const conflict = yield* opencode.spawn([
          "writer",
          "run",
          "Explain the beat",
          "--dir",
          home,
          "--auto-context",
          "--maximum-context",
          "--focus",
          "ch01:p001",
        ])
        opencode.expectExit(conflict, 1, "writer context policy conflict")
        expect(conflict.stderr).toContain("cannot be used together")
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

  cliIt.concurrent(
    "bootstraps a tracked manuscript and commits author-confirmed story state",
    ({ home, opencode }) =>
      Effect.gen(function* () {
        const root = path.join(home, "bootstrap-novel")
        yield* Effect.promise(async () => {
          await Bun.write(path.join(root, "chapter-one.md"), "# Chapter One\n\nMara entered alone.\n")
          git(root, "init", "--quiet", "--initial-branch=dev")
          git(root, "config", "user.name", "Writer Test")
          git(root, "config", "user.email", "writer@example.test")
          git(root, "add", "chapter-one.md")
          git(root, "commit", "--quiet", "-m", "Import manuscript")
        })

        yield* Effect.promise(() => Bun.write(path.join(root, "untracked-notes.txt"), "Do not absorb me.\n"))
        const refused = yield* opencode.spawn([
          "writer",
          "init",
          "--dir",
          root,
          "--title",
          "Bootstrap Novel",
          "--chapter",
          "ch01=chapter-one.md",
          "--yes",
        ])
        opencode.expectExit(refused, 1, "writer init with unrelated work")
        expect(refused.stderr).toContain("must be clean")
        expect(yield* Effect.promise(() => Bun.file(path.join(root, "novel.json")).exists())).toBe(false)
        yield* Effect.promise(() => rm(path.join(root, "untracked-notes.txt")))

        const initialized = yield* opencode.spawn(["writer", "init", "--dir", root, "--yes"])
        opencode.expectExit(initialized, 0, "writer init")
        expect(JSON.parse(initialized.stdout)).toMatchObject({ title: "Bootstrap Novel", passages: 1 })
        const marked = yield* Effect.promise(() => Bun.file(path.join(root, "chapter-one.md")).text())
        expect(marked).toContain("novel-agent:passage ch01:p0001")
        git(root, "add", "novel.json", "chapter-one.md")
        git(root, "commit", "--quiet", "-m", "Initialize Novel Agent workspace")

        const proposal = yield* Effect.promise(async () => {
          const workspace = await loadWriterWorkspace(root)
          const state = await loadStoryState(root)
          const proposal = sealStoryStateProposal(
            workspace,
            state.state,
            { request: "Record Mara", authority: "propose" },
            {
              text: "Proposal only.",
              upserts: [
                {
                  kind: "entity",
                  id: "entity:mara",
                  entityType: "character",
                  name: "Mara",
                  aliases: [],
                  evidence: ["ch01:p0001"],
                },
              ],
            },
          )
          await saveStoryStateProposal(root, proposal)
          return proposal
        })
        const stateReview = yield* opencode.spawn(["writer", "review", proposal.id, "--kind", "state", "--dir", root])
        opencode.expectExit(stateReview, 0, "writer state review")
        expect(stateReview.stdout).toContain("@@ entity:mara @@")

        const committed = yield* opencode.spawn([
          "writer",
          "commit",
          proposal.id,
          "--kind",
          "state",
          "--dir",
          root,
          "--confirmed-by",
          "Test Author",
          "--yes",
        ])
        opencode.expectExit(committed, 0, "writer state commit")
        const result = JSON.parse(committed.stdout)
        expect(result.receipt.kind).toBe("story-state")
        const committedState = yield* Effect.promise(() => loadStoryState(root))
        expect(committedState.state.records[0]?.id).toBe("entity:mara")
        expect(git(root, "status", "--porcelain").stdout.toString()).toBe("")
      }),
    60_000,
  )
})

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stderr: "pipe", stdout: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result
}
