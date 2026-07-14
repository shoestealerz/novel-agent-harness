# Novel Agent Harness

An open-source model harness for writing, editing, and translating long-form fiction.

Novel Agent Harness adapts the reliable parts of coding agents—scoped tasks, controlled context, immutable patches, validation, review, and reversible commits—to novels. The author remains the final authority: analysis and proposed edits are distinct from applying changes.

The project is currently building its public harness core. The private web application is intentionally deferred until the harness protocol is stable.

## Current capabilities

- Git-friendly novel workspaces with durable passage references
- task-aware context packets with explicit focus, dependency, preservation, exclusion, and temporal boundaries
- immutable, content-addressed edit proposals with source preconditions and preservation receipts
- persisted proposal artifacts and stale-safe review diffs
- Writer Harness Bench for deterministic reliability gates, paired comparisons, confidence intervals, cost/latency reporting, and optional qualitative judging
- synthetic fiction corpora for development and sealed held-out evaluation

## Evidence-backed design

The experiment phase tested each proposed mechanism before promoting it into the runtime.

| Mechanism                        | Decision                               |
| -------------------------------- | -------------------------------------- |
| Writer Task Contract v0.1        | Graduated                              |
| Task-aware controlled context    | Graduated                              |
| Immutable edit proposals         | Graduated                              |
| Hierarchical semantic retrieval  | Experimental; failed sealed graduation |
| Verbose writer-memory summaries  | Rejected                               |
| Broad automatic semantic critics | Rejected                               |

The integrated reliability evaluation completed 108/108 cells. The graduated harness scored 0.9960 with zero deterministic safety failures on its development suite. This is evidence for the proposal and authority architecture, not a claim of universal literary-quality improvement. See [Phase 7 results](packages/writer-bench/experiments/PHASE7_RESULTS.md) for the full interpretation.

## Repository map

- [`packages/writer`](packages/writer): production writer workspace, context, proposal, persistence, and review primitives
- [`packages/writer-bench`](packages/writer-bench): benchmark runner, corpora, experiments, and regression gates
- [`WRITER_HARNESS_RESEARCH.md`](WRITER_HARNESS_RESEARCH.md): product requirements and agent-harness research
- [`ROADMAP.md`](ROADMAP.md): current phase, experiment record, and implementation sequence
- [`packages/opencode`](packages/opencode): the retained generic agent runtime inherited from OpenCode

## Development

The monorepo uses Bun 1.3.14 and Node.js 22 or newer.

```bash
bun install

cd packages/writer
bun run typecheck
node --experimental-strip-types --test "src/**/*.test.ts"

cd ../writer-bench
bun run typecheck
node --experimental-strip-types --test "src/**/*.test.ts"
```

Benchmark model credentials and local target files are intentionally excluded from Git. See [`packages/writer-bench/README.md`](packages/writer-bench/README.md) for runner usage.

## Relationship to OpenCode

The initial source tree was imported from [anomalyco/opencode](https://github.com/anomalyco/opencode) at commit [`34e5809`](https://github.com/anomalyco/opencode/commit/34e58090595d44e3e7cc37498f16753a98627456). OpenCode provides the generic session, model, tool, permission, event, persistence, and snapshot machinery. Novel Agent Harness owns the writer-specific contracts, context, story-state, proposal, evaluation, and author-authority layers.

The repository history begins with that source snapshot as a single baseline commit so subsequent history represents Novel Agent Harness work. The imported OpenCode source remains available under the MIT license in this repository.

## Status

Phase 7 experiments are complete. Phase 8—the public writing-harness MVP—is active. The next runtime boundary is an author-confirmed commit operation that rechecks proposal hashes and records a Git-backed receipt before mutating manuscript text.
