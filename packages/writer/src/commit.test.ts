import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import test from "node:test"
import { commitEditProposal, loadCommitReceipt, verifyCommitReceipt, type AuthorConfirmation } from "./commit.ts"
import { sealEditProposal } from "./proposal.ts"
import { saveEditProposal } from "./review.ts"
import { digest, loadWriterWorkspace } from "./workspace.ts"

const execute = promisify(execFile)

test("commits an exact author-confirmed proposal with its immutable receipt", async () => {
  const item = await fixture()
  const result = await commitEditProposal(item.root, item.proposal.id, item.confirmation)
  const source = await readFile(item.chapter, "utf8")
  const files = paths(await git(item.root, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", result.commit))

  assert.match(source, /Under the table, she found the glass pear\./)
  assert.match(source, /Mara tied the blue ribbon around her wrist\./)
  assert.equal(source.match(/novel-agent:passage/g)?.length, 2)
  assert.equal(result.commit, await git(item.root, "rev-parse", "HEAD"))
  assert.deepEqual(await loadCommitReceipt(item.root, result.receipt.id), result.receipt)
  assert.deepEqual(files.sort(), [
    `.novel-agent/proposals/${item.proposal.id.slice("sha256:".length)}.json`,
    `.novel-agent/receipts/${result.receipt.id.slice("sha256:".length)}.json`,
    "manuscript/ch01.md",
  ])
  assert.equal(await git(item.root, "status", "--porcelain"), "")
  assert.match(await git(item.root, "show", "-s", "--format=%B", result.commit), /Proposal-ID: sha256:/)
  assert.equal(result.receipt.changes.length, 2)
  assert.throws(() => verifyCommitReceipt({ ...result.receipt, baseCommit: "0".repeat(40) }), /content address/)
  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, item.confirmation),
    /proposal was already committed with receipt/,
  )
})

test("verifies staged Git blobs when Git normalizes manuscript line endings", async () => {
  const item = await fixture("\r\n")
  const result = await commitEditProposal(item.root, item.proposal.id, item.confirmation)

  assert.equal(result.commit, await git(item.root, "rev-parse", "HEAD"))
  assert.equal(await git(item.root, "status", "--porcelain"), "")
  assert.match(await readFile(item.chapter, "utf8"), /Under the table, she found the glass pear\./)
})

test("does not let repository hooks expand or block the approved commit scope", async () => {
  const item = await fixture()
  const hook = join(item.root, ".git", "hooks", "pre-commit")
  await writeFile(hook, "#!/bin/sh\necho hook-ran > hook-ran.txt\nexit 1\n")
  await chmod(hook, 0o755)

  const result = await commitEditProposal(item.root, item.proposal.id, item.confirmation)

  assert.equal(result.commit, await git(item.root, "rev-parse", "HEAD"))
  await assert.rejects(readFile(join(item.root, "hook-ran.txt"), "utf8"), /ENOENT/)
})

test("rejects confirmation for a different proposal without touching the manuscript", async () => {
  const item = await fixture()
  const before = await readFile(item.chapter, "utf8")
  const base = await git(item.root, "rev-parse", "HEAD")
  const wrong = digest("wrong proposal")

  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, { ...item.confirmation, proposalId: wrong }),
    /bound to a different proposal/,
  )
  assert.equal(await readFile(item.chapter, "utf8"), before)
  assert.equal(await git(item.root, "rev-parse", "HEAD"), base)
})

test("rechecks source hashes immediately before applying a proposal", async () => {
  const item = await fixture()
  const base = await git(item.root, "rev-parse", "HEAD")
  await writeFile(
    item.chapter,
    `# One\n\n<!-- novel-agent:passage ch01:p001 -->\nShe had already moved the glass pear.\n\n<!-- novel-agent:passage ch01:p002 -->\nMara kept the blue ribbon.\n`,
  )

  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, item.confirmation),
    /stale proposal precondition for ch01:p001/,
  )
  assert.equal(await git(item.root, "rev-parse", "HEAD"), base)
})

test("rolls back a proposal whose replacement violates a preserved literal", async () => {
  const item = await fixture("\n", false)
  const before = await readFile(item.chapter, "utf8")
  assert.equal(item.proposal.validation.valid, true)

  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, item.confirmation),
    /proposal failed a preservation requirement for ch01:p002/,
  )
  assert.equal(await readFile(item.chapter, "utf8"), before)
})

test("refuses unrelated staged or untracked work", async () => {
  const item = await fixture()
  const before = await readFile(item.chapter, "utf8")
  await writeFile(join(item.root, "notes.md"), "Unrelated author notes.\n")

  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, item.confirmation),
    /must be clean except for the saved proposal/,
  )
  assert.equal(await readFile(item.chapter, "utf8"), before)
})

test("restores manuscript and index state when Git cannot create the commit", async () => {
  const item = await fixture()
  const before = await readFile(item.chapter, "utf8")
  const base = await git(item.root, "rev-parse", "HEAD")
  const proposalStatus = await git(item.root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
  await git(item.root, "config", "user.useConfigOnly", "true")
  await git(item.root, "config", "user.name", "")
  await git(item.root, "config", "user.email", "")

  await assert.rejects(
    commitEditProposal(item.root, item.proposal.id, item.confirmation),
    /proposal commit failed and manuscript changes were restored/,
  )
  assert.equal(await readFile(item.chapter, "utf8"), before)
  assert.equal(await git(item.root, "rev-parse", "HEAD"), base)
  assert.equal(await git(item.root, "status", "--porcelain=v1", "-z", "--untracked-files=all"), proposalStatus)
  assert.equal(await git(item.root, "diff", "--cached", "--name-only"), "")

  await git(item.root, "config", "user.name", "Writer Harness Test")
  await git(item.root, "config", "user.email", "writer@example.test")
  const result = await commitEditProposal(item.root, item.proposal.id, item.confirmation)
  assert.equal(result.commit, await git(item.root, "rev-parse", "HEAD"))
})

async function fixture(lineEnding = "\n", preservesLiteral = true) {
  const root = await mkdtemp(join(tmpdir(), "writer-commit-"))
  const chapter = join(root, "manuscript", "ch01.md")
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    `${JSON.stringify({
      formatVersion: 1,
      title: "Commit Fixture",
      chapters: [{ id: "ch01", path: "manuscript/ch01.md" }],
    })}\n`,
  )
  await writeFile(
    chapter,
    [
      "# One",
      "",
      "<!-- novel-agent:passage ch01:p001 -->",
      "She found the glass pear.",
      "",
      "<!-- novel-agent:passage ch01:p002 -->",
      "Mara kept the blue ribbon.",
      "",
    ].join(lineEnding),
  )
  await git(root, "init", "--quiet", "--initial-branch=dev")
  await git(root, "config", "user.name", "Writer Harness Test")
  await git(root, "config", "user.email", "writer@example.test")
  if (lineEnding === "\r\n") await git(root, "config", "core.autocrlf", "true")
  await git(root, "add", "novel.json", "manuscript/ch01.md")
  await git(root, "commit", "--quiet", "-m", "Initial novel")

  const workspace = await loadWriterWorkspace(root)
  const proposal = sealEditProposal(
    {
      job: "revise",
      prompt: "Tighten the discovery and clarify what Mara does with the ribbon.",
      authority: "propose",
      context: [...workspace.passages.values()].map((item) => ({
        ref: item.ref,
        text: item.text,
        kind: "manuscript" as const,
      })),
      contextSpec: {
        focusRefs: ["ch01:p001", "ch01:p002"],
        preservationRefs: ["ch01:p002"],
        preservationLiterals: [{ ref: "ch01:p002", text: "blue ribbon" }],
      },
    },
    {
      text: "Proposal only. Preserve the blue ribbon.",
      artifacts: {
        edits: [
          { target: "ch01:p001", replacement: "Under the table, she found the glass pear." },
          {
            target: "ch01:p002",
            replacement: preservesLiteral
              ? "Mara tied the blue ribbon around her wrist."
              : "Mara tied it around her wrist.",
          },
        ],
        data: { preservation: ["blue ribbon"] },
      },
    },
  )
  await saveEditProposal(root, proposal)
  const confirmation: AuthorConfirmation = {
    confirmationVersion: 1,
    proposalId: proposal.id,
    decision: "approve",
    confirmedBy: "author:test",
    confirmedAt: "2026-07-14T20:00:00.000Z",
  }
  return { root, chapter, proposal, confirmation }
}

function git(root: string, ...args: string[]) {
  return execute("git", args, { cwd: root, encoding: "utf8" }).then((result) => result.stdout.trimEnd())
}

function paths(value: string) {
  return value.split("\0").filter(Boolean)
}
