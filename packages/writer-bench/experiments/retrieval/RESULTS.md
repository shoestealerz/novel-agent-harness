# Retrieval experiment results

## Decision

Adopt hierarchical-temporal retrieval as the current development candidate. It beat lexical retrieval on the seven Harbor Light retrieval tasks, passed both regression configurations, and eliminated future-passage selection at the declared story-time boundary. Do not yet claim that the result generalizes beyond Harbor Light.

## Experimental controls

- Date: 2026-07-13
- Corpus: Harbor Light 0.4.0 retrieval suite, 7 tasks, 32 manuscript passages
- Trials: 1
- Model: `deepseek-v4-pro`
- Temperature: 0.2
- Maximum output: 4096 tokens, with one compact JSON recovery attempt
- Writer layer: Writer Contract v0.1 runtime, contract protocol 2
- Context layer: graduated task-aware compiler
- Variable under test: lexical, hierarchical, or hierarchical-temporal retrieval
- Top-K: task-defined, mean 3.86 passages
- Hidden isolation: required/relevant labels remain in evaluator-only task metadata and are not forwarded to targets

Run IDs:

- deterministic validity: `2026-07-13T22-23-28-363Z-e37a74a1`
- downstream DeepSeek: `2026-07-13T22-23-51-445Z-cf7f7470`

## Deterministic retrieval

| Strategy | Recall | Precision | Temporal safety | Mean latency |
| --- | ---: | ---: | ---: | ---: |
| Lexical | 0.6905 | 0.5714 | 0.7143 | 2.97 ms |
| Hierarchical | 0.9524 | 0.6548 | 0.8571 | 4.16 ms |
| Hierarchical-temporal | 0.9524 | 0.7024 | 1.0000 | 3.87 ms |

The temporal candidate missed one required development passage: `ch02:p008` in the cross-novel sea-color motif task. That miss is retained as visible headroom instead of adding a task-specific rule.

## Downstream model behavior

| Strategy | Mean task score | Safety failures | Grounding | Output tokens/task | Total tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lexical | 0.8016 | 5 | 0.6667 | 3418.6 | 31,929 |
| Hierarchical | 0.9167 | 5 | 0.7738 | 2466.3 | 23,989 |
| Hierarchical-temporal | 0.9345 | 3 | 0.8929 | 2161.1 | 21,863 |

All three strategies achieved 1.000 unsupported-claim avoidance on the task checks. Remaining temporal-candidate safety failures were partial citation-grounding scores, not future-story leakage.

## Paired comparisons

Against lexical retrieval:

- mean score delta: +0.1329;
- 95% paired bootstrap interval: -0.0020 to +0.2659;
- wins/ties/losses: 4/1/2;
- safety failures: 5 to 3;
- retrieval recall delta: +0.2619;
- retrieval precision delta: +0.1310;
- temporal safety delta: +0.2857;
- grounding delta: +0.2262;
- output tokens per task: 1,257 fewer.

Against hierarchy without the temporal cutoff:

- mean score delta: +0.0179;
- 95% paired bootstrap interval: -0.0119 to +0.0556;
- wins/ties/losses: 2/4/1;
- safety failures: 5 to 3;
- retrieval recall: unchanged;
- retrieval precision delta: +0.0476;
- temporal safety delta: +0.1429;
- grounding delta: +0.1190;
- output tokens per task: 305 fewer.

Both comparisons pass their checked-in gates. The confidence intervals include zero because this is a seven-task, one-trial development run; the deterministic retrieval deltas and safety checks are stronger evidence than the small downstream sample alone.

## Interpretation and limitations

This experiment supports three implementation decisions: explicit story-time boundaries belong in retrieval, local passage neighborhoods help recover causal evidence, and scene-level scores should supplement rather than hard-gate passage ranking. It does not establish writing quality across genres, long manuscripts, or unseen prose.

The concept expansion table and selection behavior were developed while inspecting Harbor Light failures, so Harbor Light must remain a development set. The next milestone is a sealed held-out corpus, followed by at least three model trials per target. Embedding retrieval remains an implemented provider seam but was not run because DeepSeek's public model list does not currently expose an embedding model.
