# Writer-aware memory experiment preregistration

Registered: 2026-07-14, before the first benchmark execution.

## Question

When an agent session must be compacted, does a narrative-state schema preserve the author's decisions and story truth better than OpenCode's generic coding-session schema, and does that retained memory improve downstream writing work?

## Fixed systems

- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096
- Trials: three per target
- Inputs: three synthetic Glass Orchard author/agent histories and six downstream tasks
- Control: OpenCode's anchored coding schema (`Objective`, `Important Details`, `Work State`, `Next Move`, `Relevant Files`)
- Candidate: anchored writer schema covering canon, character knowledge, protected ambiguity, chronology/causality, object state, relationships, motifs/payoffs, voice, accepted/rejected decisions, and active proposal state
- Downstream: Writer Contract v0.1 receives only `memory:summary`; the original history is unavailable
- Immutable proposal layer: unchanged and represented in memory when active

## Primary gates

1. Writer memory must improve deterministic memory recall by at least 0.10.
2. Memory safety and downstream grounding must not regress.
3. Overall mean score must improve by at least 0.05 with a paired 95% bootstrap lower bound of at least 0.00.
4. Candidate must have zero deterministic safety failures.
5. Both systems must compact the same mean input words.
6. Writer memory may use at most 250 additional summary words and 750 additional output tokens per task.

This is a development experiment on synthetic session histories. Passing supports the memory schema and downstream interface, not a universal long-context claim.
