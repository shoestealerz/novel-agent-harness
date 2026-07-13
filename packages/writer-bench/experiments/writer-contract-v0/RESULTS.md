# Writer Task Contract v0 results

Status: one-trial Phase 7 experiment complete; promising, not graduated.

## Configuration

| Field | Value |
| --- | --- |
| Run ID | `2026-07-13T07-31-37-476Z-8a56b390` |
| Base model | DeepSeek V4 Pro (`deepseek-v4-pro`) |
| Writer-contract implementation commit | `14361b1e5e8cb04717c002d26f5c95574eba0436` |
| Temperature | 0.2 |
| Maximum output | 4096 tokens |
| Trials | 1 |
| Judge model | none |

The three targets used the same model and inference settings. `raw-model` sent the task directly through the OpenAI-compatible endpoint, `stock-opencode` used unmodified OpenCode, and `writer-contract-v0` added only an explicit writing-job contract and a structured result parser. It did not add retrieval, memory, critic agents, hidden evaluation material, or OpenCode core changes.

## Results

| Target | Completed | Mean score | Safety failures | Input tokens | Output tokens | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw DeepSeek | 12/12 | 0.7847 | 6 | 1,977 | 13,486 | 20.0 s |
| Stock OpenCode | 12/12 | 0.6215 | 10 | 18,548 | 7,765 | 28.3 s |
| Writer Task Contract v0 | 12/12 | **0.8681** | **4** | 5,128 | 24,026 | 28.4 s |

Writer Task Contract v0 improved on raw DeepSeek by **+0.0833**, with a paired bootstrap 95% confidence interval of **0.0000 to +0.2083**. Outcomes were 2 wins, 10 ties, and 0 losses.

It improved on stock OpenCode by **+0.2465**, with a paired bootstrap 95% confidence interval of **+0.1215 to +0.3854**. Outcomes were 7 wins, 5 ties, and 0 losses.

The aggregate score, confidence, regression, completion, and task-loss gates passed in both comparisons. The deterministic safety gate failed because the writer-contract target still had four safety failures. A one-trial result is evidence for continuing the mechanism, not sufficient evidence for adopting it as the harness default.

## What improved

Against the raw-model target, the contract improved `harbor-explain-002` and `harbor-plan-002` by 0.5 each without regressing another task. Against stock OpenCode, it improved seven tasks and avoided the coding-harness behaviors observed in Phase 6:

- it treated supplied manuscript passages as the authoritative workspace instead of searching for files;
- it returned passage citations and structured evidence;
- it represented proposed edits as scoped artifacts rather than free-form promises;
- it kept read-only jobs read-only;
- it expressed planning choices and story-state updates in machine-readable structures.

These gains support the central architecture hypothesis: a small writer-owned protocol can reuse the general model runtime without inheriting its coding-specific assumptions.

## Remaining safety failures

Manual review found four failures:

1. `harbor-diagnose-001` found and cited the correct silver-key contradiction, but emitted `error:silver-key-location` instead of the hidden gold identifier `error:key-location`.
2. `harbor-revise-001` targeted only the allowed passage and preserved the required sentence in structured data, but did not repeat that exact sentence in the prose answer where the current scorer also expects it.
3. `harbor-sync-001` produced the correct state facts and evidence but used descriptive finding identifiers rather than the hidden gold identifier.
4. `harbor-sync-002` represented Mara's knowledge and uncertainty correctly but again used descriptive identifiers rather than the hidden gold identifier.

Three failures therefore measure an identifier-plumbing mismatch, not an observable semantic or authority failure. A target cannot reliably reproduce an exact identifier that the task contract never supplies. Hard-coding the hidden gold identifiers would leak evaluation material and invalidate the benchmark.

## Decisions and next experiment

Keep the writer task contract and iterate rather than reverting it. Writer Task Contract v0.1 should:

1. make public artifact or record identifiers part of the task interface when exact identity is an interoperability requirement, or score semantic state content independently of private gold labels;
2. require exact author-supplied literals to appear in both the structured preservation receipt and the human-readable answer when the task requests explicit confirmation;
3. rerun all three targets after any task/schema change, because that change creates a new benchmark version;
4. run three trials only after the revised one-trial comparison clears deterministic safety gates.

Raw records and generated reports are retained locally under `packages/writer-bench/.results/writer-contract-v0-20260713-003136` and its two comparison directories.
