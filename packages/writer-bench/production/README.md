# Production Writer evaluation

This directory is the repeatable release evaluation for the shipped `opencode writer` command. Unlike the Phase 7 integrated experiment, the `production-writer` target creates an isolated novel workspace for every cell and launches the public CLI in a separate process. The adapter records the CLI session, structured artifacts, token usage, cost, latency, and failures using the normal Writer Harness Bench protocol.

## Preregistered pilot

The first production run uses the nine Explain, Diagnose, Plan, and Revise tasks in the Harbor Light pilot. Brainstorm, Synchronize, Generate, and Translate remain outside the MVP and must not be silently routed through a different job.

Run each comparison with the same pinned model and inference configuration:

1. direct raw model versus production Writer;
2. stock OpenCode versus production Writer;
3. three trials per target;
4. deterministic safety checks remain release-blocking;
5. retain the complete run and comparison directories.

Before running, copy `targets.example.json`, replace `SET_MODEL_ID` and `SET_COMPARISON_KEY`, and configure the provider variables described in `../TARGETS.md`. `WRITER_BENCH_OPENCODE_MODEL` must be the same model revision as `WRITER_BENCH_MODEL`. The production adapter launches `opencode` by default. To use another installed command, set `WRITER_BENCH_OPENCODE_BIN`; to include command-prefix arguments, set `WRITER_BENCH_WRITER_COMMAND` to a JSON string array.

From `packages/writer-bench`:

```sh
node --experimental-strip-types src/cli.ts run \
  --suite corpora/harbor-light/tasks/pilot.jsonl \
  --targets production/targets.json \
  --out .results/production-raw \
  --trials 3 \
  --target raw-model \
  --target production-writer \
  --task harbor-explain-001 \
  --task harbor-explain-002 \
  --task harbor-diagnose-001 \
  --task harbor-diagnose-002 \
  --task harbor-diagnose-003 \
  --task harbor-plan-001 \
  --task harbor-plan-002 \
  --task harbor-revise-001 \
  --task harbor-revise-002

node --experimental-strip-types src/cli.ts compare \
  --run .results/production-raw/run.json \
  --baseline raw-model \
  --candidate production-writer \
  --gates production/gates.json \
  --out .results/production-raw-comparison
```

Repeat with `stock-opencode` as the baseline. If a run is interrupted, pass `--resume <prior-run.json>`; completed cells are reused only when task versions, trials, target identity, base model, and comparison key still match.

## Release gates

The preregistered pilot requires no mean-score regression, no candidate safety failures, and no increase in safety failures. Process-restart session recovery, stale-proposal rejection, model-configuration failure, and Windows/Linux behavior are deterministic CI gates and are not inferred from model scores.

Do not claim broad literary-quality improvement from this pilot. A production-quality claim also requires the larger Phase 9 corpus and blinded human review.
