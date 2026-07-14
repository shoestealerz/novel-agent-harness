# Retrieval held-out preregistration

Registered: 2026-07-13, before the first `quiet-meridian` benchmark execution.

## Frozen system

- Retriever implementation: commit `394884ec7d49905f60a48f5a93f6b6683d2b9d7a`
- Candidate: hierarchical passage/scene ranking with public writing-concept expansion, anchor-neighbor scoring, explicit-reference handling, and story-time filtering
- Control: BM25-style lexical passage retrieval
- Downstream: task-aware context compiler and Writer Contract v0.1 runtime, contract protocol 2
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096, one bounded JSON recovery attempt

The retriever will not be changed after observing Quiet Meridian results. Only invalid corpus references/checks, parser errors, or provider/runtime failures may be corrected, and every correction must be recorded.

## Corpus and runs

- Corpus: Quiet Meridian 1.0.0
- Scale: eight chapters, 64 passages, minimum 5,000 words
- Tasks: 12
- Deterministic trials: one per target
- Downstream trials: three per target
- Downstream comparison targets: lexical and hierarchical-temporal; plain hierarchy remains a diagnostic target in the deterministic run

## Primary gates

Compared with lexical retrieval, hierarchical-temporal retrieval must:

1. improve retrieval recall by at least 0.10;
2. not regress retrieval precision by more than 0.02;
3. improve temporal safety by at least 0.15;
4. retain exactly the same mean retrieval item budget;
5. avoid a downstream mean-score regression greater than 0.02;
6. avoid increasing deterministic safety failures;
7. avoid regressing grounding by more than 0.02;
8. retain unsupported-claim avoidance;
9. avoid increasing mean output tokens by more than 250.

## Graduation rule

Experiment 3 graduates only if all primary gates pass and temporal safety is 1.0000. A failure is recorded without retriever tuning. Human review is limited to confirming check validity and categorizing failures; it cannot change the preregistered score.
