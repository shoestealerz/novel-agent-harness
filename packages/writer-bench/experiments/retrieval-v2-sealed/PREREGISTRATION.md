# Retrieval v2 sealed-validation preregistration

Registered: 2026-07-13, before the first `glass-orchard` benchmark execution.

## Frozen systems

- Retriever implementation: commit `e4684b8a2`
- Control: hierarchical-temporal retrieval v1
- Diagnostic: coverage-temporal retrieval v2 without embeddings
- Candidate: hybrid-temporal retrieval v2 using `onnx-community/all-MiniLM-L6-v2-ONNX`
- Downstream: task-aware context compiler and Writer Contract v0.1 runtime, contract protocol 2
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096, one bounded JSON recovery attempt

The retriever, embedding model, weights, query expansion, selection logic, and temporal policy are frozen. They will not change after observing Glass Orchard. Only invalid corpus references, malformed checks, or provider/runtime failures may be corrected, and every correction will be recorded.

## Corpus and runs

- Corpus: Glass Orchard 1.0.0
- Scale: seven chapters, 56 passages, minimum 5,000 words
- Tasks: 12
- Deterministic trials: one per target
- Downstream trials: three per target
- Downstream comparison: retrieval v1 versus hybrid-temporal retrieval v2

Both deterministic and downstream runs will be recorded even if an earlier gate fails.

## Primary gates

Compared with retrieval v1, hybrid-temporal v2 must:

1. improve retrieval recall by at least 0.08;
2. not regress retrieval precision by more than 0.02;
3. retain temporal safety of 1.0000;
4. retain exactly the task-defined mean retrieval item budget;
5. avoid a downstream mean-score regression greater than 0.02;
6. have a paired 95% bootstrap lower bound no lower than -0.08;
7. avoid increasing deterministic safety failures;
8. avoid regressing grounding by more than 0.02;
9. retain unsupported-claim avoidance;
10. avoid increasing mean output tokens by more than 250.

## Graduation rule

Experiment 3 graduates only if every primary gate passes. The corpus and result become immutable after execution; human review may categorize failures but cannot change the preregistered score.
