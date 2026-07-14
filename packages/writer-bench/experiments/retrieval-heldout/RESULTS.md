# Held-out retrieval results

Status: **failed graduation; retain temporal filtering, redesign semantic retrieval**.

## Protocol integrity

The Quiet Meridian corpus, tasks, frozen retriever commit, and gates were committed at `0b6b0c983` before the first benchmark execution. The retriever remained byte-for-byte unchanged. No corpus or check correction was made after execution began.

- Deterministic run: `2026-07-13T22-56-06-975Z-eabfa384`
- Downstream run: `2026-07-13T22-56-28-288Z-d9e29f3b`
- Corpus: Quiet Meridian 1.0.0, 5,002 words, 64 passages, 12 tasks
- Downstream: 3 trials, 72 completed cells, no execution failures
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096

## Deterministic retrieval

| Strategy | Recall | Precision | Temporal safety | Mean items | Latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lexical | 0.5972 | 0.4538 | 0.2500 | 4.4167 | 3.61 ms |
| Hierarchical | 0.6389 | 0.4565 | 0.4167 | 4.4167 | 6.15 ms |
| Hierarchical-temporal | 0.6875 | 0.5496 | 1.0000 | 4.4167 | 4.57 ms |

The candidate improved recall by 0.0903, narrowly missing the preregistered 0.10 delta. More importantly, absolute recall remained only 0.6875. Precision improved by 0.0958 and temporal safety improved by 0.7500 to a perfect 1.0000.

The deterministic comparison failed one of four registered metric gates. Experiment 3 therefore could not graduate even before downstream generation was considered.

## Downstream behavior

| Strategy | Mean score | Safety failures | Grounding | Unsupported-claim avoidance | Output tokens/task | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Lexical | 0.7371 | 21 | 0.7553 | 1.0000 | 2713.6 | 139,302 |
| Hierarchical-temporal | 0.7467 | 26 | 0.7608 | 0.9048 | 2892.2 | 145,663 |

Paired comparison:

- mean delta: +0.0096;
- 95% paired bootstrap interval: -0.0824 to +0.1005;
- wins/ties/losses: 5/1/6;
- safety-failure increase: +5;
- grounding delta: +0.0056;
- unsupported-claim-avoidance delta: -0.0952;
- output-token change: +178.6 per task.

The downstream comparison failed four gates: lower confidence bound, safety-failure increase, retrieval-recall delta, and unsupported-claim avoidance. The small positive mean score is not sufficient to offset those failures.

## Decision

The hierarchical-temporal retriever does **not** graduate. Experiment 4 must not use it as a presumed reliable context source.

The hard story-time filter is retained as a mandatory retrieval invariant: it achieved 1.0000 temporal safety on a manuscript twice the passage count of Harbor Light while adding negligible latency. The failed component is semantic and cross-chapter evidence coverage, not temporal filtering.

## Next development experiment

Quiet Meridian may now be used only as a diagnosed development corpus after this immutable result is recorded. Retrieval v2 should replace hand-written concept expansion as the main semantic mechanism and test:

1. entity and alias extraction at manuscript ingest;
2. event/relation indexing across chapters;
3. query decomposition into evidence obligations;
4. hybrid lexical and semantic candidate generation;
5. coverage-aware selection under the same top-K budget;
6. the already validated story-time cutoff.

Retrieval v2 must be developed against Harbor Light and Quiet Meridian, then evaluated once against a new sealed corpus. Immutable edit-proposal testing resumes only after retrieval clears that new held-out gate.
