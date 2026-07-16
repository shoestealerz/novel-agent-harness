# Alpha 2 book-scale dogfood record

This directory records the preregistered operational dogfood of the public
`v0.1.0-alpha.2` Novel Agent Harness against the 36,122-word synthetic
*Saltglass Vigil* manuscript. It is evidence about the released CLI, not a
substitute for the later same-model comparison or blinded human review.

## Frozen system under test

- release: `v0.1.0-alpha.2`
- commit: `ed7cb682a93c393ae08ba0f4021e232e49c26af4`
- installed from: a fresh detached source clone
- supported Windows install: `bun install --frozen-lockfile --ignore-scripts`
- CLI install: `bun run install:cli`
- model: `deepseek/deepseek-v4-pro`
- manuscript: canonical *Saltglass Vigil*, 14 chapters, 36,122 words,
  252 reviewed passage references
- dogfood repository: a separate local Git repository with no benchmark gold,
  checks, variants, sealed tasks, or credentials

The DeepSeek credential was supplied through the process environment and was
not written to the manuscript repository or any artifact in this directory.
Machine-specific paths have been replaced with `<alpha2-source>` and
`<dogfood-workspace>`.

## Installation and workspace bootstrap

The documented Windows dependency command completed. Running the generic
`bun install --frozen-lockfile` without `--ignore-scripts` first failed while
building the optional PowerShell tree-sitter dependency because the machine
lacked the Visual Studio C++ build tools. This is not classified as a harness
failure because the alpha documentation already prescribes the working
Windows command.

`novel init --yes --title "Saltglass Vigil"` safely produced a valid workspace
without changing prose. It inserted one marker for each previously unmarked
chapter, yielding 14 passages. The alpha intentionally uses conservative
whole-chapter insertion, but that is too coarse for precise evidence selection
and scoped editing on a novella. The markers were author-reviewed and refined
to the corpus's 252 stable paragraph groups before further runs. The resulting
workspace loaded successfully with `novel state` and was committed to Git.

## Completed runs

| Run | Interface | Context | Result | Elapsed | Recorded usage |
| --- | --- | --- | --- | ---: | ---: |
| Explain key authority | `novel run` | automatic selection | completed, materially wrong final custody conclusion | 176.9 s | 653,509 input; 8,028 output; $0.049193831 |
| Diagnose future token | `novel run` | automatic selection | externally terminated after no result or progress | >184 s | unavailable |
| Diagnose future token | `novel run` | 3 explicit refs, 451 words | completed, false-positive diagnosis | 71.7 s | 2,479 input; 3,357 output; $0.003667659 |
| Plan romance option | `novel run` | 5 explicit refs, 624 words | completed, correctly withheld unauthorized prose | 48.2 s | 2,974 input; 1,984 output; $0.002688474 |
| Revise consent boundary | `novel run` | 3 explicit refs, 431 words | valid, scoped, preserved, uncommitted proposal | 62.5 s | 2,512 input; 3,116 output; $0.003637992 |
| Interactive two-turn Explain | `novel` | automatic selection | completed both turns; second receipt omitted prior-turn evidence | 182.7 s | turn 1: 13,775/3,383; turn 2: 121,106/7,213 |
| Revise key transfer | `novel run` | 3 explicit refs, 323 words | valid proposal; full interactive decision flow committed it | 63.4 s | 2,343 input; 3,935 output; $0.004111359 |
| Headless exact-session resume | `novel run --session` | 2 explicit refs | completed a grounded follow-up in the original session | 21.1 s | text format did not print usage |
| Revise accountable uncertainty | `novel run` | 3 explicit refs, 476 words | valid proposal and scoped commit | 51.2 s | 2,493 input; 2,868 output; $0.003248319 |
| Revise Cael choice | `novel run` | 3 explicit refs, 631 words | valid proposal and scoped commit | 98.7 s | 2,665 input; 5,496 output; $0.005609499 |
| Revise Orra surrender | `novel run` | 3 explicit refs, 543 words | valid proposal; forced Git failure rolled back exactly | 64.9 s | 2,626 input; 3,693 output; $0.004023924 |

The automatic Explain selector admitted 15 passages and 2,191 manuscript words,
but processed 647,044 selector input tokens plus 4,936 selector output tokens.
It omitted `ch12:p008`, `ch12:p010`, and `ch14:p016`, the late evidence needed to
understand transfer and retirement of the key. The answer therefore described
custody as unresolved. This behavior was observed after the validation suite
was frozen; the existing `saltglass-val-explain-006-key-authority` task already
captures the minimized model/context failure.

The bounded Diagnose rerun proved that the provider, execution contract, and
headless result path work when context is explicit. Its answer nevertheless
misread the eleven-day civic-calendar offset as a chronology problem. The
existing frozen `saltglass-val-diagnose-008-control-token-date` task captures
that intentional-exception false positive.

## Post-dogfood candidate

The first attempted repair exposed bounded passage leads through `novel_list`
and capped the Writer agent at eight steps. It was rejected as the production
selection strategy: one trial selected the final retirement passage with
56,346 selector input tokens, while the next consumed 205,218 and missed both
the transfer and retirement. The variation showed that a shorter catalog did
not remove the model's open-ended search problem. The lead-catalog behavior was
removed; its failed trials remain in `runs.jsonl`.

The retained candidate uses a single-pass full-manuscript selector for this
30,000–50,000-word milestone. The selector receives every ordered stable
passage in one bounded model request, has no narrative tools, and may return
only the structured reference selection. The execution model still receives
only the resulting controlled packet. This is full-context selection, not a
lexical or semantic retriever, and does not graduate any prior retrieval
candidate.

The first full-context trial found the exact key-authority chain on its first
model response but DeepSeek wrapped the valid object as `{ "output": ... }`.
The provider normalizer rejected that wrapper, retried twice, and ultimately
failed. The candidate now accepts the same `output` wrapper already accepted
as `input` or `answer`, with a deterministic regression. A second trial then
required one repair because the model redundantly selected and excluded the
same ref. Automatic full-context selection now constrains `excludeRefs` to an
empty array, since omission from the positive sets is sufficient.

The final key-authority dogfood trial used one selector call, selected all five
frozen required refs (`ch06:p015`, `ch08:p012`, `ch12:p008`, `ch12:p010`, and
`ch14:p016`), and returned the correct transfer and retirement conclusion.
Selector input fell from 647,044 to 74,486 tokens. End-to-end latency remained
149.8 seconds and recorded total cost was $0.044627375, so the candidate fixes
the unbounded loop and correctness failure but does not establish a cheap or
fast book-scale experience.

The final future-token trial correctly classified the civic-calendar offset
as intentional rather than erroneous. It selected `ch04:p001` and `ch04:p006`
but substituted other current-date evidence for frozen `ch08:p004`; therefore
content precision improved while the exact required-evidence recall for that
task was only 2/3. The validation suite, not this single dogfood sample, must
decide whether the broader evidence-recall gate passes.

The candidate also:

- emits a durable parent session ID before selection starts;
- emits machine-readable selection and execution phase events to stderr while
  preserving one parseable JSON object on stdout;
- caps the native Writer at eight model steps even when user configuration
  requests more;
- includes every finding's cited refs in the result-level evidence receipt.

These mechanisms have deterministic subprocess, session, agent-policy,
provider-normalization, and contract tests. They remain a candidate until the
public validation run is complete and a commit is frozen before sealed tasks.

## Operational workflow results

The following released Alpha 2 behaviors passed end to end:

- `/status`, `/job`, `/model`, `/session`, and `/new` reported or changed the
  interactive state as documented;
- exact interactive `--session`, interactive `--continue`, and exact headless
  `--session` resumed the same saved conversation after process exit;
- EOF at an interactive prompt saved a resumable session and exited cleanly;
- Plan retained read authority, explicitly identified the unresolved romance
  decision, and produced no prose edit;
- Revise produced content-addressed proposals with exact source preconditions,
  one-passage scope, preservation receipts, and uncommitted authority;
- `novel review` rendered the proposal diff without changing the manuscript;
- commit without `--yes` failed without mutation;
- `/reject` cleared the pending proposal but retained the immutable file;
- entering anything other than exact `APPLY` left the proposal unapplied;
- exact `APPLY` created a scoped Git commit containing only the proposal,
  receipt, and approved chapter change;
- a stale source passage was rejected before review or commit;
- unrelated Git work caused a safe preflight refusal instead of a mixed commit;
- an unavailable model failed before model execution and did not move HEAD;
- a forced Git identity failure after proposal application restored the exact
  chapter bytes, HEAD, index/status, and receipt count.

The stale-source test deliberately changed and then restored visible prose.
Changing only line-ending bytes still changed the passage hash and therefore
remained stale until the original CRLF bytes were restored. This is a
conservative source-binding property, not a silent corruption. Cross-platform
proposal portability remains unclaimed.

The invalid-model error correctly named the unavailable model, but its recovery
hint said `opencode models` instead of the public `novel models` command. This is
recorded as low-severity product-language friction rather than a material
correctness failure.

## Failure ledger

[`failures.jsonl`](failures.jsonl) is the machine-readable ledger. Stable IDs
are never reused. A failure may be split when its causes or remedies differ.
Model-behavior failures point to frozen benchmark tasks; harness-behavior
failures require deterministic tests before disposition.

The Alpha 2 operational matrix and targeted candidate reruns are complete.
Public validation attempt `A3-VAL-005` confirmed the retained fixes across all
36 cells with zero deterministic safety failures and perfect overall and
long-range evidence recall, grounding, and proposal safeguards. Exact commit
`4e53b3086a060d392d6d352358d81d59ebff7405` is frozen before sealed execution;
remaining accepted limitations stay open as product evidence rather than
candidate blockers.
