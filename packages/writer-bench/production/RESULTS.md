# Production Writer alpha-release results

## Decision

The production Novel Agent Harness passed both preregistered alpha-release comparisons on July 15, 2026. All 81 executions completed, the production Writer had zero deterministic safety failures, and it improved the paired mean against both raw DeepSeek V4 Pro and stock OpenCode using the same model and inference settings.

This result supports releasing the source-distributed MVP alpha. It is evidence of better task-contract reliability, context control, scoped revision, and author-safety behavior on the Harbor Light pilot. It is not a claim that the harness universally improves literary quality.

## Configuration

- Harness commit: `9be7d5eff3e5ed31ae2be74bb0f1d916a0570ba2`
- Corpus: Harbor Light `0.4.4`
- Pilot suite: `0.2.4`
- Model: `deepseek-v4-pro`
- Temperature: `0.2`
- Maximum output: `16,384` tokens
- Targets: raw model, stock OpenCode, and production Writer
- Tasks: nine supported Explain, Diagnose, Plan, and scoped Revise tasks
- Trials: three per target and task
- Concurrency: three
- Total executions: 81

The run was launched with:

```powershell
./production/run-deepseek.ps1 -Trials 3
```

## Run summary

| Target | Completed | Mean score | Safety failures | Total tokens | Recorded cost | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 27/27 | 0.6667 | 18 | 44,720 | $0.0000 | 23.5 s |
| Stock OpenCode | 27/27 | 0.5139 | 25 | 33,676 | $0.0472 | 25.8 s |
| Production Writer | 27/27 | **0.9815** | **0** | 420,877 | $0.1444 | 62.1 s |

The raw adapter did not report a dollar price, so its recorded zero must not be interpreted as a free or directly cost-comparable run. The production Writer currently spends substantially more tokens and time because it performs context selection and structured validation; cost and latency optimization remain post-alpha work.

## Release comparisons

| Baseline | Candidate delta | 95% paired bootstrap CI | Win / tie / loss | Baseline safety | Candidate safety | Decision |
| --- | ---: | --- | --- | ---: | ---: | --- |
| Raw DeepSeek | **+0.3148** | +0.0556 to +0.6296 | 4 / 4 / 1 | 18 | **0** | **PASS** |
| Stock OpenCode | **+0.4676** | +0.2454 to +0.7037 | 7 / 2 / 0 | 25 | **0** | **PASS** |

Both comparisons passed every preregistered gate:

- no mean regression;
- zero candidate safety failures;
- no safety-failure increase;
- identical model comparison keys.

## Reliability work validated by this run

Earlier exploratory runs exposed provider-format and concurrency failures rather than unsafe accepted outputs. Before this authoritative run, the harness was hardened to:

- retry missing structured output explicitly;
- retry semantic Writer-contract violations at most twice, then fail closed;
- canonicalize safe singleton and comma-delimited stable-reference lists from non-strict providers;
- repair contradictory context selections without admitting passages beyond the declared boundary;
- constrain evidence and edit targets to the selected references in the generated schema;
- isolate every production cell in its own OpenCode database;
- account for selector usage in the final token and cost totals.

The final 81-cell run had no execution failures, database locks, unsupported evidence, invalid context packets, out-of-scope edits, or deterministic safety failures.

## Evaluation audit

Harbor Light `0.4.4` and suite `0.2.4` were versioned before this authoritative run. They corrected an exploratory-run false negative by evaluating affirmative closed-door preservation across the complete structured response and accepting equivalent continuous wording. Earlier results are not mixed with this suite version.

One production answer in the authoritative run received 0.5 because the non-safety `two-options` expression recognized `Structure A/B` and `Option A/B` but not the answer's `Plan A/B` labels. Inspection confirmed that the answer contained two distinct plans with gains and losses and preserved both ending constraints. This post-run observation was not used to alter or rescore suite `0.2.4`; it is retained as a future benchmark-calibration item. The release decision does not depend on it because the candidate still passed both preregistered comparisons and every safety gate.

## Artifacts

The complete local run and generated comparisons are retained at:

- `.results/production-deepseek-20260715-145240`
- `.results/production-deepseek-20260715-145240-vs-raw`
- `.results/production-deepseek-20260715-145240-vs-stock`

The immutable run ID is `2026-07-15T21-52-40-674Z-abbb5646`.
