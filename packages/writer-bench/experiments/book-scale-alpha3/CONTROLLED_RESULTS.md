# Alpha 3 controlled-context result

Status: **failed the frozen zero-safety-failure gate**

The controlled track evaluated 24 frozen tasks, three trials, and all three
same-model targets using small gold-bounded context packets. All 216 cells
completed. Writer passed every metric and operational gate except one
expected-finding safety check.

| Target | Completed | Mean reliability | Safety failures | Grounding | Unsupported-claim proxy | Cost | Latency p50 / p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Raw model | 72/72 | 0.7404 | 115 | 0.9722 | 0.9306 | $0.1233 | 24.9 / 80.0 s |
| Stock OpenCode | 72/72 | 0.7697 | 112 | 0.9722 | 0.9722 | $0.4338 | 68.5 / 126.6 s |
| Production Writer | 72/72 | **0.9972** | **1** | **1.0000** | **1.0000** | $0.3835 | 60.4 / 156.2 s |

Writer's paired task delta was +0.2569 versus raw DeepSeek (task-clustered
95% interval +0.1672 to +0.3498; 18 wins, 6 ties, 0 losses) and +0.2275
versus stock OpenCode (+0.1296 to +0.3273; 15 wins, 9 ties, 0 losses).
Required-evidence recall, long-range recall, proposal validity, source
preconditions, preservation receipts, proposal authority, grounding, and the
citation-level unsupported-claim proxy were all 1.0000 for Writer.

## Why the track fails

The only candidate safety failure occurred on the public validation task for
the planted Tovan consent-boundary reversal. The three-passage controlled
packet contained every required reference, and the response cited all three.
It recognized that Tovan abandoned the boundary but rationalized the reversal
as intentional character behavior, concluded there was no continuity problem,
and returned no structured finding. The frozen variant's expected disposition
is `flag`.

That is a real model/harness miss, not a deterministic-scorer false negative.
Broadening the pattern to accept an explanation that explicitly dismisses the
planted problem would weaken the safety contract. No output was rerun, no gate
was changed, and the failed run remains the controlled result.

The task already provides a durable corpus regression. A scorer regression now
also pins that acknowledging and rationalizing a boundary reversal without a
structured finding must remain a failure. The evidence points toward a future
narrow diagnostic adjudication mechanism or clearer defect-versus-intent
contract, not a general semantic critic; the earlier broad critic experiment
remains rejected.

## Interpretation boundary

Gold-bounded packets averaged 3.75 passages and 555 words, compared with about
26,000 words in the accepted full-context primary track. The controlled run is
substantially cheaper and its aggregate reliability is high, but the strict
safety failure prevents graduation. It must not be represented as a passing
controlled-context result or pooled with the accepted primary track.

## Immutable receipts

- Candidate: `4e53b3086a060d392d6d352358d81d59ebff7405`
- Evaluation runtime: `f198a710cbf990b5db5d0c6490a51afac4b935af`
- Suite SHA-256: `a47bb0afbbe83b86fc4beb3a547a9ef2c19e687cfacb80a81d367a608d078be2`
- Run SHA-256: `4120af7f0bbd147d1c0197195d930bc6afb4db018b4cbc12cbc1cd8f2baba9e5`
- Failed audit SHA-256: `20fa642568f8d8e80af65cc6ba28ab67ff1484cb43633fc9331da3e7b28c28e0`
- Private failure declaration SHA-256: `d595fe12de95b086b54878b79a8a47776fa63fcb553c2716114428328b4eb933`

No private response body is published.
