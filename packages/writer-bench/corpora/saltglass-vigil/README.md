# Saltglass Vigil book-scale corpus

`Saltglass Vigil` is the wholly synthetic, CC0 novella for the Alpha 3 book-scale evaluation. Its pre-prose architecture is frozen and its canonical manuscript is complete. Gold records, isolated variants, task splits, and human-review packets will be added in separately auditable stages.

The architecture fixes the story's causal spine before prose generation:

- 36,000–44,000 target words across 14 chapters and eight story days;
- two constrained close-third voices;
- nine recurring characters, six locations, six consequential objects, and eight world rules;
- three character arcs, two relationship arcs, and one external plot arc;
- six asymmetric-knowledge checkpoints;
- nine dependencies whose payoffs occur at least four chapters after setup;
- twelve deliberate ambiguities that must not be misdiagnosed;
- two planned isolated defects in each of the seven preregistered categories.

The SHA-256 receipt records the architecture's canonical UTF-8 content with LF line endings, so Git checkouts verify identically across operating systems. Any intentional architecture correction must update the corpus version and receipt, explain the correction here, and preserve the superseded result in Git history.

Validate the frozen architecture from `packages/writer-bench`:

```sh
bun run corpus:architecture
```

Audit every canonical chapter against its planned filename, sequential passage IDs, 2,500–3,300-word range, and 18–22-passage range:

```sh
bun run corpus:draft
```

## Prose-generation boundary

No manuscript prose or evaluation task was written before the Alpha 3 protocol and this architecture were frozen. Drafting must preserve the decisions in `frozenDecisions`, keep the canonical manuscript free of planted errors, and assign at least 18 stable passage references per chapter. Evaluation candidates may never receive this architecture file, hidden author intent, gold annotations, or variant definitions.

## Canonical drafting ledger

Word counts exclude headings and passage-reference comments.

| Batch | Chapters | Words | Passages | Status                                    |
| ----- | -------- | ----: | -------: | ----------------------------------------- |
| 1     | 1–2      | 5,041 |       36 | drafted; automated structure audit passed |
| 2     | 3–4      | 5,011 |       36 | drafted; automated structure audit passed |
| 3     | 5–6      | 5,010 |       36 | drafted; automated structure audit passed |
| 4     | 7–8      | 5,003 |       36 | drafted; automated structure audit passed |
| 5     | 9–10     | 5,314 |       36 | drafted; automated structure audit passed |
| 6     | 11–12    | 5,311 |       36 | drafted; automated structure audit passed |
| 7     | 13–14    | 5,432 |       36 | drafted; automated structure audit passed |

The canonical manuscript is complete at 36,122 words in 252 stable passages. Batch 1 establishes the two voice exemplars and their asymmetric day-one knowledge. Batch 2 resolves the blank-folio accusation without resolving the pressure discrepancy, fixes the evacuation-code sequence, converts the apparently future ferry token, and begins the protagonists' mutual leverage. Batch 3 corrects the mirrored lens, establishes the missing pressure minute and iron evidence, separates Pel's human error from malice, and exposes Janek's intermittent grip. Batch 4 proves the lens crack predates the break-in, breaks Neris's trust in Orra's complete disclosure, pays off the ferry token and copied-ledger limitations, exposes Merrin, and recovers Hal's still-sealed map tube. Batch 5 turns evidence into a public, dependency-ordered warning plan and pays off Tovan's old courier network as a consent-based readiness chain while preserving his boundary with Cael. Batch 6 demonstrates the iron-cart mechanism, exposes the incomplete procurement summary and Orra's secret partial-evacuation motive, recovers the missing clock interval, formalizes Janek-to-Pel succession, and transfers the master key under explicit stop authority. Batch 7 completes the public warning, repair, authority, character, and relationship arcs without collapsing the registered unresolved questions.

Validate the complete canonical manuscript from `packages/writer-bench`:

```sh
bun run corpus:validate:book
```
