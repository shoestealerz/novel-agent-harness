# Harbor Light DeepSeek experiments

Status: **Phase 6 baseline complete; Writer Task Contract v0 experiment ready**.

This experiment compares the same model through direct prompting and stock OpenCode. It does not evaluate a writer-specific harness yet.

## Readiness

Run:

```sh
bun run baseline:doctor
```

The doctor reports only presence/readiness and never prints credential values.

The DeepSeek experiments use `deepseek-v4-pro` through the direct API, stock OpenCode, and writer-specific targets. The checked-in configuration contains no credentials. The machine needs:

1. an installed `opencode` executable or `WRITER_BENCH_OPENCODE_BIN` path;
2. a provider configured for OpenCode;
3. a DeepSeek API key supplied at run time;
4. `WRITER_BENCH_MODEL` and `WRITER_BENCH_OPENCODE_MODEL` pointing to the same model revision;
5. `WRITER_BENCH_BASE_URL` and either `DEEPSEEK_API_KEY` or `WRITER_BENCH_API_KEY`;
6. optionally, a distinct `WRITER_BENCH_JUDGE_MODEL`.

Do not commit `targets.local.json`, credentials, or provider auth files.

## DeepSeek quick start

From PowerShell, run:

```powershell
.\baseline\run-deepseek.ps1
```

If `DEEPSEEK_API_KEY` is not already set, the launcher opens a masked credential prompt and keeps the key only for the process. The default is one trial: 24 paid system executions across 12 tasks and two targets. After that succeeds, run the planned baseline with:

```powershell
.\baseline\run-deepseek.ps1 -Trials 3
```

The full pilot makes 72 paid system executions. The launcher does not configure a model judge: deterministic checks and human review remain independent of DeepSeek for this baseline.

The launcher pins temperature `0.2` and a 4096-token output ceiling on both paths. It restores every environment variable it changes when the run ends.

Stock OpenCode runs in a fresh temporary workspace outside the benchmark repository. It receives the same task-provided passages as the raw target but cannot discover corpus files, hidden checks, gold annotations, or benchmark implementation details through filesystem tools.

The noninteractive stock agent denies external-directory and question permissions instead of pausing for user approval. Each task is capped at 12 provider turns and a five-minute process timeout to bound latency and cost while retaining OpenCode's normal tool loop inside the isolated workspace.

## Writer Task Contract v0

Run the first Phase 7 experiment with:

```powershell
.\baseline\run-deepseek.ps1 -Experiment writer-contract -Trials 1
```

This runs 36 paid executions: raw DeepSeek, stock OpenCode, and Writer Task Contract v0 across all 12 tasks. It generates comparisons against both baselines. The writer target changes only the task contract and structured response adapter; it does not add retrieval, memory, critic agents, or OpenCode core changes.

## Configure another provider

Copy `../fixtures/targets.real.example.json` to `targets.local.json`, which is ignored by Git. Replace every placeholder. Both systems must use the same `comparisonKey`.

Recommended inference policy for the pilot:

```text
trials: 3
temperature: 0.2
maximum output: 4096 tokens
seed: fixed if supported, otherwise record unsupported
```

## Manual run

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
