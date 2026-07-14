# Retrieval experiment

Status: **development experiment complete; held-out validation next**.

This experiment keeps Writer Contract v0.1 and the graduated task-aware context compiler fixed. A retriever must discover candidate manuscript references from the author request and public task boundary, after which the compiler assigns packet roles and renders exact passages.

Initial runnable strategies:

1. BM25-style lexical passage retrieval;
2. hierarchical retrieval that mixes passage and scene relevance, expands a small set of writing concepts, honors explicit references, and scores adjacent anchor context;
3. the same hierarchical retrieval with a hard story-time cutoff.

An OpenAI-compatible embedding seam is implemented but not included in results until a real embedding model, endpoint, revision, and cost policy are configured. DeepSeek's current public model list exposes V4 chat models but no embedding model.

Hidden task metadata contains only evaluator-side relevance labels. Targets receive the author prompt, top-K budget, public focus/preservation declarations, and optional temporal boundary; they never receive required or relevant references.

Run the complete experiment, including deterministic retrieval, DeepSeek downstream execution, and both regression comparisons:

```powershell
powershell -ExecutionPolicy Bypass -File .\experiments\retrieval\run.ps1
```

Run retrieval without model calls:

```sh
bun src/cli.ts run \
  --suite corpora/harbor-light/tasks/retrieval.jsonl \
  --targets experiments/retrieval/targets.retrieval-only.json \
  --out .results/retrieval-validity \
  --trials 1 \
  --concurrency 3
```

The first completed development result is recorded in [RESULTS.md](RESULTS.md). Harbor Light is a development corpus: it is appropriate for implementation feedback and regression gates, but not for a generalization claim. The next scientific step is a sealed, held-out manuscript suite whose relevance labels are not inspected during retriever development.
