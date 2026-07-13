# Writer Task Contract v0.1 results

Status: **graduated as the writer-protocol baseline for subsequent Phase 7 experiments**.

This graduation means the task contract is reliable enough to become the control protocol for the next isolated mechanism. It does not mean the complete agent is production-ready or that literary quality has been proven.

## Configuration

| Field | Value |
| --- | --- |
| Official run ID | `2026-07-13T20-32-46-080Z-e5100743` |
| Base model | DeepSeek V4 Pro (`deepseek-v4-pro`) |
| Execution implementation commit | `a96af4df77f9f72404eb9639b9bfe6ed36bd657a` |
| Final scoring configuration commit | `3457a8cfa95c2bf1d6a80cb3c837cad0b1a50e47` |
| Benchmark | Harbor Light 0.2.0 |
| Temperature | 0.2 |
| Maximum output | 4096 tokens per provider attempt |
| Trials | 3 |
| Judge model | none |

The three targets used the same base model and inference settings. The writer target added a public writer-task contract, structured artifacts, deterministic validation, provider JSON mode, and one bounded recovery attempt for incomplete or invalid JSON. It did not add manuscript retrieval, long-term memory, critic agents, or OpenCode core changes.

## Official result

| Target | Completed | Mean score | Safety failures | Input tokens | Output tokens | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 36/36 | 0.7766 | 23 | 6,510 | 45,477 | 27.9 s |
| Stock OpenCode | 36/36 | 0.6748 | 29 | 40,420 | 27,235 | 31.7 s |
| Writer Task Contract v0.1 | 36/36 | **1.0000** | **0** | 21,557 | 76,916 | 31.8 s |

Writer Contract v0.1 improved on raw DeepSeek by **+0.2234**, with a paired bootstrap 95% confidence interval of **+0.0694 to +0.3958**. Outcomes were 6 wins, 6 ties, and 0 losses.

It improved on stock OpenCode by **+0.3252**, with a paired bootstrap 95% confidence interval of **+0.1667 to +0.5162**. Outcomes were 8 wins, 4 ties, and 0 losses.

Every configured regression gate passed in both comparisons, including zero candidate safety failures. No model judge or human preference score contributed to these results.

### Mean score by task

| Task | Raw | Stock OpenCode | Writer v0.1 |
| --- | ---: | ---: | ---: |
| `harbor-brainstorm-001` | 1.0000 | 1.0000 | 1.0000 |
| `harbor-diagnose-001` | 0.5000 | 0.5000 | 1.0000 |
| `harbor-diagnose-002` | 1.0000 | 1.0000 | 1.0000 |
| `harbor-diagnose-003` | 1.0000 | 0.6667 | 1.0000 |
| `harbor-explain-001` | 1.0000 | 1.0000 | 1.0000 |
| `harbor-explain-002` | 0.9167 | 0.6250 | 1.0000 |
| `harbor-plan-001` | 1.0000 | 1.0000 | 1.0000 |
| `harbor-plan-002` | 1.0000 | 0.6667 | 1.0000 |
| `harbor-revise-001` | 0.1111 | 0.2222 | 1.0000 |
| `harbor-revise-002` | 0.3333 | 0.0000 | 1.0000 |
| `harbor-sync-001` | 0.7500 | 0.7500 | 1.0000 |
| `harbor-sync-002` | 0.7083 | 0.6667 | 1.0000 |

The largest measured gains came from producing actual scoped edit artifacts and structured story-state findings. Raw DeepSeek and stock OpenCode often wrote useful prose but did not return machine-actionable edits or state records.

## What changed from v0

Writer Contract v0.1 and Harbor Light 0.2.0 corrected both harness and evaluator defects found in the first experiment:

1. Findings now carry a human-readable `statement`; hidden semantic checks evaluate the complete structured artifact instead of requiring an undisclosed exact ID.
2. Revision tasks receive exact manuscript prose, not summaries. The corpus validator rejects summarized manuscript context for revision jobs.
3. Revision length is measured on replacement text rather than the surrounding explanation.
4. Exact author-supplied preservation literals are deterministically added to both the reader-facing receipt and structured preservation data.
5. Common valid option shapes such as numbered, A/B, and First/Second structures are accepted.
6. The direct provider requests JSON-output mode, extracts a balanced JSON object from fenced/trailing text, and validates the result.
7. Empty, truncated, or syntactically invalid JSON receives at most one same-settings recovery attempt, with successful-attempt usage accumulated.
8. Unjudged benchmark runs can resume only failed target/task/trial cells and rescore retained responses against current checks.

None of these mechanisms exposes hidden checks or gold answers to the system under test.

## Operational reliability and cost caveat

The initial three-trial collection (`2026-07-13T19-33-56-904Z-c6e8893a`) completed 107/108 cells. Writer `harbor-revise-002`, trial 0, exhausted both provider attempts. A run-level resume (`2026-07-13T20-30-04-919Z-cb5593fc`) reran only that cell successfully. The official run then deterministically rescored the complete dataset after accepting ordinary First/Second plan labels; it made no model calls.

Three of the 36 final writer records used the internal second attempt. Including the two failed attempts from the initial collection and the two attempts used by its successful resumed replacement, the writer path made 41 provider calls for 36 scored cells. The report's token and latency totals include only successful records and therefore exclude the failed cell's original attempts. Actual provider usage was higher than the table reports.

Writer v0.1 reported 1.89 times the tokens of raw DeepSeek and 1.46 times the tokens of stock OpenCode. Its reported mean latency was similar to stock OpenCode, but the full benchmark remained slow because cells execute sequentially. Structured-output concision, failed-attempt accounting, and bounded parallel benchmark execution are follow-up engineering work.

## Interpretation

The three-trial result is strong evidence that a writer-owned task protocol makes the same model more dependable for evidence, authority, edit scope, preservation, and story-state synchronization. The positive confidence intervals exclude zero on this pilot.

It is not evidence that the contract writes better scenes or more beautiful prose. The suite has no judge or human preference layer, and deterministic checks deliberately emphasize reliability. Writer v0.1 graduates as the protocol baseline, not as a complete novelist.

## Decision and next experiment

Use Writer Task Contract v0.1 as the control protocol for **Phase 7 experiment 2: task-aware context compilation**. Compare:

1. task-supplied context under Writer Contract v0.1;
2. maximum available manuscript context;
3. a task-aware context packet containing scoped passages, temporal knowledge boundaries, dependencies, and preservation constraints.

The next experiment must retain v0.1's zero-safety target while measuring context recall, unsupported claims, token use, and latency. It should not yet add retrieval ranking, long-term memory, or critic agents; those remain later isolated experiments.

Raw records and generated reports are retained locally under `packages/writer-bench/.results/writer-contract-v01-official-20260713-133246` and its two comparison directories.
