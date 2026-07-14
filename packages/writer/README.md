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

## Context and proposal boundary

`compileContext()` builds a controlled packet from explicit focus, dependency, preservation, exclusion, and through-point declarations. Temporal order comes from the manifest and chapter source order, so references do not need numeric names. It validates every declared reference and exact preservation literal before model inference.

`sealEditProposal()` accepts model-proposed replacement text but constructs the authoritative envelope in trusted harness code. The content-addressed envelope binds edits to source hashes, allowed targets, preservation receipts, and an explicitly uncommitted authority state. It never writes manuscript files.

`saveEditProposal()` stores only validated, content-addressed envelopes under `.novel-agent/proposals`. `loadEditProposal()` revalidates the complete content address, and `renderProposalDiff()` refuses stale source hashes before producing a passage-scoped review diff. None of these review operations can apply an edit.

## Boundary

This package owns writer semantics. OpenCode continues to own sessions, model access, tools, permissions, events, persistence, and snapshots. Benchmark-only checks and hidden evaluation data remain in `@novel-agent-harness/bench`.
