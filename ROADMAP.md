# Novel Agent Harness Roadmap

Last updated: 2026-07-12

## Current position

The project is in **Phase 6: establish real baselines**.

```text
Research and architecture                   complete
OpenCode runtime audit                      complete
Benchmark runner and regression gates       complete
Pilot fiction corpus and gold annotations   complete
Raw-model and stock-OpenCode adapters        complete
Real raw-model vs stock-OpenCode baseline    active
Writer-specific experiments                 not started
Public writing harness MVP                  not started
Production benchmark expansion              not started
Private web application                     deferred
```

## Principles

1. Use the same base model and inference settings when attributing a difference to the harness.
2. Keep hidden checks, gold answers, and private evaluation metadata away from systems under test.
3. Treat deterministic safety failures as release gates even when subjective quality improves.
4. Preserve author authority: analysis and immutable proposals precede commit.
5. Add OpenCode core modifications only when a measured experiment demonstrates a missing extension point.
6. Do not make creative-quality claims from model judges alone; use blinded human review for consequential comparisons.

## Completed phases

### Phase 1: Product and harness research

Defined the authoring jobs, quality bar, agency requirements, narrative-state needs, reversibility rules, and evaluation dimensions for a novel-writing harness.

Deliverable: `WRITER_HARNESS_RESEARCH.md`.

### Phase 2: OpenCode audit

Traced sessions, prompt admission, execution, events, tools, permissions, context, compaction, persistence, project identity, and snapshots. Chose a thin writer layer over a deep OpenCode rewrite.

Decision: preserve the generic runtime; use a small adapter and patch only proven extension gaps.

### Phase 3: Benchmark infrastructure

Implemented Writer Harness Bench with versioned tasks, command targets, deterministic checks, optional judges, multi-trial runs, paired confidence intervals, cost/latency reporting, external metrics, regression gates, reports, and CI.

### Phase 4: Pilot benchmark corpus

Created `Harbor Light`, a synthetic CC0 pilot containing 2,527 words, 32 stable passages, 41 gold records, 12 tasks, one planted defect, and deliberate ambiguity/motif exceptions.

### Phase 5: Real evaluation targets

Implemented an OpenAI-compatible direct-model adapter and a stock OpenCode non-interactive adapter. Isolated hidden evaluation material from both targets.

## Active phase

### Phase 6: Establish real baselines

Goal: measure the same model under direct prompting and unmodified OpenCode before introducing writer-specific behavior.

Required matrix:

| Target | Context | Runtime |
| --- | --- | --- |
| `raw-model` | Task-provided passages | Direct OpenAI-compatible call |
| `stock-opencode` | Identical task-provided passages | Unmodified OpenCode primary agent |

Protocol:

- Harbor Light 12-task pilot suite;
- three trials per target;
- identical base-model revision, temperature, seed policy, and output budget;
- independent judge model for subjective criteria where practical;
- deterministic checks remain authoritative;
- retain raw records, summaries, comparisons, costs, and judge rationales.

Exit criteria:

1. At least 95% execution completion.
2. No candidate edit-scope or authority violations.
3. No material regression hidden by aggregate score.
4. Manual review confirms that intentional exceptions are scored correctly.
5. Variance and cost are understood well enough to set production thresholds.

Current status: DeepSeek V4 Pro and OpenCode 1.17.18 are configured. A one-trial smoke baseline completed 24/24 executions and exposed a significant stock-OpenCode regression. The full three-trial run, independent review, and production gate calibration remain before Phase 6 exits. See `packages/writer-bench/baseline/RESULTS.md`.

## Next phases

### Phase 7: Writer-specific experiments

Run isolated experiments in this order:

1. task contract versus unstructured instruction;
2. task-aware context compilation versus supplied/maximum context;
3. lexical/embedding retrieval versus hierarchical and temporal retrieval;
4. free-form prose versus immutable structured proposals;
5. writer-aware context reconstruction versus coding compaction;
6. deterministic validation versus optional critic agents.

Each mechanism must beat the Phase 6 baselines on its intended metrics without violating reliability gates.

### Phase 8: Public writing harness MVP

Build an embedded writer runtime around OpenCode with writer-owned contracts, narrative tools, story-state service, Git-backed novel workspaces, proposal review, and commit receipts.

Initial supported jobs: Explain, Diagnose, Plan, and scoped Revise.

### Phase 9: Production benchmark expansion

Expand the permissioned/synthetic corpus to 30,000–50,000 words and approximately 120–200 tasks. Add larger external benchmark subsets and blinded human evaluation.

### Phase 10: Private web application

Build the private UI only after the harness protocol stabilizes: agent chat, manuscript navigation, passage citations, chapter diffs, proposal review, character/timeline/arc views, and reversible commit history.

## Pull-request history

- PR #1: early writer-profile hypothesis; closed as superseded.
- PR #2: research and OpenCode audit; merged.
- PR #3: Writer Harness Bench; merged.
- PR #4: Harbor Light pilot corpus; merged.
- PR #5: real model and stock-OpenCode targets; merged.
- PR #6: roadmap and baseline protocol; merged.
- PR #7: DeepSeek baseline configuration and smoke results; in progress.
