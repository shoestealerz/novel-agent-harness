# Saltglass Vigil book-scale corpus

`Saltglass Vigil` is the wholly synthetic, CC0 novella planned for the Alpha 3 book-scale evaluation. This directory currently contains the frozen pre-prose architecture only. Canonical prose, gold records, isolated variants, task splits, and human-review packets will be added in separately auditable stages.

The architecture fixes the story's causal spine before prose generation:

- 36,000–44,000 target words across 14 chapters and eight story days;
- two constrained close-third voices;
- nine recurring characters, six locations, six consequential objects, and eight world rules;
- three character arcs, two relationship arcs, and one external plot arc;
- six asymmetric-knowledge checkpoints;
- nine dependencies whose payoffs occur at least four chapters after setup;
- twelve deliberate ambiguities that must not be misdiagnosed;
- two planned isolated defects in each of the seven preregistered categories.

The SHA-256 receipt records the exact architecture bytes used to begin drafting. Any intentional architecture correction must update the corpus version and receipt, explain the correction here, and preserve the superseded result in Git history.

Validate the frozen architecture from `packages/writer-bench`:

```sh
bun run corpus:architecture
```

## Prose-generation boundary

No manuscript prose or evaluation task was written before the Alpha 3 protocol and this architecture were frozen. Drafting must preserve the decisions in `frozenDecisions`, keep the canonical manuscript free of planted errors, and assign at least 18 stable passage references per chapter. Evaluation candidates may never receive this architecture file, hidden author intent, gold annotations, or variant definitions.
