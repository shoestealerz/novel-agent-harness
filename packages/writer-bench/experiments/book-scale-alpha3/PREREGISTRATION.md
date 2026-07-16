# Alpha 3 book-scale evidence preregistration

Registered: 2026-07-15, before corpus prose generation, task authoring, dogfood runs, model evaluation, or human review.

## Decision this study must support

Can the released Novel Agent Harness remain reliable, useful, and author-controlled on a novella-sized manuscript, and what capability—if any—has enough evidence to become Alpha 3's first new authoring job?

The expected candidate is Generate, because the current alpha can understand, diagnose, plan, and revise but cannot draft a new scene. That expectation is not a graduation decision. Generate, another narrowly defined capability, or no new capability may be selected after the results.

## Claims in scope

This milestone may support claims about:

- intent and constraint handling on the included book-scale tasks;
- evidence selection, temporal safety, and grounded understanding;
- continuity diagnosis and intentional-exception precision;
- proposal validity, edit scope, preservation, and author authority;
- session resume, review, commit, cost, latency, and usability;
- blinded reviewer preference on the sampled outputs.

It may not support universal claims about literary quality, arbitrary novels, other languages, autonomous book generation, or production readiness.

## Frozen exclusions

- no private web application;
- no user or unpublished manuscript in public artifacts;
- no copyrighted contemporary novel text without an explicit compatible license;
- no broad semantic retriever promoted into the production path;
- no automatic critic stage;
- no automatic manuscript or story-state commit;
- no tuning against sealed tasks or human-review identities;
- no silent mapping of Generate, Brainstorm, Synchronize, or Translate onto a supported MVP job.

## Corpus contract

The corpus will be newly written synthetic English-language fiction released as CC0-1.0. Its prose, outline, annotations, variants, tasks, and provenance will be versioned together. No candidate target may read gold records, hidden checks, sealed tasks, reviewer packets, or benchmark implementation files.

Required manuscript properties:

- 30,000–50,000 manuscript words, measured without headings or passage markers;
- 12–16 chapters and at least 240 stable passages;
- at least two viewpoint characters with observably different but internally consistent voice constraints;
- a chronology spanning at least seven story days with explicit and implicit temporal anchors;
- at least eight recurring characters, three locations, four consequential objects, and six world rules;
- at least three character arcs, two relationship arcs, and one external plot arc with setups and payoffs separated by four or more chapters;
- asymmetric knowledge tracked at no fewer than five temporal checkpoints;
- promises, secrets, mistaken beliefs, aliases, causal dependencies, and unresolved uncertainty;
- at least twelve intentional ambiguities or apparent contradictions that must not be diagnosed as errors;
- clean canonical prose plus isolated variants containing factual, temporal, spatial, causal, emotional, knowledge, and voice defects;
- selected revision passages with explicit preservation literals and reference outcomes suitable for blinded review.

The canonical manuscript remains authoritative for on-page facts. A separate author-intent file is authoritative only for deliberate ambiguity, voice constraints, planned setups/payoffs, and other off-page decisions. Gold state must cite manuscript evidence or identify an author-only decision explicitly.

## Creation and contamination controls

1. Freeze a story architecture, chronology, world-rule ledger, character-knowledge matrix, and chapter-level intent before drafting prose.
2. Generate or draft prose without using systems under test to answer evaluation tasks.
3. Audit every chapter for originality, internal consistency, passage boundaries, and word count.
4. Create the clean gold model from the frozen architecture and the final canonical prose.
5. Create planted-error variants as explicit patches against canonical passages; do not make the canonical book an untraceable mixture of defects.
6. Write public prompts and hidden deterministic checks separately. Candidate execution receives only the public task contract and admitted context.
7. Hash the sealed task split and human-review manifest before the first scored model run.
8. Publish synthetic sealed material after the authoritative run so the result remains reproducible without exposing it during tuning.

## Task matrix

The native book-scale suite contains 132 tasks:

| Family        | Count | Required coverage                                                                   |
| ------------- | ----: | ----------------------------------------------------------------------------------- |
| Explain       |    24 | chronology, causality, knowledge, uncertainty, arc and motif interpretation         |
| Diagnose      |    36 | planted defects across all seven categories plus intentional-exception controls     |
| Plan          |    24 | causal alternatives, arc consequences, setup/payoff preservation, ambiguous intent  |
| Scoped Revise |    48 | voice, pacing, emotion, continuity repair, constraint-heavy and cross-chapter edits |

Cross-cutting requirements:

- at least 44 tasks require evidence separated by four or more chapters;
- at least 24 tasks exercise a declared temporal boundary;
- at least 24 tasks contain plausible distractor passages;
- at least 18 tasks are materially ambiguous and should ask for clarification or avoid edits;
- at least 24 Diagnose tasks use isolated planted-error variants;
- at least 12 Diagnose tasks are clean intentional-exception controls;
- every Revise task has exact scope, source preconditions, preservation expectations, and a no-commit gate;
- at least 24 Revise tasks receive blinded human review.

The split is fixed before evaluation:

- 36 development tasks for schema, scorer, and workflow debugging;
- 36 validation tasks for threshold calibration and dogfood regression;
- 60 sealed release tasks used only after target configuration and gates are frozen.

Corrections to an invalid task require a new corpus and suite version. Superseded results remain immutable and are not mixed with corrected runs.

## Dogfood protocol

The exact public Alpha 2 tag is installed from a fresh source clone. Dogfood uses a separate Git repository created from the corpus manuscript and exercises:

1. `novel init` with reviewed passage-marker changes;
2. provider and model discovery without credentials entering the manuscript repository;
3. normal Explain, Diagnose, Plan, and Revise prompts;
4. multi-turn prompts in one session;
5. exact-session resume and `--continue` after process exit;
6. `/review`, rejection, non-`APPLY` confirmation, explicit `APPLY`, Git commit, and receipt creation;
7. stale proposal rejection after source changes;
8. behavior with unrelated Git work, unavailable models, interrupted input, and failed commits;
9. context-selection traces, admitted references, token use, cost, latency, and author-visible friction.

Each material failure receives:

- a stable failure ID and reproduction transcript with secrets and private paths removed;
- expected and observed behavior;
- severity and affected invariant;
- a minimized benchmark task when model behavior is involved;
- a deterministic regression test when harness behavior is involved;
- a disposition of fixed, accepted limitation, or deferred experiment.

The dogfood phase is complete only when all critical and high failures are fixed or explicitly block Alpha 3 evaluation.

Dogfood fixes and their regressions may change the candidate after Alpha 2. After validation-task dogfooding ends, freeze one candidate commit and publish its hash before any sealed release task is executed. No candidate code, prompt, context policy, or deterministic scorer may change during the authoritative run. Alpha 2 remains the auditable pre-dogfood reference, not a silently moving target.

## Model comparison

Fixed target roles:

1. direct raw model;
2. stock OpenCode primary agent;
3. the frozen post-dogfood production Writer candidate.

All targets use the same pinned base-model revision, temperature, output budget, and seed policy where supported. Target-specific hidden answers, gold state, checks, or reviewer metadata are forbidden.

The primary end-to-end track reflects how each product is actually used:

- raw model receives the complete canonical manuscript through the task's temporal boundary in chapter order plus the public author request;
- stock OpenCode receives an isolated Git workspace containing the same bounded manuscript and public author request, without benchmark, gold, Writer contract, or narrative tools;
- Production Writer receives the same isolated bounded manuscript workspace and public request and performs its normal context selection; its selected references, admitted packet, and selection usage are recorded.

The pinned model must fit the complete bounded manuscript and response budget. If it cannot, the preregistration must be amended and versioned before any model output is inspected; silently truncating a baseline is forbidden.

A secondary controlled-context track uses a stratified 24-task subset. Every target receives the same gold-bounded public context packet so contract/execution effects can be separated from context-selection effects. Results from the two tracks are reported separately and are never pooled into one mean.

Run protocol:

- three trials for every included task and target in the primary track and three trials for the 24-task controlled-context subset;
- paired comparisons by task and trial;
- at least 95% execution completion per target;
- confidence intervals clustered by task;
- deterministic safety failures remain release-blocking;
- report input/output tokens, recorded cost, end-to-end latency, selected context size, and selection latency separately;
- do not compare targets whose model comparison keys differ.

## Automated metrics and gates

Safety and reliability are primary gates, not weighted preferences:

1. Production Writer has zero unauthorized edit-scope, silent mutation, false commit, temporal leakage, stale-application, or preservation failures.
2. Proposal validity, preconditions, preservation receipts, and uncommitted authority are each 1.0000.
3. Candidate deterministic safety failures do not exceed either baseline.
4. Completion is at least 95%, and resume succeeds in every scripted recovery trial.
5. Intentional-exception false positives do not exceed raw model or stock OpenCode.
6. Evidence grounding and unsupported-claim avoidance are each at least 0.95 overall.
7. Required evidence recall is at least 0.85 overall and at least 0.75 on long-range tasks.
8. Mean reliability score does not regress against either baseline; the paired 95% confidence interval and win/tie/loss counts are reported even if the gate passes.
9. Cost and latency are reported by phase and percentile. They are not gated until representative variance is observed, but omissions fail the run.

Failure of a safety gate cannot be offset by a higher aggregate or human-preference score.

## Blinded human review

The human sample contains 48 tasks stratified across Plan and Revise, including voice, pacing, emotion, continuity repair, constraint-heavy work, intentional ambiguity, and cross-chapter dependencies.

For each task, compare Production Writer independently with raw model and stock OpenCode. Render only the author request, necessary source passages, and answer or proposed prose. Remove system names, proposal IDs, token counts, formatting signatures, and execution order. Randomize left/right placement with a recorded seed. Reviewers may not see deterministic checks, gold answers, model metadata, or other reviewers' decisions.

At least three eligible reviewers rate each pair, producing at least 288 pair ratings before exclusions. A reviewer must be an adult fluent English reader who writes or substantively edits fiction and did not author the compared output. Record consent to publish de-identified ratings. Reviewers score:

- prose quality;
- voice retention;
- pacing or dramatic effect;
- constraint fidelity;
- usefulness to the author;
- forced preference: left, tie, or right;
- optional concise rationale and defect flags.

Analysis reports per-dimension distributions, inter-rater agreement, task-clustered confidence intervals, ties, missing ratings, and preference by task family. Reviewer comments are inspected only after quantitative aggregation is frozen.

Creative-quality improvement may be claimed only when Production Writer's task-clustered 95% preference interval is entirely above 0.50 against the named baseline and all automated safety gates pass. If the interval includes 0.50 but its lower bound is at least 0.40, report no detected material preference penalty. Otherwise report the observed regression. No result generalizes beyond this corpus, model, protocol, and reviewer sample.

## Alpha 3 capability decision

After automated and human results are frozen, rank candidate capabilities by observed author need, failure frequency, benchmark coverage, expected value, authority risk, and implementation cost.

Generate is eligible only if the evidence shows that authors need new scene drafting, the story-state and plan inputs can be made explicit, the output can remain proposal-only, and a preregistered Generate experiment can measure continuity, voice, plan adherence, and author preference. A failed book-scale safety gate blocks Generate graduation but does not require abandoning bounded research.

Retrieval is eligible only as a new isolated experiment with a materially different hypothesis and sealed recall/safety gates. Existing failed retrieval candidates may not be relabeled as production-ready.

The milestone ends with one of three decisions:

1. specify a bounded Alpha 3 capability and its separate graduation experiment;
2. prioritize reliability, cost, or usability work before adding a job; or
3. stop expansion because the book-scale evidence does not support it.

The decision and limitations are published regardless of whether the harness wins.
