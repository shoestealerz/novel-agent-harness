# Novel Agent Harness Roadmap

Last updated: 2026-07-15

## Current position

The project has completed **Phase 8: public writing harness MVP** and started **Phase 9: book-scale evidence and production benchmark expansion**.

```text
Research and architecture                   complete
OpenCode runtime audit                      complete
Benchmark runner and regression gates       complete
Pilot fiction corpus and gold annotations   complete
Raw-model and stock-OpenCode adapters        complete
Real raw-model vs stock-OpenCode baseline    complete
Writer-specific experiments                 complete
Public writing harness MVP                  complete
Production Writer pilot                     complete
Interactive `novel` CLI alpha               complete
Book-scale evidence milestone               active
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

Created `Harbor Light`, a synthetic CC0 pilot containing 2,527 words, 32 stable passages, 41 gold records, 12 initial tasks, one planted defect, and deliberate ambiguity/motif exceptions. Phase 7 experiments 2 and 3 added seven context and seven retrieval stress tasks, bringing the corpus to 26 tasks.

### Phase 5: Real evaluation targets

Implemented an OpenAI-compatible direct-model adapter and a stock OpenCode non-interactive adapter. Isolated hidden evaluation material from both targets.

## Completed Phase 6

### Phase 6: Establish real baselines

Goal: measure the same model under direct prompting and unmodified OpenCode before introducing writer-specific behavior.

Required matrix:

| Target           | Context                          | Runtime                           |
| ---------------- | -------------------------------- | --------------------------------- |
| `raw-model`      | Task-provided passages           | Direct OpenAI-compatible call     |
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

Result: 72/72 executions completed. Raw DeepSeek scored 0.7361 and stock OpenCode scored 0.6620, a -0.0741 paired delta with a 95% bootstrap interval of -0.1481 to -0.0069. Stock OpenCode increased safety failures from 19 to 27. The failed gates define the lower bound and concrete requirements for Phase 7. See `packages/writer-bench/baseline/RESULTS.md`.

## Completed Phase 7

### Phase 7: Writer-specific experiments

Run isolated experiments in this order:

1. task contract versus unstructured instruction;
2. task-aware context compilation versus supplied/maximum context;
3. lexical/embedding retrieval versus hierarchical and temporal retrieval;
4. free-form prose versus immutable structured proposals;
5. writer-aware context reconstruction versus coding compaction;
6. deterministic validation versus optional critic agents.

Each mechanism must beat the Phase 6 baselines on its intended metrics without violating reliability gates.

Completed experiment 1: Writer Task Contract v0.1 versus unstructured raw-model and stock-OpenCode prompting.

Writer Task Contract v0 one-trial result: 36/36 executions completed. The writer contract scored **0.8681**, compared with **0.7847** for raw DeepSeek and **0.6215** for stock OpenCode. It recorded no task-level losses, but four deterministic safety failures prevent graduation. Three are exact hidden-identifier mismatches despite correct semantic content; the fourth requires an exact preservation literal in the human-readable response as well as the structured artifact. See `packages/writer-bench/experiments/writer-contract-v0/RESULTS.md`.

Writer Task Contract v0.1 graduated on Harbor Light 0.2.0 after a three-trial, 108-cell evaluation. It scored **1.0000 with zero safety failures**, compared with **0.7766 and 23 safety failures** for raw DeepSeek and **0.6748 and 29 safety failures** for stock OpenCode. The paired delta was +0.2234 versus raw (95% CI +0.0694 to +0.3958) and +0.3252 versus stock (95% CI +0.1667 to +0.5162). See `packages/writer-bench/experiments/writer-contract-v01/RESULTS.md`.

Completed experiment 2: task-aware context compilation versus task-supplied and maximum available context under Writer Task Contract v0.1. Across 63 final scored cells, compiled context scored **0.9888 with zero safety failures**, compared with **0.7032 and six safety failures** for supplied context and **0.8704 and 14 safety failures** for maximum context. It used 209 context words on average versus 2,527 for maximum context, improved grounding from 0.7458 to 1.0000, and passed every gate. See `packages/writer-bench/experiments/context-compiler/RESULTS.md`.

Completed development experiment 3A: retrieval into the graduated context compiler. On seven Harbor Light development tasks, hierarchical-temporal retrieval achieved **0.9524 retrieval recall, 0.7024 precision, and 1.0000 temporal safety**, versus 0.6905, 0.5714, and 0.7143 for lexical retrieval. Its DeepSeek downstream score was **0.9345 with three safety failures**, versus 0.8016 with five failures for lexical retrieval, while using 31% fewer total tokens. See `packages/writer-bench/experiments/retrieval/RESULTS.md`.

Experiment 3B failed held-out graduation on Quiet Meridian. The frozen candidate achieved **0.6875 recall, 0.5496 precision, and 1.0000 temporal safety**, versus 0.5972, 0.4538, and 0.2500 for lexical retrieval. Across 72 DeepSeek cells, its downstream score was 0.7467 versus 0.7371, but safety failures increased from 21 to 26 and unsupported-claim avoidance fell from 1.0000 to 0.9048. The preregistered deterministic and downstream comparisons failed. Temporal filtering is retained as a mandatory invariant; the semantic retriever does not graduate. See `packages/writer-bench/experiments/retrieval-heldout/RESULTS.md`.

Experiment 3C failed sealed graduation on Glass Orchard. Hybrid v2 improved retrieval recall from 0.6611 to 0.6986 with unchanged 0.6639 precision and 1.0000 temporal safety, but missed the preregistered +0.08 recall gate. Across 72 DeepSeek cells it improved mean score from 0.7391 to 0.7478 and reduced safety failures from 23 to 20; all downstream gates except retrieval recall passed. Coverage-only v2 underperformed v1, while embeddings recovered thematic and mechanism links but unevenly displaced causal evidence. Temporal filtering remains mandatory and hybrid v2 remains experimental. See `packages/writer-bench/experiments/retrieval-v2-sealed/RESULTS.md`.

Completed experiment 4: immutable edit proposals. Across 72 completed DeepSeek cells with identical task-aware context, content-addressed validated proposals scored 0.9851 with zero safety failures versus 0.2821 and 216 safety failures for free-form editing. Proposal validity, source preconditions, preservation receipts, and uncommitted authority were each 1.0000; all preregistered gates passed. Directional judge scores showed small prose and voice gains and a 0.0194 subjective constraint-fidelity regression, while every deterministic constraint check passed. The structured protocol increased tokens and latency materially. See `packages/writer-bench/experiments/immutable-proposals/RESULTS.md`.

Experiment 5 rejected the full writer-memory schema. Across 36 completed two-call cells, OpenCode's generic anchored compaction scored 0.8361 versus 0.7880, achieved 0.9778 memory recall versus 0.9500, and grounded downstream answers at 0.7222 versus 0.5556. Writer memory nearly doubled summary length, added 1,780 output tokens per task, increased latency by 38%, and raised safety failures from 6 to 9. Critical narrative state should live in typed validated stores; transcript compaction should remain terse and pointer-based. See `packages/writer-bench/experiments/writer-memory/RESULTS.md`.

Experiment 6 rejected the general semantic critic as a default stage. It reached 0.7500 planted-defect recall but produced false positives on every valid control, grounded required evidence at only 0.0556, added 3,144 output tokens and 33.7 seconds per task, and lowered mean score from 0.6250 to 0.5365. The no-edit authority boundary held. Critics must remain optional and be redesigned as narrow, evidence-gated, locally capped checks with valid controls. See `packages/writer-bench/experiments/proposal-critics/RESULTS.md`.

Completed experiment 7: integrated harness evaluation. Across 108 completed cells, the combined Writer Contract v0.1, controlled task-aware context, proposal-only authority, and immutable proposal layer scored **0.9960 with zero safety failures**, compared with **0.0000 and 216 safety failures each** for raw DeepSeek and stock OpenCode. The paired delta against both controls was +0.9960 with a 95% bootstrap interval of +0.9881 to +1.0000. All preregistered gates passed. This graduates the reliability architecture to MVP implementation, not to production or broad literary-quality claims. See `packages/writer-bench/experiments/integrated-harness/RESULTS.md` and the Phase 7 synthesis at `packages/writer-bench/experiments/PHASE7_RESULTS.md`.

## Later phases

### Phase 8: Public writing harness MVP

Build an embedded writer runtime around OpenCode with writer-owned contracts, narrative tools, story-state service, Git-backed novel workspaces, proposal review, and commit receipts.

Initial supported jobs: Explain, Diagnose, Plan, and scoped Revise.

Completed implementation slices: `packages/writer` now defines the public writer-core package, Git-friendly `novel.json` manifest, explicit stable passage markers, path containment, SHA-256 passage preconditions, the graduated controlled-context compiler, immutable proposal sealing, content-addressed proposal persistence, stale-safe review diffs, and an author-confirmed commit transaction with fresh contextual hash checks, exact Git staging, rollback before `HEAD` advances, and content-addressed Git-backed receipts. The production Writer Task Contract routes Explain, Diagnose, Plan, and scoped Revise, derives least authority from the job, validates structured evidence and edit scope, and seals valid revisions. OpenCode's Writer session adapter runs that contract through its existing session and structured-output services and persists valid proposals. Read-only narrative tools list structure, read stable passages, compile temporally bounded context, and review saved proposals. Unscoped requests use an isolated child session for structured context selection; only the trusted compiler's filtered packet enters the author-facing execution session, where narrative tools are disabled. Writer Harness Bench imports the production context and proposal implementations instead of maintaining experimental copies.

The minimal story-state layer now stores typed characters, objects, locations, organizations, concepts, facts, events, character knowledge, and relationships. Every record cites stable manuscript evidence, cross-record and temporal references are validated, and uncertainty remains explicit. State changes are immutable, content-addressed proposals with base hashes and stale-safe review diffs; there is deliberately no model-facing state mutation tool. The read-only `novel_state` tool supports exact type/ID filters and excludes records evidenced after a requested temporal boundary.

The initial `opencode writer` headless interface now runs all four Writer jobs through real OpenCode sessions, accepts either isolated model-selected context or explicit passage constraints, emits a versioned JSON result, reviews manuscript and story-state proposals, initializes or inspects typed state, and turns an explicit `--yes` author confirmation into a verified manuscript Git commit and receipt. Real subprocess coverage exercises Explain and the full Revise → review → author-confirmed commit path.

Safe workspace bootstrap now requires a clean Git root and already tracked chapter files, refuses to overwrite `novel.json`, preserves valid existing markers, and adds only one conservative whole-chapter marker to unmarked files through an explicit `--yes` operation. Author-confirmed story-state commits now revalidate the proposal, evidence, current state hash, clean Git scope, staged blobs, and unchanged `HEAD`; they write a separate content-addressed receipt and restore the exact prior state bytes and index if the commit fails. Real subprocess coverage exercises bootstrap, state-proposal review, and state commit.

The production benchmark adapter now executes the shipped `opencode writer` command in a fresh isolated novel workspace per cell and maps its structured artifacts, token usage, cost, latency, session identity, and failures into Writer Harness Bench. Headless Writer sessions can resume across process restarts only within the same canonical novel workspace. The dedicated CI gate now covers session recovery, stale proposals, model-configuration failure, and the complete Writer/benchmark suite on Windows and Linux.

The preregistered production adapter completed 81/81 same-model DeepSeek V4 Pro executions across raw-model, stock-OpenCode, and production-Writer targets. Production Writer scored 0.9815 with zero deterministic safety failures, compared with 0.6667 and 18 failures for raw DeepSeek and 0.5139 and 25 failures for stock OpenCode. Both preregistered comparisons passed. See `packages/writer-bench/production/RESULTS.md`.

Version `v0.1.0-alpha.2` adds the globally linked `novel` command, ongoing interactive Writer sessions, exact-session and newest-session resume, conservative tracked-chapter discovery, provider setup routing, proposal review, and typed `APPLY` confirmation before the existing verified Git transaction. The release passed the full Writer and benchmark matrix on Linux and Windows and was verified from a fresh public-tag clone.

### Phase 9: Production benchmark expansion

Expand the permissioned/synthetic corpus to 30,000–50,000 words and approximately 120–200 tasks. Add larger external benchmark subsets and blinded human evaluation.

The active Alpha 3 milestone is preregistered at `packages/writer-bench/experiments/book-scale-alpha3/PREREGISTRATION.md`. It will:

1. create a fully synthetic, CC0, 30,000–50,000-word multi-chapter novella with stable passages, typed gold state, author intent, voice annotations, temporal boundaries, asymmetric character knowledge, intentional exceptions, and isolated planted-error variants;
2. create 132 versioned Explain, Diagnose, Plan, and scoped Revise tasks, plus scripted operational trials for initialization, context selection, proposal review, explicit approval, Git commits, stale rejection, and session resume;
3. dogfood the released `novel` CLI and convert every material failure into a minimized benchmark task and durable regression test;
4. compare raw-model, stock-OpenCode, and production-Writer targets with the same pinned model and inference settings;
5. complete a blinded human review before making prose, voice, pacing, dramatic-effect, or usefulness claims; and
6. select Alpha 3's first new authoring capability from the evidence rather than presuming that Generate, retrieval, or another mechanism should graduate.

Current Alpha 3 checkpoint (July 16, 2026):

- Complete: the wholly synthetic 36,122-word, 14-chapter *Saltglass Vigil* novella, frozen architecture and gold story state, isolated defect variants, and the complete 132-task Explain/Diagnose/Plan/Revise matrix.
- Complete: released-CLI dogfood across initialization, context selection, all four supported jobs, proposal review and approval, verified Git commits, stale rejection, and resumed sessions. Material failures are recorded in `packages/writer-bench/experiments/book-scale-alpha3/dogfood/failures.jsonl` with benchmark and regression-test dispositions.
- Complete: public validation of the frozen candidate. Commit `4e53b3086a060d392d6d352358d81d59ebff7405`, tagged `alpha3-book-scale-candidate-4e53b3086`, completed 36/36 validation tasks with mean reliability 0.9521, zero deterministic safety failures, perfect required-evidence recall and grounding, and all proposal invariants at 1.0000. Complete bounded context is validated only at the preregistered novella scale; it is not evidence for broad retrieval or larger manuscripts.
- Complete: the sealed-task, controlled-context, and blinded-human-review manifests are hash-frozen. The 48-task review selection contains 96 randomized pairs and requires at least 288 independent ratings before unblinding.
- Invalid and preserved: authoritative attempt `A3-PRIMARY-001` produced 300 successful cells but cannot support comparisons. It exposed detached-worktree installation, raw cache-telemetry, transient Windows cleanup, transport, and provider-credit failures. Revision 3 of `authoritative-run.freeze.json` pins infrastructure-only corrections and permits reuse of only 121 successful stock-OpenCode cells.
- Pending: restore DeepSeek API credit and resume 419 provider calls: all 180 raw-model cells for exact cache-aware cost, 59 failed stock-OpenCode cells, and all 180 production-Writer cells. Then run the 216-cell controlled track, conduct the frozen blinded review, publish results and limitations, and make the evidence-based Alpha 3 capability decision.

PR #53 merged the frozen candidate, public validation receipts, dogfood record, comparable stock-OpenCode workspace adapter, and infrastructure-only resume corrections. No broad retrieval system or private UI work has started.

The private UI remains deferred. Broad semantic retrieval remains experimental because both held-out retrieval candidates failed their preregistered graduation gates.

### Phase 10: Private web application

Build the private UI only after the harness protocol stabilizes: agent chat, manuscript navigation, passage citations, chapter diffs, proposal review, character/timeline/arc views, and reversible commit history.

## Pull-request history

- PR #1: early writer-profile hypothesis; closed as superseded.
- PR #2: research and OpenCode audit; merged.
- PR #3: Writer Harness Bench; merged.
- PR #4: Harbor Light pilot corpus; merged.
- PR #5: real model and stock-OpenCode targets; merged.
- PR #6: roadmap and baseline protocol; merged.
- PR #7: DeepSeek baseline configuration and smoke results; merged.
- PR #8: official three-trial DeepSeek baseline; merged.
- PR #9: Writer Task Contract v0 experiment; merged.
- PR #10: illustrated Writer Task Contract experiment explainer; merged.
- PR #11: corrected Writer Task Contract v0.1 and official three-trial result; merged.
- PR #12: task-aware context compiler and official three-trial result; merged.
- PR #13: retrieval development experiment; merged.
- PR #14: preregistered Quiet Meridian held-out failure; auto-closed when its stacked base branch was removed and superseded by PR #21.
- PR #15: retrieval v2 development candidate; merged.
- PR #16: sealed retrieval v2 failure; merged.
- PR #17: immutable edit proposals; merged.
- PR #18: rejected verbose writer memory; merged.
- PR #19: rejected broad semantic critic; merged.
- PR #20: integrated graduated-harness evaluation and Phase 7 synthesis; merged.
- PR #21: replacement for the auto-closed held-out retrieval PR; merged.
- PR #22: stable Git-backed novel workspaces; merged.
- PR #23: production context compiler and immutable proposal primitives; merged.
- PR #24: content-addressed proposal persistence and stale-safe review diffs; merged.
- PR #25: repository owner maintainer registration; merged.
- PR #26: author-confirmed proposal commits and Git-backed receipts; merged.
- PR #27: production Writer Task Contract and OpenCode session adapter; merged.
- PR #28: read-only narrative tools and isolated model-assisted context selection; merged.
- PR #29: typed, evidence-linked story state and immutable state proposals; merged.
- PR #30: real headless Writer workflow with review, author confirmation, and manuscript commit receipts; merged.
- PR #31: safe workspace bootstrap and author-confirmed story-state commit receipts; merged.
- PR #32: production Writer adapter, resumable-session gates, and benchmark CI; merged.
- PR #33: production DeepSeek benchmark launcher and pinned provider configuration; merged.
- PR #34: public-runner CI portability and race-safe Windows dependency setup; merged.
- PR #35: standalone repository and alpha-release preparation; merged.
- PR #36: GitHub Actions migration to the Node 24 runtime; merged.
- PR #37: non-strict DeepSeek V4 structured-output compatibility; merged.
- PR #38: cross-platform commit-test stabilization; merged.
- PR #39: prerelease tag validation correction; merged.
- PR #40: globally linked interactive `novel` CLI and Alpha 2 release; merged.
- PR #41: Alpha 3 book-scale evaluation preregistration; merged.
- PR #42: frozen synthetic novella architecture; merged.
- PRs #43–#49: staged drafting and completion of the 36,122-word *Saltglass Vigil* manuscript; merged.
- PR #50: isolated book-scale defect variants; merged.
- PR #51: typed book-scale gold records; merged.
- PR #52: 132-task book-scale matrix and public/controlled/sealed split tooling; merged.
- PR #53: bounded book-scale Writer candidate, dogfood and public validation evidence, evaluation adapters, run freeze, and infrastructure-only resume corrections; merged.
