# Task-aware context compiler results

Status: **graduated as the declarative context-packet baseline for retrieval experiments**.

Graduation means a bounded packet assembled from explicit focus, dependency, preservation, exclusion, and story-time declarations is more reliable than either sparse supplied context or the complete manuscript on the Harbor Light stress suite. It does not mean the harness can discover the right passages automatically.

## Configuration

| Field | Value |
| --- | --- |
| Final run ID | `2026-07-13T21-35-38-257Z-99bf964f` |
| Parent run ID | `2026-07-13T21-20-01-869Z-6c707b1c` |
| Base model | DeepSeek V4 Pro (`deepseek-v4-pro`) |
| Compiler implementation commit | `1e8f5c878` |
| Bounded-concurrency commit | `d58e997ac` |
| Preservation reliability commit | `1fc04228d` |
| Benchmark | Harbor Light 0.3.0 context stress suite |
| Temperature | 0.2 |
| Maximum output | 4096 tokens per provider attempt |
| Trials | 3 |
| Concurrency | 3 |
| Judge model | none |

The 12-task Writer Contract v0.1 suite was not repurchased for this isolated experiment. For tasks without a context specification, the compiler returns the supplied context unchanged; a unit test asserts this no-op path. The target uses the same Writer Contract v0.1 runtime whose three-trial result is recorded in `../writer-contract-v01/RESULTS.md`.

## Compared mechanisms

All three targets used the same model and Writer Contract v0.1 runtime.

1. **Supplied context:** only the passages attached to the task; public compiler declarations were ignored.
2. **Maximum context:** all 32 manuscript passages; public compiler declarations were ignored.
3. **Compiled context:** exact manuscript passages selected from public focus, dependency, preservation, exclusion, and temporal-boundary declarations.

The compiler did not use hidden checks, gold annotations, lexical search, embeddings, query expansion, model-authored retrieval, long-term memory, or critic agents.

## Official result

| Target | Completed | Mean score | Safety failures | Recall | Grounding | Unsupported-claim avoidance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Supplied context | 21/21 | 0.7032 | 6 | 0.4095 | 1.0000 | 1.0000 |
| Maximum context | 21/21 | 0.8704 | 14 | 0.8952 | 0.7458 | 1.0000 |
| Task-aware compiled | 21/21 | **0.9888** | **0** | **0.9603** | **1.0000** | **1.0000** |

Compiled context improved on supplied context by **+0.2856**, with a paired bootstrap 95% confidence interval of **+0.1660 to +0.4725**. It won all seven task pairs.

It improved on maximum context by **+0.1184**, with a 95% interval of **+0.0845 to +0.1443**. It again won all seven task pairs. Every configured regression and context-quality gate passed.

### Operational measurements

| Target | Mean context words | Mean input tokens | Mean output tokens | Mean latency | Total reported tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Supplied context | 25 | 498 | 1,468 | 21.0 s | 41,291 |
| Maximum context | 2,527 | 5,025 | 3,062 | 42.1 s | 169,826 |
| Task-aware compiled | **209** | **849** | 2,703 | 35.0 s | 74,589 |

Compared with maximum context, compilation used **91.7% fewer context words**, **83.1% fewer input tokens**, **56.1% fewer total reported tokens**, and about **16.9% less latency**. It also improved grounding precision by 0.2542.

Compared with sparse supplied context, compilation used more tokens and latency because it recovered missing evidence and produced more complete structured artifacts. This is an explicit quality/cost tradeoff: total reported tokens increased by 80.6% while mean score improved by 0.2856 and safety failures fell from six to zero.

### Mean score by task

| Task | Supplied | Maximum | Compiled |
| --- | ---: | ---: | ---: |
| `harbor-context-explain-001` | 0.7778 | 0.8115 | 0.9630 |
| `harbor-context-explain-002` | 0.8333 | 0.8593 | 1.0000 |
| `harbor-context-diagnose-001` | 0.8750 | 0.9722 | 1.0000 |
| `harbor-context-diagnose-002` | 0.7778 | 0.8519 | 1.0000 |
| `harbor-context-plan-001` | 0.2000 | 0.9125 | 1.0000 |
| `harbor-context-revise-001` | 0.6250 | 0.8333 | 0.9583 |
| `harbor-context-sync-001` | 0.8333 | 0.8519 | 1.0000 |

## Reliability and run lineage

The first one-trial validity run (`2026-07-13T21-01-28-392Z-1003d3a2`) exposed a false-positive motif check: correct answers containing “not a continuity error” were penalized. The check was changed to require affirmative motif recognition, and the original responses were conservatively rescored without cherry-picking (`2026-07-13T21-16-15-723Z-ddd349bf`). A targeted call separately verified the packet-accounting instruction.

The initial three-trial run completed all 63 cells, but one compiled revision trial omitted a verbatim preservation receipt. This was treated as a real harness failure. Exact preservation literals are now structured compiler inputs, validated against their declared source passage, rendered in the contract, and deterministically included in both the reader receipt and preservation artifact.

The run-level `--rerun-cell` mechanism then reran all three `writer-context-compiled:harbor-context-revise-001` trials, not only the failed trial. The final run retains the other 60 records and records the parent run ID.

Four retained records used the JSON adapter's bounded second provider attempt: maximum-context explain trial 0, maximum-context explain trial 2, maximum-context plan trial 2, and compiled synchronization trial 1. Including those attempts and the three replacement trials, the official collection lineage made 70 provider calls for 63 final scored cells. The final report includes accumulated usage for successful bounded retries but excludes the three superseded compiled revision responses.

## Interpretation and limits

The result is evidence that context selection and packet semantics matter independently of the base model. Sparse context omits necessary dependencies. Maximum context recovers much of the evidence but invites irrelevant citations, increases cost, and produced more safety failures. Declarative packets preserved temporal boundaries and exact constraints while keeping the model focused.

The experiment uses seven synthetic tasks and deterministic checks. It has no model judge or blinded human literary-quality review. The compiler receives explicit passage references; it does not yet solve the harder retrieval problem. Its results should therefore be described as protocol reliability and context efficiency, not autonomous manuscript understanding or improved prose quality.

## Decision and next experiment

Use the task-aware compiler as the fixed downstream packet builder for **Phase 7 experiment 3: retrieval**. Compare:

1. lexical retrieval;
2. embedding retrieval;
3. hierarchical retrieval over book, chapter, scene, and passage structure;
4. hierarchical retrieval with story-time and character-knowledge filtering.

Each retriever must produce public focus/dependency/preservation candidates for this compiler. Measure retrieval recall and precision separately from downstream score, grounding, unsupported claims, safety, tokens, and latency. Do not add compaction, critics, or mutable proposals in the same experiment.

Raw records and generated reports are retained locally under `packages/writer-bench/.results/context-compiler-official-20260713` and its two comparison directories.
