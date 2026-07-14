# Proposal critic experiment results

## Decision

Reject the general semantic critic as a default proposal stage. It met the minimum planted-defect recall target but failed both valid controls in every trial, rarely returned usable citations, produced too many overlapping findings, lowered overall score, and added substantial cost and latency.

Keep deterministic proposal validation mandatory. Do not automatically run or trust a broad model critic in the MVP. A future critic must be category-specific, user-invoked or risk-triggered, locally capped, evidence-gated, and calibrated to abstain before it can be reconsidered.

## Experimental controls

- Date: 2026-07-14
- Fixtures: six structurally valid proposals with planted semantic defects and two valid controls
- Trials: three per target, 48 completed cells
- Corpus context: Glass Orchard 1.0.0, task-aware selected passages
- Control: deterministic validation only
- Candidate: deterministic validation plus read-only `deepseek-v4-pro` semantic critic
- Critic authority: findings only; edits always empty
- Temperature: 0.2; maximum output 4096
- Run: `2026-07-14T01-18-35-807Z-ed32ef95`

## Result

| Metric | Deterministic only | Semantic critic | Delta |
| --- | ---: | ---: | ---: |
| Mean score | 0.6250 | 0.5365 | -0.0885 |
| Safety failures | 36 | 29 | -7 |
| Planted-defect recall | 0.0000 | 0.7500 | +0.7500 |
| Valid-control precision | 1.0000 | 0.0000 | -1.0000 |
| Required evidence grounding | 0.0000 | 0.0556 | +0.0556 |
| Output tokens/task | 0 | 3,144 | +3,144 |
| Mean latency | 0.005 ms | 33.72 s | +33.72 s |

The paired mean delta was -0.0885 with a 95% bootstrap interval of -0.2708 to +0.0781 and wins/ties/losses of 4/1/3. Only the minimum critic-recall gate passed. The critic produced no edits in all 24 cells, so the authority boundary worked as designed.

The output-token gate was reported as missing because the zero-call control originally recorded latency but omitted explicit zero token fields. The target now emits zero input/output tokens for future comparisons. The observed candidate cost is unambiguous and exceeds the registered +1,000-token allowance by more than threefold; this bookkeeping correction does not change the failed decision.

## Detection behavior

- Causality, premature character knowledge, motif over-explanation, and voice/register defects were detected in all three trials.
- The compound consent fixture achieved only 0.5000 recall.
- The pruning-hook possession defect achieved 0.0000 recall despite explicit source passages.
- Both valid controls received findings in all three trials, so valid-control precision was 0.0000.
- Required exact-passage evidence was present in only 5.56% of scored critic cells after unknown citations were stripped.
- Responses frequently exceeded the requested three-finding budget with overlapping continuity, motif, preservation, relationship, and knowledge complaints about the same underlying change.

The valid ledger tightening was criticized for removing an atmospheric Guild-control detail that was not a required preservation constraint. The valid ending tightening attracted similarly speculative objections. This is the central failure mode for novel editing: an unconstrained critic converts optional taste into blocking correctness claims.

## Retained design guidance

1. Deterministic authority, scope, source hashes, changed-content, exact-literal preservation, and commit-state checks remain release gates.
2. Critic output must never mutate the proposal and must remain separately dismissible; this boundary passed.
3. Reject any critic finding without at least one allowed passage citation before showing it as actionable.
4. Enforce a local maximum finding count and merge duplicate categories rather than trusting prompt compliance.
5. Use narrow critics only: for example, object-state continuity or character-knowledge leakage, each with typed state evidence.
6. Include valid and intentionally ambiguous controls in every calibration set; recall alone rewards over-flagging.
7. Run critics on demand or only for risk-triggered proposals, not on every edit.

## Next step

Experiment 7 will evaluate the integrated graduated mechanisms: Writer Contract v0.1, task-aware controlled context, temporal safety, and immutable proposals. Non-graduated retrieval v2, verbose writer memory, and the general semantic critic will remain disabled. The integrated comparison will use the existing benchmark reliability suites and report the retained limitations explicitly.
