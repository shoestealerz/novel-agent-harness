# Writer-aware memory experiment results

## Decision

Reject the full writer-memory schema. OpenCode's shorter generic anchored compaction retained more scored information, produced better downstream grounding, used substantially fewer tokens, and completed faster. The writer schema failed the preregistered recall, score, safety, grounding, length, and token gates.

Do not ship the eleven-section narrative summary in the MVP. Keep generic anchored compaction as the current transcript fallback and store critical narrative state in typed, deterministic services outside the prose summary. A later compact memory challenger should summarize deltas and pointers to those stores rather than restating every category on every compaction.

## Experimental controls

- Date: 2026-07-14
- Histories: three synthetic Glass Orchard author/agent sessions, mean 667.3 words
- Tasks: six downstream explain, diagnose, synchronize, and plan jobs
- Trials: three per target, 36 completed cells
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096
- Control: current OpenCode anchored coding-session schema
- Candidate: eleven-section writer narrative-state schema
- Downstream: Writer Contract v0.1 with only `memory:summary`
- Final run: `2026-07-14T01-08-29-810Z-b3cb2693`

## Result

| Metric | Coding compaction | Writer memory | Delta |
| --- | ---: | ---: | ---: |
| Mean score | 0.8361 | 0.7880 | -0.0481 |
| Safety failures | 6 | 9 | +3 |
| Memory recall | 0.9778 | 0.9500 | -0.0278 |
| Memory safety | 0.9444 | 0.9444 | 0.0000 |
| Downstream grounding | 0.7222 | 0.5556 | -0.1667 |
| Summary words | 549.8 | 1,062.9 | +513.1 |
| Output tokens/task | 4,209.9 | 5,990.4 | +1,780.4 |
| Mean two-call latency | 64.10 s | 88.54 s | +24.44 s |

The paired mean delta was -0.0481 with a 95% bootstrap interval of -0.0833 to -0.0111 and wins/ties/losses of 1/1/4. Only memory-safety parity and identical input size passed. Every other preregistered gate failed.

## Task behavior

- Writer memory's sole win was motif explanation (+0.0222), where explicit motif and ambiguity sections helped.
- Object/knowledge synchronization tied at 0.8889, despite writer memory using roughly 1,196 summary words versus 633.
- Writer memory lost the active-proposal/causality explanation, consent plan, mechanism diagnosis, and relationship plan.
- The largest summaries occurred on mechanism and object-state histories, exactly where the extra sections were intended to help. More coverage instead diluted the downstream task and reduced citation grounding.

The control was not a naive summary. Current OpenCode compaction already uses an anchored prior summary, preserves still-true details and exact identifiers, removes stale details, and asks for terse important constraints. On these histories, that general prioritization was more effective than forcing every narrative category into every summary.

## Why the candidate failed

1. **Schema-induced verbosity.** The candidate nearly doubled summary length, which increased generation cost and left the downstream model with more weakly prioritized state.
2. **Attention dilution.** Typed sections encouraged exhaustive restatement even when a category was irrelevant to the pending task. Downstream grounding fell by 0.1667.
3. **Duplicated state.** Facts such as hook possession appeared under canon, chronology, object state, character knowledge, and active proposal, consuming budget without adding evidence.
4. **Model-filled databases.** Asking prose generation to reconstruct every state table combines extraction and summarization in one fallible step. Critical canon and proposal state should instead be validated and stored independently.
5. **Latency risk.** Five candidate cells exceeded the initial 240-second target ceiling. Even after completion, mean latency was 38% higher.

## Runtime disclosure

The initial full run (`2026-07-14T00-55-04-239Z-480a2aa7`) completed all 18 control cells and 13/18 writer cells. Five writer cells exceeded the explicit 240-second process timeout. Commit `162b77cf2` raised only the process ceiling to 360 seconds. The final run resumed the 31 completed records and regenerated only the five missing cells; it completed 36/36 without execution failures. No schema, task, model setting, gate, or scoring rule changed.

## Retained design guidance

- Keep OpenCode's anchored-summary update and recent-tail preservation.
- Put canon facts, character knowledge, object state, chronology, author decisions, and proposal status in typed stores with provenance and validation.
- Let compaction reference stable record IDs and summarize only active deltas, unresolved choices, current author intent, and the immediate next move.
- Preserve rejected author options explicitly, but once in a compact decision ledger rather than in several prose sections.
- Revisit memory only after the typed story-state tools exist; evaluate a concise pointer-based schema against this recorded control.

## Next step

Experiment 6 will compare deterministic validators with optional critic agents while holding the graduated task contract, controlled context, and immutable proposal layer fixed.
