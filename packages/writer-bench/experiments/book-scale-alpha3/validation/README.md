# Alpha 3 public validation

This directory records validation-task dogfood before the Alpha 3 candidate is frozen. It never contains sealed task bodies, private reviewer identities, credentials, or unpublished manuscripts.

The validation split is run one trial at a time against the production Writer target. Every attempt is immutable in `attempts.jsonl`. A failed or invalid attempt remains in the ledger and is not pooled with a corrected suite version.

## Attempt 1 decision

`A3-VAL-001` completed all 36 public validation tasks, but it cannot support a candidate freeze.

- The native corpus adapter populated the isolated workspace correctly, then converted gold `contextSpec` fields into explicit Writer CLI flags. Any declared context causes the released Writer session to bypass automatic selection, so most tasks admitted only their focus passage. Required-evidence recall was 0.5937 overall and 0.5843 on long-range tasks.
- Eleven scoped Revise tasks required a preservation passage but omitted that passage from the citation-grounding allowlist. The harness correctly selected and receipted the preservation passage, and the scorer incorrectly counted that required citation as a safety failure.

The adapter now marks materialized native manuscripts for automatic selection and withholds gold context hints from the Writer CLI. The task generator includes every required preservation passage in its grounding allowlist. Because this corrects invalid validation tasks, the corpus manifest moves from 0.2.0 to 0.2.1, the suite moves from 0.3.0 to 0.3.1, and the sealed receipt is regenerated before any sealed task is executed.

## Attempt 2 decision

`A3-VAL-002` completed 30 of 36 public validation tasks but also cannot support a candidate freeze.

- Four cells exceeded the production adapter's internal four-minute timeout. Two more failed because the non-strict selector returned malformed array or preservation fields. These are execution failures, not benchmark misses.
- The scorer mixed required-evidence recall with a minimal-gold precision penalty. It also treated the small required-evidence set as an exhaustive grounding allowlist, so a detailed answer citing other passages from its admitted packet could be marked unsafe.
- The selector prompt simultaneously encouraged accounting for inspected passages while forbidding explicit exclusions, causing avoidable over-selection.

The runtime timeout is now nine minutes beneath a ten-minute cell limit. Selector output is normalized more defensively, author-declared focus and exact preservation constraints remain authoritative during automatic selection, and the prompt asks for a minimal relevant packet. Context recall is now pure required-reference recall over the selector trace; grounding checks citations against the actual admitted packet. These benchmark-semantic corrections move the corpus manifest from 0.2.1 to 0.2.2 and the suite from 0.3.1 to 0.3.2. Attempt 2's reported recall and grounding remain in the ledger but must not be compared with corrected runs.

## Attempt 3 decision

`A3-VAL-003` used the corrected 0.3.2 scorer and completed 31 of 36 cells. It is a valid failed validation attempt, not a freeze candidate.

- Every completed response grounded all citations in its admitted packet. Proposal validity, source preconditions, preservation receipts, and uncommitted authority were each 1.0000, with no completed-cell safety failure.
- Five cells exhausted structured-output repair because DeepSeek returned `focusRefs` in an additional non-strict container shape. Completion was 86.1%, below the 95% gate.
- Required-evidence recall was 0.6720 overall and 0.6460 on long-range tasks, below the 0.85 and 0.75 gates. The common failure was local adequacy with omitted distant setup, transition, voice, or character-knowledge evidence.

The next candidate must canonicalize the observed container shapes and add a bounded second-pass coverage audit over the already supplied manuscript. The audit may union missing evidence into the preliminary packet but may not receive gold dependencies, invoke broad retrieval, edit text, or weaken author-declared focus and preservation constraints. This changes candidate behavior, not benchmark semantics, so corpus 0.2.2 and suite 0.3.2 remain fixed.

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
