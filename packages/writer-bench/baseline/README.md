# Phase 6: Harbor Light baseline

Status: **blocked on local provider configuration**.

This experiment compares the same model through direct prompting and stock OpenCode. It does not evaluate a writer-specific harness yet.

## Readiness

Run:

```sh
bun run baseline:doctor
```

The doctor reports only presence/readiness and never prints credential values.

The current machine needs:

1. an installed `opencode` executable or `WRITER_BENCH_OPENCODE_BIN` path;
2. a provider configured for OpenCode;
3. `WRITER_BENCH_MODEL` for the OpenAI-compatible target;
4. `WRITER_BENCH_OPENCODE_MODEL` pointing to the same model revision;
5. `WRITER_BENCH_BASE_URL` and, when required, `WRITER_BENCH_API_KEY`;
6. optionally, a distinct `WRITER_BENCH_JUDGE_MODEL`.

Do not commit `targets.local.json`, credentials, or provider auth files.

## Configure

Copy `../fixtures/targets.real.example.json` to `targets.local.json`, which is ignored by Git. Replace every placeholder. Both systems must use the same `comparisonKey`.

Recommended inference policy for the pilot:

```text
trials: 3
temperature: 0.2
maximum output: 4096 tokens
seed: fixed if supported, otherwise record unsupported
```

## Run

From `packages/writer-bench`:

```sh
bun src/cli.ts run \
  --suite corpora/harbor-light/tasks/pilot.jsonl \
  --targets baseline/targets.local.json \
  --out .results/harbor-baseline \
  --trials 3
```

Then compare:

```sh
bun src/cli.ts compare \
  --run .results/harbor-baseline/run.json \
  --baseline raw-model \
  --candidate stock-opencode \
  --gates baseline/gates.json \
  --out .results/harbor-baseline-comparison
```

## Review

The comparison is a baseline characterization, not an expected OpenCode win. Review:

- completion and execution errors;
- evidence citation precision and recall;
- planted key-location error detection;
- false positives on sea color, appointed-keeper wording, and Orin's identity;
- scoped-revision proposal behavior;
- planning and prose preference;
- cost and latency;
- trial variance;
- judge rationales and at least a small blinded human sample.

Record the exact model identifiers, endpoint implementation, OpenCode commit, target-renderer commit, and run ID in `RESULTS.md` after the run.
