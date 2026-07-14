import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import test from "node:test"
import type { AuthorConfirmation } from "./commit.ts"
import { commitStoryStateProposal, loadStoryStateCommitReceipt, verifyStoryStateCommitReceipt } from "./state-commit.ts"
import { saveStoryStateProposal, sealStoryStateProposal } from "./state-proposal.ts"
import { loadStoryState } from "./state.ts"
import { loadWriterWorkspace } from "./workspace.ts"

const execute = promisify(execFile)

test("commits an author-confirmed story-state proposal with an immutable receipt", async () => {
  const item = await fixture()
  const result = await commitStoryStateProposal(item.root, item.proposal.id, item.confirmation)
  const loaded = await loadStoryState(item.root)
  const files = paths(await git(item.root, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", result.commit))

  assert.equal(loaded.state.records[0]?.id, "entity:mara")
  assert.equal(loaded.sha256, result.receipt.state.afterSha256)
  assert.deepEqual(await loadStoryStateCommitReceipt(item.root, result.receipt.id), result.receipt)
  assert.deepEqual(files.sort(), [
    `.novel-agent/state-proposals/${item.proposal.id.slice("sha256:".length)}.json`,
    `.novel-agent/state-receipts/${result.receipt.id.slice("sha256:".length)}.json`,
    ".novel-agent/story-state.json",
  ])
  assert.equal(await git(item.root, "status", "--porcelain"), "")
  assert.match(await git(item.root, "show", "-s", "--format=%B", result.commit), /Proposal-ID: sha256:/)
  assert.throws(
    () => verifyStoryStateCommitReceipt({ ...result.receipt, baseCommit: "0".repeat(40) }),
    /content address/,
  )
  await assert.rejects(
    commitStoryStateProposal(item.root, item.proposal.id, item.confirmation),
    /already committed with receipt/,
  )
})

test("rejects mismatched confirmation and stale state without writing", async () => {
  const wrong = await fixture()
  await assert.rejects(
    commitStoryStateProposal(wrong.root, wrong.proposal.id, {
      ...wrong.confirmation,
      proposalId: `sha256:${"0".repeat(64)}`,
    }),
    /bound to a different proposal/,
  )
  await assert.rejects(access(join(wrong.root, ".novel-agent", "story-state.json")), /ENOENT/)

  const stale = await fixture()
  await writeFile(
    join(stale.root, ".novel-agent", "story-state.json"),
    JSON.stringify({
      formatVersion: 1,
      records: [
        {
          kind: "entity",
          id: "entity:orin",
          entityType: "character",
          name: "Orin",
          aliases: [],
          evidence: ["ch01:p001"],
        },
      ],
    }),
  )
  await assert.rejects(
    commitStoryStateProposal(stale.root, stale.proposal.id, stale.confirmation),
    /stale story-state proposal/,
  )
})

test("refuses unrelated work before applying story state", async () => {
  const item = await fixture()
  await writeFile(join(item.root, "notes.md"), "Unrelated author note.\n")
  await assert.rejects(
    commitStoryStateProposal(item.root, item.proposal.id, item.confirmation),
    /must be clean except for the saved story-state proposal/,
  )
  await assert.rejects(access(join(item.root, ".novel-agent", "story-state.json")), /ENOENT/)
})

test("restores the exact prior state and index when Git commit fails", async () => {
  const original = '{\n  "formatVersion": 1,\n  "records": []\n}\n'
  const item = await fixture(original)
  const statePath = join(item.root, ".novel-agent", "story-state.json")
  const base = await git(item.root, "rev-parse", "HEAD")
  const proposalStatus = await git(item.root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
  await git(item.root, "config", "user.useConfigOnly", "true")
  await git(item.root, "config", "user.name", "")
  await git(item.root, "config", "user.email", "")

  await assert.rejects(
    commitStoryStateProposal(item.root, item.proposal.id, item.confirmation),
    /story-state commit failed and prior state was restored/,
  )
  assert.equal(await readFile(statePath, "utf8"), original)
  assert.equal(await git(item.root, "rev-parse", "HEAD"), base)
  assert.equal(await git(item.root, "status", "--porcelain=v1", "-z", "--untracked-files=all"), proposalStatus)
  assert.equal(await git(item.root, "diff", "--cached", "--name-only"), "")
})

async function fixture(initialState?: string) {
  const root = await mkdtemp(join(tmpdir(), "writer-state-commit-"))
  await mkdir(join(root, "manuscript"), { recursive: true })
  await writeFile(
    join(root, "novel.json"),
    `${JSON.stringify({
      formatVersion: 1,
      title: "State Commit Fixture",
      chapters: [{ id: "ch01", path: "manuscript/ch01.md" }],
    })}\n`,
  )
  await writeFile(join(root, "manuscript", "ch01.md"), "<!-- novel-agent:passage ch01:p001 -->\nMara entered alone.\n")
  if (initialState !== undefined) {
    await mkdir(join(root, ".novel-agent"), { recursive: true })
    await writeFile(join(root, ".novel-agent", "story-state.json"), initialState)
  }
  await git(root, "init", "--quiet", "--initial-branch=dev")
  await git(root, "config", "user.name", "Writer Harness Test")
  await git(root, "config", "user.email", "writer@example.test")
  await git(root, "add", ".")
  await git(root, "commit", "--quiet", "-m", "Initial novel")

  const workspace = await loadWriterWorkspace(root)
  const current = (await loadStoryState(root)).state
  const proposal = sealStoryStateProposal(
    workspace,
    current,
    { request: "Record Mara as a character", authority: "propose" },
    {
      text: "I propose adding Mara.",
      upserts: [
        {
          kind: "entity",
          id: "entity:mara",
          entityType: "character",
          name: "Mara",
          aliases: [],
          evidence: ["ch01:p001"],
        },
      ],
    },
  )
  await saveStoryStateProposal(root, proposal)
  const confirmation: AuthorConfirmation = {
    confirmationVersion: 1,
    proposalId: proposal.id,
    decision: "approve",
    confirmedBy: "author:test",
    confirmedAt: "2026-07-14T22:00:00.000Z",
  }
  return { root, proposal, confirmation }
}

function git(root: string, ...args: string[]) {
  return execute("git", args, { cwd: root, encoding: "utf8" }).then((result) => result.stdout.trimEnd())
}

function paths(value: string) {
  return value.split("\0").filter(Boolean)
}
