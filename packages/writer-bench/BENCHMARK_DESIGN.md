# Benchmark design and release policy

## Evaluation layers

Writer Harness Bench uses four layers because no existing benchmark covers the complete author/harness relationship.

1. **Native task competence:** intent, evidence, diagnosis, planning, scoped revision, synchronization, and author control.
2. **External reliability:** long-story consistency, general writing instruction-following, book understanding, and summary faithfulness.
3. **Creative preference:** blinded pairwise preference from fiction writers, with automated reward models used only for iteration.
4. **Operational quality:** completion, resume behavior, latency, tokens, cost, invalid proposals, and unauthorized mutations.

## Score interpretation

Hard checks and subjective criteria remain separate components in raw records. A weighted aggregate is convenient for dashboards but must not erase safety failures. A run fails if any configured gate fails even when its aggregate score improves.

An improvement claim requires:

- the same `comparisonKey` for baseline and candidate;
- paired tasks and trials;
- no increase beyond configured safety or external-suite regression budgets;
- a predeclared minimum effect;
- a confidence interval and sample count;
- blinded human validation for subjective creative claims.

## Native suite roadmap

The production suite should contain 100–200 tasks over a permissioned or synthetic novella and be stratified across:

| Family | Target count | Core measurements |
| --- | ---: | --- |
| Explain and retrieve | 20 | fact accuracy, evidence recall/precision, uncertainty |
| Diagnose | 30 | planted-error recall, false positives, intentional exceptions |
| Brainstorm | 15 | option diversity, constraint satisfaction, useful tradeoffs |
| Plan | 20 | causal consequences, preserved beats, completeness |
| Scoped revision | 35 | edit scope, preservation, prose preference, new errors |
| Multi-scene revision | 20 | global consistency, stale-base behavior, partial acceptance |
| Story-state synchronization | 20 | extraction accuracy, provenance, invalidation, no canon invention |
| Translation | deferred | meaning, terminology, voice, ambiguity handling |

Tasks must include easy and adversarial variants, clear and materially ambiguous instructions, relevant and distracting context, stale revisions, conflicting records, and intentional inconsistencies.

## External suite policy

External data remains upstream. Adapters must record source, version, filters, and evaluator policy. We distinguish:

- **official score:** produced by the benchmark's pinned official evaluator;
- **normalized local score:** produced by this runner's shared judge/check system;
- **diagnostic derivative:** an adapted subset or changed prompt that must not be compared to an upstream leaderboard.

CI uses pinned diagnostic subsets for cost and speed. Scheduled releases use the full licensed suite and official evaluator where practical.

Official metrics are attached as separately named records with their natural direction. They are never averaged into the native 0–1 task score. Regression gates can therefore require, for example, that ConStory CED does not increase while native revision quality improves.

## CI tiers

| Tier | Trigger | Contents | Purpose |
| --- | --- | --- | --- |
| Smoke | every change | 10–20 deterministic native tasks, fixture targets in runner tests | runner and schema correctness |
| Pull request | harness changes | 30–50 native tasks plus pinned external subsets, 1–3 trials | catch regressions quickly |
| Nightly | scheduled | full native suite and larger external subsets, 3 trials | track stochastic quality and cost |
| Release | candidate release | full supported external suites, 5+ trials, blinded human sample | support improvement claims |

## Initial gates

Before a pilot establishes stable variance, use conservative gates:

- no aggregate regression;
- no per-suite mean regression greater than two percentage points;
- zero unauthorized edit-scope violations;
- zero silent commit/mutation events;
- no increase in intentional-exception false positives;
- at least 95% task completion;
- cost and latency reported, not yet gated.

After 3–5 representative runs, set thresholds from observed variance and freeze them before optimizing the harness.

## Contamination and privacy

- Keep part of the native evaluation set private or encrypted in CI to reduce prompt overfitting.
- Never include unpublished user manuscripts in the public benchmark.
- Use synthetic, public-domain, or explicitly licensed prose.
- Record provider and retention policy for every external model call.
- Never send the same evaluation outputs to a judge that generated them without clearly labeling that conflict.
