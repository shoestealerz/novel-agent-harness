# Harbor Light baseline results

Status: official three-trial Phase 6 baseline complete.

## Configuration

| Field | Value |
| --- | --- |
| Run ID | `2026-07-13T06-57-36-189Z-89945e61` |
| Base model | DeepSeek V4 Pro (`deepseek-v4-pro`) |
| Direct endpoint | `https://api.deepseek.com` |
| OpenCode model | `deepseek/deepseek-v4-pro` |
| OpenCode version | `1.17.18` |
| Baseline configuration commit | `d40851f6c44d9d45b42e1cc0dd81a45f0ab995b3` |
| Temperature | 0.2 |
| Maximum output | 4096 tokens |
| OpenCode agent limit | 12 provider turns; 300-second process timeout |
| OpenCode workspace | isolated temporary directory; external access denied |
| Trials | 3 |
| Judge model | none |

## Official baseline

| Target | Completed | Mean score | Safety failures | Input tokens | Output tokens | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 36/36 | 0.7361 | 19 | 5,931 | 43,641 | 23.1 s |
| Stock OpenCode | 36/36 | 0.6620 | 27 | 30,156 | 20,205 | 22.1 s |

Paired mean delta for stock OpenCode versus raw DeepSeek: **-0.0741**, with a paired bootstrap 95% confidence interval of **-0.1481 to -0.0069**. Task outcomes were 1 win, 7 ties, and 4 losses. All regression gates failed. Stock OpenCode reported $0.0518 of model cost; the direct adapter does not yet calculate provider-specific cost.

The negative interval excludes zero on this pilot: wrapping DeepSeek V4 Pro in unmodified OpenCode is a measurable regression for these writing tasks. This is the official Phase 6 baseline against which writer-specific experiments will be compared.

### Mean task deltas

| Task | Stock minus raw |
| --- | ---: |
| `harbor-plan-001` | +0.083 |
| `harbor-diagnose-003` | -0.222 |
| `harbor-revise-001` | -0.333 |
| `harbor-sync-001` | -0.167 |
| `harbor-sync-002` | -0.250 |
| Remaining seven tasks | 0.000 |

## Manual review

The stable stock-OpenCode losses exposed coding-harness behavior that the writer layer must correct:

1. `harbor-diagnose-003`: OpenCode ignored the supplied passages and reported that the isolated workspace had no manuscript files.
2. `harbor-explain-002`: the answer was substantively accurate but omitted required passage citations.
3. `harbor-revise-001`: free-form answers could not reliably express an immutable scoped proposal or preservation receipt.
4. `harbor-sync-002`: OpenCode invented a workspace file proposal and omitted the required evidence citation instead of returning the requested knowledge-state update directly.

Stock OpenCode won only `harbor-plan-001`, suggesting that a coding agent loop can help with planning but is harmful when evidence, scope, or state synchronization must be exact. The raw and stock targets both failed several structured edit/state checks because both currently convert free-form text into plain artifacts. That shared limitation is a primary target for the writer-specific task-contract and proposal experiments.

## Operational findings

- OpenCode must run outside the benchmark repository; otherwise its coding tools can discover corpus and benchmark files beyond task-provided context.
- Noninteractive runs must deny external-directory and question permissions instead of waiting for approval.
- The original eight-turn and 120-second limits produced only 10/12 stock completions. Twelve turns and 300 seconds produced 12/12.

Raw records and generated reports are retained locally under `.results/deepseek-baseline-20260712-235735`. The next experiment adds Writer Task Contract v0 as a third target and compares it against both official baselines.

## Smoke-run history

The preceding one-trial smoke run (`2026-07-13T06-27-11-317Z-da5447fb`) completed 24/24 executions. Raw DeepSeek scored 0.7847 and stock OpenCode scored 0.6319, a -0.1528 delta. Its findings were directionally consistent with the official run and were used to validate isolation, permissions, and execution limits.
