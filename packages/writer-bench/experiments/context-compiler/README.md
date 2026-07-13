# Task-aware context compiler experiment

Status: **graduated as the declarative context-packet baseline**. See [RESULTS.md](RESULTS.md).

This experiment keeps DeepSeek V4 Pro, Writer Task Contract v0.1, temperature, and output budget fixed. It changes only how public manuscript context is assembled:

1. `writer-context-supplied` receives only the context attached to the author task.
2. `writer-context-maximum` receives all 32 Harbor Light manuscript passages.
3. `writer-context-compiled` receives a deterministic packet assembled from public focus, dependency, preservation, exclusion, and story-time declarations.

The compiler deliberately does not perform lexical search, embedding retrieval, model-authored query expansion, long-term memory, or critic review. Those mechanisms remain separate experiments.

Every target emits a context trace containing supplied, selected, and excluded references plus packet item and word counts. Writer Harness Bench promotes labeled deterministic checks and operational traces into comparable metrics for context recall, citation grounding, unsupported-claim avoidance, context words, provider input tokens, and latency.

Run the seven context stress tasks first:

```powershell
./experiments/context-compiler/run.ps1 -Trials 1 -ContextOnly
```

Run the context suite together with the 12-task Writer Contract regression suite when changing the no-op path or shared writer runtime:

```powershell
./experiments/context-compiler/run.ps1 -Trials 3 -Concurrency 3
```

The graduated result improves missing-context recall over supplied context, retains zero safety failures, and exceeds maximum-context reliability with materially less context. It does not establish automated retrieval quality or literary preference.
