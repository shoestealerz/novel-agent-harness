# Writer Harness Bench

Writer Harness Bench is a harness-neutral evaluation runner for long-form fiction agents. It answers a narrower question than a model leaderboard:

> Does a candidate harness improve the same base model on authoring tasks without regressing continuity, author intent, scope safety, or established writing benchmarks?

The package is independent of OpenCode's runtime. A target is any command that accepts one JSON request on stdin and returns one JSON response on stdout. This makes raw model wrappers, generic agents, writer agents, and competing harnesses directly comparable.

## What is included

- A versioned JSONL task format for explanation, diagnosis, brainstorming, planning, revision, story-state synchronization, generation, and translation.
- Deterministic checks for required/forbidden content, word count, finding recall, evidence quality, and edit scope.
- Optional rubric evaluation by a separately configured judge target.
- Multi-trial execution with captured usage, latency, cost, errors, and raw artifacts.
- Paired baseline/candidate comparison with a deterministic 95% bootstrap confidence interval.
- Hard regression gates, including per-suite gates and zero-tolerance safety checks.
- Importers for WritingBench JSONL and ConStory-Bench prompt exports.
- Real adapters for an OpenAI-compatible raw model and stock non-interactive OpenCode.
- A production adapter that executes the shipped `opencode writer` CLI in a fresh isolated novel workspace per benchmark cell.
- A small native smoke suite that demonstrates evidence, intentional exceptions, scoped revision, and causal planning.
- A validated synthetic pilot corpus, `Harbor Light`, with stable passages, gold story state, planted defects, deliberate exceptions, twelve protocol tasks, and seven context stress tasks.
- A preregistered Alpha 3 book-scale program covering a 30,000–50,000-word synthetic novella, 132 native tasks, operational dogfooding, same-model controls, and blinded human review. See [`experiments/book-scale-alpha3/PREREGISTRATION.md`](experiments/book-scale-alpha3/PREREGISTRATION.md).

The smoke suite verifies the runner. It is not the finished research corpus.

See [TARGETS.md](TARGETS.md) to configure the first real raw-model versus stock-OpenCode run.
See [production/README.md](production/README.md) for the preregistered production Writer comparison and release gates.

Validate the pilot corpus with:

```sh
bun run corpus:validate
```

## Quick start

From this package directory:

```sh
node --experimental-strip-types src/cli.ts doctor
node --experimental-strip-types src/cli.ts run \
  --suite fixtures/smoke.jsonl \
  --targets fixtures/targets.json \
  --out .results/smoke \
  --trials 3
node --experimental-strip-types src/cli.ts compare \
  --run .results/smoke/run.json \
  --baseline raw-model \
  --candidate writer-harness \
  --gates fixtures/gates.json \
  --out .results/smoke-comparison
```

The comparison exits nonzero when a gate fails, so the same command can run in CI.

## Target protocol

The runner starts the target once per task/trial. The target reads an `ExecutionRequest` from stdin:

```json
{
  "protocolVersion": 1,
  "kind": "execute",
  "runId": "...",
  "trial": 0,
  "task": {
    "id": "whb-explain-001",
    "job": "explain",
    "prompt": "What does Mara know?",
    "context": [{ "ref": "ch01:p4", "text": "..." }]
  }
}
```

It returns:

```json
{
  "protocolVersion": 1,
  "taskId": "whb-explain-001",
  "text": "...",
  "artifacts": {
    "findings": [{ "id": "key-location", "evidence": ["ch02:p2", "ch05:p9"] }],
    "evidence": ["ch01:p4"],
    "edits": [{ "target": "ch04:s7:p1", "replacement": "..." }]
  },
  "usage": { "inputTokens": 1000, "outputTokens": 300, "costUsd": 0.01 }
}
```

Judge targets use the same transport with `kind: "judge"` and return normalized criterion scores from 0 to 1. Deterministic checks do not depend on the judge.

## Fair comparisons

Set the same `comparisonKey` on baseline and candidate targets. A useful key includes model version, inference settings, and prompt-policy revision. The comparison command refuses mismatched keys by default. This prevents a model upgrade from being mislabeled as a harness improvement.

Recommended target set:

1. raw model with the task prompt;
2. raw model with maximum available manuscript context;
3. stock/general agent harness;
4. candidate writer harness.

Use at least three trials for stochastic systems. Preserve every raw response and judge rationale.

## External benchmarks

Datasets are not vendored. Pin their upstream revision and retain their license and provenance in run metadata.

### WritingBench

Clone the Apache-2.0 upstream repository, then import the creative subset:

```sh
node --experimental-strip-types src/cli.ts import writingbench \
  --source ../WritingBench/benchmark_query/benchmark_all.jsonl \
  --domain "Literature & Arts" \
  --language en \
  --out external/writingbench-literature-en.jsonl
```

The importer preserves the query and instance-specific criteria. Configure a judge that implements the official WritingBench evaluation policy when leaderboard comparability matters.

### ConStory-Bench

ConStory-Bench publishes `prompts.parquet` under MIT. Export the required rows to JSONL with the official Python environment, then import them:

```sh
node --experimental-strip-types src/cli.ts import constory \
  --source external/constory-prompts.jsonl \
  --language en \
  --out external/constory-en.jsonl
```

The expected fields are `id`, `language`, `task_type`, and `prompt`. Run the official ConStory-Checker over generated stories when reporting its CED/GRR metrics. The generic five-criterion mapping is useful for local regression runs but must not be presented as an official ConStory score.

### Other suites

- Use FABLES tasks for book comprehension and summary faithfulness after confirming dataset terms.
- Use LongStoryEval's criteria structure for whole-book human review; do not copy newly published books into this repository.
- Use LitBench reward models only as secondary judges because published agreement with human preference is imperfect.
- NC Bench is highly relevant to editing and assistant workflows, but it is early access and does not currently expose a stable public dataset adapter.

## Result files

Each run writes:

- `run.json`: complete, self-contained run record;
- `records.jsonl`: stream-friendly per-attempt records;
- `summary.json`: target-level score, safety, cost, and reliability summary;
- `report.md`: human-readable run summary.

Comparison writes `comparison.json` and `comparison.md`. CI should retain both run directories as artifacts.

## Attach official benchmark metrics

Some upstream evaluators produce their own authoritative metrics. Attach those results to the same run instead of replacing them with a generic judge:

```sh
node --experimental-strip-types src/cli.ts attach-metrics \
  --run .results/full/run.json \
  --source official-metrics.jsonl \
  --out .results/full/run-with-metrics.json
```

Each JSONL record names the target, suite, metric, value, direction (`higher` or `lower`), and source. Add gates using `suite:metric` keys:

```json
{
  "externalMetrics": {
    "constory-bench:ced": { "maxRegression": 0 },
    "writingbench:official-score": { "maxRegression": 0.02 }
  }
}
```

The comparison report then shows native scores and official external metrics together, while retaining their distinct scales and directions.
