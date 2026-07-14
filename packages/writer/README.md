# Novel Agent Harness writer core

This package contains the production-facing writer primitives that sit above OpenCode's generic agent runtime. The first vertical slice defines a Git-friendly novel workspace and stable passage identity.

## Workspace format

A workspace has a `novel.json` manifest:

```json
{
  "formatVersion": 1,
  "title": "Glass Orchard",
  "chapters": [{ "id": "ch01", "path": "manuscript/ch01.md" }]
}
```

Chapter Markdown uses explicit passage markers:

```markdown
# Chapter One

<!-- novel-agent:passage ch01:p001 -->

The tide had left glass pears beneath the pier.

<!-- novel-agent:passage ch01:p002 -->

Mara counted three before she touched the first.
```

The marker, rather than a paragraph's position or current wording, is its durable identity. Inserting, deleting, or reordering other passages therefore does not renumber citations, proposal targets, story-state evidence, or review comments. The authoring UI can hide markers while preserving them in the Git-backed Markdown source.

`loadWriterWorkspace()` validates the manifest, prevents chapter paths from escaping the workspace, rejects duplicate or mismatched references, preserves exact passage text, and records a SHA-256 precondition for every passage.

## Writer Task Contract and sessions

`createWriterTask()` routes or accepts an explicit Explain, Diagnose, Plan, or scoped Revise job and derives authority from the job: the first three are always read-only and Revise can only propose. `renderWriterContract()` sends the model a benchmark-free production contract, while `parseWriterResult()` rejects unsupported evidence, read-only edits, out-of-scope targets, duplicate targets, invalid preservation receipts, and commit claims. Valid revisions are sealed into immutable proposals by trusted writer code.

OpenCode's `WriterSession` adapter loads the Git-backed workspace, compiles the selected context, submits the contract through OpenCode's durable session and structured-output machinery, validates the response, and persists a valid revision proposal. Its built-in `writer` agent has generic tools denied; author confirmation and commit are not model tools.

## Context and proposal boundary

`compileContext()` builds a controlled packet from explicit focus, dependency, preservation, exclusion, and through-point declarations. Temporal order comes from the manifest and chapter source order, so references do not need numeric names. It validates every declared reference and exact preservation literal before model inference.

`sealEditProposal()` accepts model-proposed replacement text but constructs the authoritative envelope in trusted harness code. The content-addressed envelope binds edits to source hashes, allowed targets, preservation receipts, and an explicitly uncommitted authority state. It never writes manuscript files.

`saveEditProposal()` stores only validated, content-addressed envelopes under `.novel-agent/proposals`. `loadEditProposal()` revalidates the complete content address, and `renderProposalDiff()` refuses stale source hashes before producing a passage-scoped review diff. None of these review operations can apply an edit.

## Author-confirmed commits

`commitEditProposal()` is the only writer-core operation that can change manuscript text. It requires a versioned confirmation that is bound to the exact proposal ID:

```ts
await commitEditProposal(root, proposal.id, {
  confirmationVersion: 1,
  proposalId: proposal.id,
  decision: "approve",
  confirmedBy: "author:local-user",
  confirmedAt: new Date().toISOString(),
})
```

The host application must construct this confirmation only after an affirmative author action. It must not expose confirmation construction or `commitEditProposal()` to the model as an autonomous tool.

Before writing, the operation reloads the content-addressed proposal, rejects a previously committed proposal, verifies every contextual, edited, and preserved passage hash, requires the novel workspace to be the root of a clean Git branch, and permits only the saved proposal to be untracked. It then:

1. replaces only the approved passage byte ranges while preserving passage markers;
2. reloads the workspace and proves that approved replacements changed, unapproved passages did not, and preservation literals remain;
3. stages only the affected chapters, saved proposal, and a content-addressed receipt;
4. creates a Git commit with repository hooks disabled so a hook cannot expand the approved file scope;
5. verifies the resulting Git tree against the exact staged blob IDs.

Receipts live under `.novel-agent/receipts` and bind the proposal, author confirmation, base Git commit, changed passage references, file paths, and before/after hashes. The resulting Git commit ID is returned alongside the receipt. If writing, validation, staging, or Git commit creation fails before `HEAD` advances, writer core restores the original chapter bytes and index state. Once `HEAD` advances it will never rewrite history automatically; any later verification error reports the created commit explicitly.

## Boundary

This package owns writer semantics. OpenCode continues to own sessions, model access, tools, permissions, events, persistence, and snapshots. The trusted host owns author confirmation and may expose proposal review to a model-driven session, but not commit authority. Benchmark-only checks and hidden evaluation data remain in `@novel-agent-harness/bench`.
