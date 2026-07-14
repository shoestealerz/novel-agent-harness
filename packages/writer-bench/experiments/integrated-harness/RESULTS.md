# Integrated graduated-harness evaluation results

## Decision

Graduate the combined reliability architecture into the public writing-harness MVP. Writer Task Contract v0.1, task-aware controlled context, proposal-only author authority, and harness-sealed immutable proposals worked together without losing the guarantees established by their isolated experiments.

This is a development-suite reliability result. It does not establish production readiness or superior literary quality. Retrieval v2, verbose writer memory, broad semantic critics, and automatic commit remain excluded.

## Experimental controls

- Date: 2026-07-14
- Corpus: diagnosed-development Glass Orchard 1.0.0
- Tasks: 12 scoped revision jobs
- Trials: three per target, 108 completed execution cells
- Model: `deepseek-v4-pro`
- Temperature: 0.2
- Maximum output: 4096 tokens
- Context: the same task-aware packet for every target, averaging 3.5833 passages and 336.5833 words
- Controls: direct raw-model prompting and the stock OpenCode build agent
- Candidate: Writer Contract v0.1 plus a harness-owned content-addressed immutable proposal
- Judge: none; this run isolates deterministic reliability, while experiment 4 contains the directional prose-quality comparison
- Final run: `2026-07-14T01-42-13-864Z-16f7b549`

## Primary result

| Target | Completed | Mean score | Safety failures | Tokens/task | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 36/36 | 0.0000 | 216 | 2,002.2 | 24.20 s |
| Stock OpenCode | 36/36 | 0.0000 | 216 | 6,505.6 | 47.66 s |
| Integrated writer harness | 36/36 | 0.9960 | 0 | 3,814.1 | 39.31 s |

Against both controls, the candidate's paired mean delta was +0.9960 with a 95% bootstrap interval of +0.9881 to +1.0000. It won all twelve matched tasks and passed every preregistered gate.

The raw and stock targets scored zero because ordinary prose responses do not constitute a machine-applicable, source-bound proposal. Each baseline therefore failed six safety checks per cell: valid proposal envelope, source preconditions, preservation receipt, uncommitted authority, edit scope, and exact preserved literal. This result measures harness reliability, not whether the baselines can write readable prose.

## Mechanism checks

| Check | Raw | Stock OpenCode | Integrated |
| --- | ---: | ---: | ---: |
| Proposal validity | 0.0000 | 0.0000 | 1.0000 |
| Source preconditions | 0.0000 | 0.0000 | 1.0000 |
| Preservation receipts | 0.0000 | 0.0000 | 1.0000 |
| Uncommitted authority | 0.0000 | 0.0000 | 1.0000 |
| Mean context words | 336.5833 | 336.5833 | 336.5833 |

One integrated cell, `proposal-revise-009` trial 1, produced a replacement outside the requested non-safety word-count band. Its cell score was 0.8571. It still passed every safety and proposal-integrity check. The remaining 35 integrated cells scored 1.0000.

## Cost and latency

The integrated target used 90% more tokens and took 15.11 seconds longer per cell than raw prompting. It used 41% fewer tokens and completed 8.35 seconds faster than stock OpenCode in this run. These figures include model generation and adapter overhead; local proposal validation and hashing are negligible.

The comparison should not be interpreted as a general OpenCode performance benchmark. Stock OpenCode's coding-oriented system behavior is deliberately mismatched to the writing task, and provider-reported cost was not consistently available across all three adapters.

## Runtime disclosures

The first full run (`2026-07-14T01-28-06-954Z-3308c4cf`) completed 107/108 cells. One stock OpenCode execution emitted no completed text event. The final run preserved those 107 records and regenerated only the missing stock cell, completing 108/108. No prompt, task, context packet, model setting, gate, or scoring rule changed.

## What graduates

The MVP should retain:

- a thin writer layer over the generic OpenCode runtime;
- typed job contracts for Explain, Diagnose, Plan, and scoped Revise;
- task-aware context packets with explicit focus, dependency, preservation, and temporal boundaries;
- proposal-only editing by default;
- harness-owned source hashes, content addresses, preservation receipts, and deterministic validation;
- an explicit author-confirmed commit operation that rechecks base hashes.

It should not yet include the experimental semantic retriever, verbose transcript memory, broad automatic critic, or automatic manuscript mutation.

## Next step

Phase 8 is implementation of the public writing-harness MVP. The first vertical slice should load a Git-backed novel workspace, compile a scoped revision packet, generate and validate an immutable proposal, render its diff, and commit only after explicit author confirmation and a fresh base-hash check.
