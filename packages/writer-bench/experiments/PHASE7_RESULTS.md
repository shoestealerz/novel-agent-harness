# Phase 7 writer-mechanism results

Phase 7 tested candidate writing-agent mechanisms separately before combining only the mechanisms that passed their preregistered gates. The experiments produced an evidence-backed MVP boundary rather than a wholesale rewrite of OpenCode.

| Mechanism | Decision | Evidence | MVP use |
| --- | --- | --- | --- |
| Writer Task Contract v0.1 | Graduate | 1.0000, zero safety failures, +0.2234 vs raw and +0.3252 vs stock | Required job and response protocol |
| Task-aware context compiler | Graduate | 0.9888, zero safety failures, 209 words vs 2,527 for maximum context | Required controlled context packet |
| Hierarchical/temporal retrieval | Retain temporal invariant; reject retriever | Both held-out suites failed graduation; sealed recall gain only +0.0375 | Explicit references first; retrieval remains experimental |
| Immutable edit proposals | Graduate | 0.9851 vs 0.2821 free-form, zero vs 216 safety failures | Required edit boundary |
| Verbose writer-memory schema | Reject | -0.0481 mean delta, worse grounding, more tokens and latency | Typed external story state plus terse pointer memory |
| Broad semantic critic | Reject | False-positive on every valid control; grounding 0.0556 | Optional future narrow evidence-gated checks only |
| Integrated graduated harness | Graduate to MVP | 0.9960 vs 0.0000 raw and stock; zero vs 216 safety failures each | Phase 8 reliability architecture |

## Architectural conclusion

Keep OpenCode's generic session, model, tool, permission, event, persistence, and snapshot machinery. Add writer-owned contracts, context compilation, narrative state, immutable proposals, diff review, and commit receipts around that runtime. Do not translate coding concepts mechanically: source files become stable manuscript passages, patches become proposals, tests become deterministic narrative constraints, and commit remains an author-controlled operation.

## What the evidence does not prove

- It does not prove broad literary-quality improvement; the integrated run intentionally had no model judge.
- It does not validate long-novel retrieval or memory at production scale.
- It does not replace blinded human review for voice, prose, pacing, or aesthetic judgment.
- It does not justify automatic commit, autonomous large-scale rewriting, or silently inferred author intent.

## Phase 8 build order

1. Define the public writer workspace and stable passage-addressing format.
2. Implement typed Explain, Diagnose, Plan, and scoped Revise jobs.
3. Extract the graduated context compiler and proposal sealer into runtime modules.
4. Add proposal persistence, deterministic validation, and a human-readable diff view.
5. Add an explicit commit command with author confirmation, base-hash recheck, Git snapshot, and receipt.
6. Add typed story-state stores and terse pointer-based compaction.
7. Run Writer Harness Bench in CI and add blinded human evaluation before literary-quality claims.

Every future mechanism should enter behind a feature flag, receive an isolated experiment, and graduate only after passing reliability gates on development and sealed held-out material.
