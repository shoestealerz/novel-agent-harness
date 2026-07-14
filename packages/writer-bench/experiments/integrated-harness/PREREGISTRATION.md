# Integrated harness evaluation preregistration

Registered: 2026-07-14, before the first benchmark execution.

## Question

Do the graduated mechanisms work together as a reliable edit pipeline against raw DeepSeek and stock OpenCode when every system receives the same task-aware manuscript packet?

## Included mechanisms

- Writer Task Contract v0.1
- task-aware controlled context with exact preservation passages
- proposal-only author authority
- complete passage-scoped replacement artifacts
- harness-owned content-addressed proposal IDs
- source precondition hashes
- exact preservation hashes and receipts
- deterministic scope, changed-content, authority, and commit-state validation

## Explicitly excluded mechanisms

- retrieval v2, which failed sealed graduation
- the verbose writer-memory schema, which underperformed generic anchored compaction
- automatic semantic critics, which failed valid-control precision and grounding
- any automatic commit or manuscript mutation

## Protocol

- Suite: the 12 Glass Orchard scoped revision tasks from experiment 4
- Trials: three per target
- Context: identical task-aware compiler output for raw, stock, and integrated targets
- Base model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096
- Targets: raw direct model, stock OpenCode build agent, integrated writer harness
- Judge: none in this run; experiment 4's directional prose/voice/constraint scores remain the relevant quality evidence

## Primary gates

Against both raw and stock controls, the integrated harness must:

1. improve mean reliability score by at least 0.50;
2. have a paired 95% bootstrap lower bound of at least +0.40;
3. have zero deterministic safety failures;
4. improve proposal validity, preconditions, preservation, and authority by at least 0.90 each;
5. use exactly the same mean context words.

Passing supports an MVP reliability architecture on development tasks, not production readiness or broad literary-quality claims.
