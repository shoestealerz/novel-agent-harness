# Alpha 3 primary book-scale result

Status: **accepted with explicit benchmark-recovery limitations**

The frozen 60-task sealed track ran three trials across raw DeepSeek, stock
OpenCode, and production Writer using the same DeepSeek V4 Pro comparison
identity. The revision-7 fail-closed audit accepted all 540 records. Writer
completed 179/180 cells; the one proposal-preservation execution failure is
retained under the preregistered 95% completion threshold.

| Target | Completed | Mean reliability | Safety failures | Grounding | Unsupported-claim proxy | Cost | Latency p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw model | 180/180 | 0.5923 | 444 | 0.8667 | 0.8333 | $0.4059 | 38.7 / 92.4 s |
| Stock OpenCode | 180/180 | 0.6502 | 402 | 0.9778 | 0.9556 | $2.7864 | 121.8 / 268.3 s |
| Production Writer | 179/180 | **0.9675** | **0** | **1.0000** | **1.0000** | $5.1395 | 83.4 / 168.8 s |

Writer's paired task delta was +0.3754 versus raw DeepSeek (task-clustered
95% interval +0.3081 to +0.4421; 49 wins, 11 ties, 0 losses) and +0.3175
versus stock OpenCode (+0.2518 to +0.3824; 48 wins, 12 ties, 0 losses).
Required-evidence recall, long-range recall, proposal validity, source
preconditions, preservation receipts, and uncommitted authority were all
1.0000 for Writer.

## Interpretation boundary

This is strong evidence that the current harness improves deterministic
book-scale reliability over direct prompting and stock OpenCode on the
synthetic *Saltglass Vigil* suite. It is not yet evidence of better literary
prose, voice, pacing, dramatic effect, or usefulness; those claims remain
blocked on the frozen blinded human review.

The result is accepted but is not a pristine first-pass confirmatory result.
`A3-PRIMARY-002` exposed missing and overly narrow scoring metadata, and
`A3-PRIMARY-003` exposed an implementation mismatch between the new metric and
its preregistered admitted-context definition. Both attempts were declared
failed and hash-sealed before the relevant response inspection, retained in
the public ledger, converted to regression tests, and followed by separately
versioned freezes. Revision 7 made no provider calls and byte-preserved all 539
responses plus the single failed record.

Additional limitations:

- Unsupported-claim avoidance is a citation-level admitted-context proxy. It
  does not establish that every uncited prose statement is factually supported.
- Complete bounded context averaged roughly 26,000 words. This supports the
  novella-scale reliability policy, not broad retrieval or larger manuscripts.
- The corpus is wholly synthetic and represents one long-form fiction design.
- Writer cost more than raw prompting, though it was faster than stock OpenCode
  at the median in this run.

## Immutable receipts

- Candidate: `4e53b3086a060d392d6d352358d81d59ebff7405`
- Evaluation runtime: `f198a710cbf990b5db5d0c6490a51afac4b935af`
- Suite SHA-256: `c4683228db52feefa65a07312f8af7b11ca8f5b1321c82a8c07659208664df88`
- Run SHA-256: `b83b0d4391488747145d3d577fbec0071a2be734c3326456292a989860569e2f`
- Audit SHA-256: `82e6b799ee357b9c62bce8d298ee331fefbfa2973893dc13d289bcd17ed5bb57`
- Zero-call verification SHA-256: `ba87e40442f283ef3044e328900c022f9870cd4585d921f506104c2a01352c0c`
- Acceptance SHA-256: `d5557931d105f7efd44fef59f4b01470d67331f94f9841ad05c555d3b4adf054`

Raw sealed responses, private task bodies, and credentials are not published.
