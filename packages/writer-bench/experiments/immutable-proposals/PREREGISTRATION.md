# Immutable proposal experiment preregistration

Registered: 2026-07-13, before the first benchmark execution.

## Question

Does a harness-owned, immutable edit artifact make model revisions reliably reviewable and applicable without degrading the quality of the proposed prose relative to an ordinary free-form editing response?

## Fixed systems

- Corpus: diagnosed-development Glass Orchard 1.0.0
- Tasks: 12 scoped revision jobs
- Context: identical task-aware compiled passages for both targets
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096
- Trials: three per target
- Control: free-form editorial response with proposal-only authority
- Candidate: Writer Contract v0.1 structured edit followed by harness-owned proposal sealing
- Judge: the configured DeepSeek model, used only as a directional prose-quality signal; deterministic safety checks remain authoritative

The candidate artifact is content-addressed and contains source hashes, exact edit targets, complete replacement text, preservation hashes and receipts, validation checks, and `status: proposed`. The model does not create or approve the proposal ID or validation result.

## Primary gates

1. Candidate proposal validity, precondition coverage, preservation receipts, and uncommitted authority must each be 1.0000.
2. Candidate must have zero deterministic safety failures.
3. Each proposal metric must improve over free-form by at least 0.90.
4. Overall mean score must improve by at least 0.20, with a paired 95% bootstrap lower bound of at least +0.10.
5. Task-aware context size must not differ between systems.

Prose-quality, voice-fidelity, and constraint-fidelity judge scores will be reported separately in the interpretation. They cannot override a deterministic safety failure or support a broad creative-quality claim.
