# Harbor Light baseline results

Status: one-trial smoke baseline complete; three-trial baseline pending.

## Configuration

| Field | Value |
| --- | --- |
| Run ID | `2026-07-13T06-27-11-317Z-da5447fb` |
| Base model | DeepSeek V4 Pro (`deepseek-v4-pro`) |
| Direct endpoint | `https://api.deepseek.com` |
| OpenCode model | `deepseek/deepseek-v4-pro` |
| OpenCode version | `1.17.18` |
| Baseline configuration commit | `74e515921fdebeeac90295a6f67a8f7efbed34d8` |
| Temperature | 0.2 |
| Maximum output | 4096 tokens |
| OpenCode agent limit | 12 provider turns; 300-second process timeout |
| OpenCode workspace | isolated temporary directory; external access denied |
| Trials | 1 smoke trial; 3 still planned |
| Judge model | none |

## Smoke results

| Target | Completed | Mean score | Safety failures | Input tokens | Output tokens | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 12/12 | 0.7847 | 6 | 1,977 | 11,995 | 17.2 s |
| Stock OpenCode | 12/12 | 0.6319 | 9 | 17,029 | 6,919 | 26.8 s |

Paired mean delta for stock OpenCode versus raw DeepSeek: **-0.1528**, with a one-trial paired bootstrap 95% confidence interval of **-0.2917 to -0.0417**. Task outcomes were 0 wins, 8 ties, and 4 losses. All regression gates failed. Stock OpenCode reported $0.0232 of model cost; the direct adapter does not yet calculate provider-specific cost. The DeepSeek account balance decreased by approximately $0.22 across connectivity verification, two aborted integrity/limit probes, and the successful smoke run; $4.31 remained afterward.

This is a smoke characterization, not the Phase 6 final baseline. One trial is insufficient for variance estimates or a go/no-go product claim.

## Manual review

The four stock-OpenCode losses exposed coding-harness behavior that the writer layer must correct:

1. `harbor-diagnose-003`: OpenCode ignored the supplied passages and reported that the isolated workspace had no manuscript files.
2. `harbor-explain-002`: the answer was substantively accurate but omitted required passage citations.
3. `harbor-revise-002`: the revision exceeded the requested word limit and the plain artifact adapter could not represent an immutable scoped proposal.
4. `harbor-sync-002`: OpenCode invented a workspace file proposal and omitted the required evidence citation instead of returning the requested knowledge-state update directly.

The raw and stock targets both failed several structured edit/state checks because both currently convert free-form text into plain artifacts. That shared limitation is a primary target for the writer-specific task-contract and proposal experiments.

## Operational findings

- OpenCode must run outside the benchmark repository; otherwise its coding tools can discover corpus and benchmark files beyond task-provided context.
- Noninteractive runs must deny external-directory and question permissions instead of waiting for approval.
- The original eight-turn and 120-second limits produced only 10/12 stock completions. Twelve turns and 300 seconds produced 12/12.

Raw records and generated reports are retained locally under `.results/deepseek-baseline-20260712-232710`. The next run is the three-trial baseline using this exact configuration, followed by blinded manual review.
