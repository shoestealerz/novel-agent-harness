# Retrieval v2 development experiment

Status: **development design frozen; sealed validation next**.

Retrieval v1 passed its Harbor Light development gates but failed preregistered validation on Quiet Meridian. This experiment treats both novels as development data and addresses the diagnosed failures without altering the validated story-time cutoff.

The candidate adds:

1. query decomposition into independently scored writing facets;
2. lightweight entity and anchor-relation evidence;
3. coverage-aware selection that reduces redundant scene neighbors;
4. an optional local semantic ranker using `onnx-community/all-MiniLM-L6-v2-ONNX` through Transformers.js;
5. the existing hard temporal boundary as an invariant.

`retrieval-v2-coverage` is the deterministic, dependency-free strategy. `retrieval-v2` combines that score with normalized embedding similarity. Model outputs are not involved in either evaluation: the tasks contain hidden evaluator-side relevance labels, and the retriever sees only the author request and public retrieval specification.

Run both development corpora and their regression gates:

```powershell
powershell -ExecutionPolicy Bypass -File .\experiments\retrieval-v2\run.ps1
```

The first run downloads the Apache-2.0 ONNX model to the Transformers.js cache. Set `WRITER_BENCH_EMBEDDING_CACHE_DIR` to control that location. See [RESULTS.md](RESULTS.md) for the frozen development result and discarded iterations.
