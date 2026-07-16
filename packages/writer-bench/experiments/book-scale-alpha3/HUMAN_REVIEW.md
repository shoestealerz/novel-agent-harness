# Alpha 3 blinded human-review operations

This document operationalizes the preregistered human review before any
authoritative output is accepted or shown to a reviewer. It does not change the
frozen task sample, output trial, pair identities, left/right assignments,
eligibility rules, dimensions, thresholds, or minimum sample. The first primary
model attempt was declared invalid for infrastructure and provider-credit
failures; its sealed response content was not inspected and none of its outputs
is eligible for review.

The private manifest receipt is
`4981dee253c5017eee6f604603431f4372403d4598ecaf8827347a95abaec336`.
It selects trial zero for 96 comparisons across 48 Plan and Revise tasks. Each
pair compares Production Writer independently with raw model or stock OpenCode.
The separate `human-review-run.freeze.json` pins the required 144-cell
full-context output track. After the accepted primary run, 81
development/validation cells are executed in a separate one-trial run and
deterministically assembled with 63 sealed trial-zero cells from primary;
review outputs are never selected by score or preference.

## Rating instrument

Reviewers score both blinded responses independently on five dimensions:

1. prose quality;
2. voice retention;
3. pacing or dramatic effect;
4. constraint fidelity; and
5. usefulness to the author.

Every dimension uses the same anchored five-point scale:

| Score | Anchor |
|---:|---|
| 1 | materially harmful or unusable |
| 2 | weak; major repair needed |
| 3 | acceptable; useful with ordinary revision |
| 4 | strong; minor repair only |
| 5 | exceptional for this request and source |

After independent scoring, the reviewer must choose Response A, tie, or
Response B. Per-response defect flags and a concise rationale are optional. The instrument
collects eligibility and consent before showing a pair. It presents only the
author request, necessary source passages, answer, and proposed prose. It omits
target names, model and run metadata, proposal identifiers, token and cost data,
execution order, deterministic checks, gold answers, and other ratings.

The manifest freezes left/right placement. Pair order is independently and
deterministically shuffled for each reviewer with HMAC-SHA256 over the frozen
seed, reviewer code, and pair ID. The generated packet contains no unblinding
map.

## Reviewer workflow

An eligible reviewer must be an adult fluent English reader who writes or
substantively edits fiction, did not author either output, and consents to
de-identified publication. Use pseudonymous reviewer codes; do not put names or
email addresses in packets or submissions.

After the authoritative primary and supplemental review runs succeed, assemble
the frozen sources without reading response content:

```powershell
bun src/cli.ts human-review assemble `
  --primary <accepted-primary-run.json> `
  --supplemental <public-split-review-run.json> `
  --manifest <private-manifest.json> `
  --out <private-composite-directory>
```

Verify and freeze `assembly.json`, then generate one offline packet per
reviewer from the composite `run.json`:

```powershell
bun src/cli.ts human-review prepare `
  --run <private-composite-directory/run.json> `
  --manifest <private-manifest.json> `
  --reviewer <pseudonymous-code> `
  --out <private-packet-directory>
```

Open `review.html` locally. Progress stays in that browser's local storage. The
reviewer exports a JSON submission only after completing every pair. Keep the
HTML, packet JSON, and submission private because they contain sealed source
passages and model outputs.

At least three eligible reviewers must complete every pair, producing at least
288 pair ratings. Recruit additional reviewers before unblinding if any pair is
short after exclusions.

## Quantitative freeze and analysis

Analyze all eligible submissions without reading optional comments:

```powershell
bun src/cli.ts human-review analyze `
  --manifest <private-manifest.json> `
  --rating <reviewer-1.json> `
  --rating <reviewer-2.json> `
  --rating <reviewer-3.json> `
  --out <private-analysis-directory>
```

The analyzer:

- validates study, reviewer, pair, score, eligibility, and consent invariants;
- reports per-pair missing ratings and refuses to label the sample complete
  below either frozen minimum;
- maps left/right ratings back to Production Writer only during analysis;
- reports five-point distributions, means, and deltas by named baseline;
- reports forced-preference wins, ties, losses, and Fleiss' kappa;
- reports preference by Plan and Revise family;
- computes deterministic 10,000-draw task-clustered bootstrap intervals, with a
  tie worth one-half preference point; and
- hashes the quantitative submission content while excluding rationales.

Freeze `quantitative.json`, its SHA-256 hash, and the exact submission receipts
before reading rationales. Only then may comments be inspected for qualitative
failure categorization. Comments cannot change scores, exclusions, automated
gates, or the capability decision rubric.

Production Writer is preferred only if the task-clustered 95% preference
interval is entirely above 0.50 and every automated safety gate passes. An
interval that includes 0.50 with a lower bound of at least 0.40 is reported as no
detected material preference penalty. All other outcomes are reported without
creative-quality improvement claims.
