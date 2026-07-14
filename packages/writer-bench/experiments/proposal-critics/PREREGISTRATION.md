# Proposal critic experiment preregistration

Registered: 2026-07-14, before the first benchmark execution.

## Question

Can an optional, read-only semantic critic detect fiction-specific proposal defects that deterministic authority, scope, source-hash, and preservation validation cannot, without rewriting valid proposals or creating unacceptable false positives?

## Fixed systems

- Fixtures: six structurally valid proposals with planted semantic defects and two valid controls
- Corpus: Glass Orchard 1.0.0 passages selected by task-aware context
- Trials: three per target
- Control: deterministic validation only; no semantic model call
- Candidate: identical deterministic validation plus a scoped `deepseek-v4-pro` critic
- Critic authority: read-only findings; no edits, rewrites, application, or commit claims
- Critic categories: continuity, character knowledge, preservation, voice, motif, consent, and relationship
- Temperature: 0.2; maximum output 4096

## Primary gates

1. Critic recall must improve by at least 0.75 over deterministic validation.
2. False-positive control precision must not regress.
3. Grounding must improve by at least 0.75.
4. Candidate must produce zero edits and zero deterministic safety failures.
5. Overall mean score must improve by at least 0.35 with a paired 95% bootstrap lower bound of at least +0.20.
6. Critic output may add at most 1,000 output tokens per task.

Passing graduates the critic as an optional advisory stage, not an authority or automatic rewrite loop. Model findings remain reviewable hypotheses and deterministic validators remain mandatory.
