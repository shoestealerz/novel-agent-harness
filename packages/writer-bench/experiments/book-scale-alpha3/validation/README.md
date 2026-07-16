# Alpha 3 public validation

This directory records validation-task dogfood before the Alpha 3 candidate is frozen. It never contains sealed task bodies, private reviewer identities, credentials, or unpublished manuscripts.

The validation split is run one trial at a time against the production Writer target. Every attempt is immutable in `attempts.jsonl`. A failed or invalid attempt remains in the ledger and is not pooled with a corrected suite version.

## Attempt 1 decision

`A3-VAL-001` completed all 36 public validation tasks, but it cannot support a candidate freeze.

- The native corpus adapter populated the isolated workspace correctly, then converted gold `contextSpec` fields into explicit Writer CLI flags. Any declared context causes the released Writer session to bypass automatic selection, so most tasks admitted only their focus passage. Required-evidence recall was 0.5937 overall and 0.5843 on long-range tasks.
- Eleven scoped Revise tasks required a preservation passage but omitted that passage from the citation-grounding allowlist. The harness correctly selected and receipted the preservation passage, and the scorer incorrectly counted that required citation as a safety failure.

The adapter now marks materialized native manuscripts for automatic selection and withholds gold context hints from the Writer CLI. The task generator includes every required preservation passage in its grounding allowlist. Because this corrects invalid validation tasks, the corpus manifest moves from 0.2.0 to 0.2.1, the suite moves from 0.3.0 to 0.3.1, and the sealed receipt is regenerated before any sealed task is executed.

## Reproduction contract

- Candidate source is launched directly from the recorded Git commit.
- Model: `deepseek/deepseek-v4-pro` / API comparison key `deepseek-v4-pro`.
- Temperature: 0.2.
- Maximum output: 16,384 tokens.
- Concurrency: three.
- Context: complete ordered manuscript through each task boundary; isolated defect patch when declared; automatic Writer selection without gold dependency hints.
- Authority: Explain, Diagnose, and Plan are read-only; Revise is immutable proposal-only.
- Sealed tasks: not loaded.

The candidate may be frozen only after a corrected 36/36 run satisfies every preregistered deterministic safety gate and the required evidence thresholds.
