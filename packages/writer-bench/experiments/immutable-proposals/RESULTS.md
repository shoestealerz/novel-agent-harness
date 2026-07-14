# Immutable edit proposal experiment results

## Decision

Graduate the immutable edit proposal as a harness mechanism. With the same model and identical task-aware context, the candidate produced a valid, source-bound, preservation-checked, explicitly uncommitted proposal in 36/36 cells with zero safety failures. Free-form editing produced readable prose but no machine-applicable artifact and accumulated 216 deterministic safety failures.

This result establishes proposal reliability on the development suite. It does not establish universal prose-quality improvement, and the structured protocol has material token and latency costs that should be optimized.

## Experimental controls

- Date: 2026-07-14
- Corpus: diagnosed-development Glass Orchard 1.0.0
- Tasks: 12 scoped revision jobs
- Trials: three per target, 72 completed execution cells
- Model and directional judge: `deepseek-v4-pro`
- Temperature: 0.2
- Maximum output: 4096 tokens
- Context: task-aware compiler, identical mean 3.5833 passages and 336.5833 words
- Control: ordinary free-form proposal response
- Candidate: Writer Contract v0.1 output sealed by the harness into a content-addressed proposal
- Final run: `2026-07-14T00-42-00-167Z-e0d13069`

## Primary result

| Target | Completed | Mean score | Safety failures | Proposal validity | Preconditions | Preservation | Uncommitted authority |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Free-form edit | 36/36 | 0.2821 | 216 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Immutable proposal | 36/36 | 0.9851 | 0 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

Paired mean delta was +0.7031 with a 95% bootstrap interval of +0.6996 to +0.7062. The candidate won all twelve matched tasks. Every preregistered gate passed, including the zero-safety-failure gate and exact context-size parity.

The aggregate delta is intentionally dominated by applicability and safety checks. A free-form answer can contain good prose but cannot safely drive a chapter diff because it has no trusted target, complete replacement artifact, source precondition, content address, or validated preservation receipt.

## Directional prose-quality signal

| Criterion | Free-form | Immutable | Delta |
| --- | ---: | ---: | ---: |
| Prose quality | 0.9125 | 0.9347 | +0.0222 |
| Voice fidelity | 0.9125 | 0.9403 | +0.0278 |
| Constraint fidelity | 0.9958 | 0.9764 | -0.0194 |

The candidate did not show a prose or voice penalty under the configured model judge, but its subjective constraint score was 0.0194 lower. Deterministic constraint checks nevertheless passed in every candidate cell. These judge scores are directional because the same model family generated and judged the outputs; consequential creative-quality claims still require blinded human review.

## Cost and latency

| Target | Input tokens/task | Output tokens/task | Mean latency |
| --- | ---: | ---: | ---: |
| Free-form edit | 550.8 | 1,738.8 | 29.29 s |
| Immutable proposal | 1,125.5 | 3,057.3 | 53.47 s |

The current machine-readable contract roughly doubles prompt tokens and increases measured latency by 82%. Some reported completion tokens may include provider-side reasoning tokens. Proposal validation and hashing are local and negligible; the cost comes from structured model generation. Contract compaction is therefore a later optimization target, but not at the expense of safety fields.

## Artifact semantics

The model supplies proposed replacement text, but the harness constructs the authoritative envelope:

- `status: proposed`, never committed;
- deterministic SHA-256 content address;
- exact source-passage hashes and edit preconditions;
- complete replacement text bound to allowed passage targets;
- preservation-passage hashes and exact-literal receipts;
- validation of authority, scope, changed content, preconditions, preservation, and commit claims.

Because the proposal is content-addressed and carries base hashes, a later commit operation can reject stale source text and can never silently apply a proposal to a changed chapter.

## Corrections and runtime disclosures

The first full run (`2026-07-14T00-09-51-852Z-4b112499`) exposed a validator bug: an exact preservation literal containing quotation marks was searched inside JSON-escaped text, causing six false safety failures across three cells. One free-form provider response was also empty. The validator was corrected in commit `ccfad384d` to compare actual answer and preservation strings, and a quoted-literal regression test was added.

The corrected full run (`2026-07-14T00-24-20-278Z-b685129c`) completed 71/72 cells; one candidate generation exceeded the runner's implicit 120-second process timeout. Commit `975006802` added explicit 240-second target timeouts and safe judged-run resume that preserves completed judge components. The final run reused 71 completed records and regenerated only the missing cell. It completed 72/72 with no execution failures. No task, model, prompt, gate, or scoring rule was weakened.

## Next step

Use immutable proposals as the edit boundary in later experiments and the MVP. Experiment 5 will test writer-aware memory and compaction while holding the task contract, controlled context, and proposal layer fixed.
