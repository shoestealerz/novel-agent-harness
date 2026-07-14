# Retrieval v2 sealed-validation results

## Decision

Retrieval v2 does not graduate. It improves recall, downstream mean score, and safety failures on Glass Orchard while preserving precision and temporal safety, but its +0.0375 recall gain misses the preregistered +0.08 gate. The failed result is retained unchanged.

The hard temporal boundary remains a required invariant. Hybrid v2 remains an experimental challenger rather than the default retriever. Further retrieval tuning is paused so the roadmap does not overfit successive small synthetic corpora; experiment 4 will isolate immutable edit proposals using controlled task-aware context.

## Experimental controls

- Date: 2026-07-13
- Frozen retriever: `e4684b8a2`
- Frozen corpus/preregistration: `9a31094b3`
- Corpus: Glass Orchard 1.0.0, 5,013 words, 56 passages, 12 tasks
- Control: hierarchical-temporal retrieval v1
- Diagnostic: coverage-temporal v2
- Candidate: hybrid-temporal v2 with `onnx-community/all-MiniLM-L6-v2-ONNX`
- Deterministic trials: one per target
- Downstream trials: three per target, 72 cells total
- Model: `deepseek-v4-pro`, temperature 0.2, maximum output 4096
- Deterministic run: `2026-07-13T23-39-42-016Z-b8ed2e0d`
- Downstream run: `2026-07-13T23-50-50-943Z-10805338`

## Deterministic retrieval

| Strategy | Recall | Precision | Temporal safety | Mean items | Mean latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Retrieval v1 | 0.6611 | 0.6639 | 1.0000 | 3.7500 | 3.73 ms |
| V2 coverage | 0.6194 | 0.6014 | 1.0000 | 3.7500 | 17.37 ms |
| V2 hybrid | 0.6986 | 0.6639 | 1.0000 | 3.7500 | 730.21 ms |

Hybrid v2 improved three tasks, regressed two, and tied seven relative to v1 on required-reference recall. Its clearest gains were the father-survival evidence, voice-transport mechanism, blue-cord relationship motif, and pale-moth motif. It regressed the gallery-fall diagnosis and evidence-led identity plan. The coverage-only strategy generalized poorly; embeddings recovered and exceeded v1, but not by the registered margin.

The deterministic comparison failed only the recall-delta gate:

- recall delta: +0.0375 versus required +0.08;
- precision delta: 0.0000, pass;
- temporal-safety delta: 0.0000 at an absolute 1.0000, pass;
- item-budget delta: 0.0000, pass.

## Downstream DeepSeek result

| Target | Completed | Mean score | Safety failures | Grounding | Unsupported-claim avoidance | Output tokens/task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Retrieval v1 | 36/36 | 0.7391 | 23 | 0.7981 | 1.0000 | 2530.28 |
| Retrieval v2 | 36/36 | 0.7478 | 20 | 0.7838 | 1.0000 | 2520.92 |

Paired mean delta was +0.0086 with a 95% bootstrap interval of -0.0616 to +0.0765 and wins/ties/losses of 6/3/3. V2 reduced safety failures by three. Grounding regressed by 0.0144, inside the allowed 0.02 limit, and mean output decreased by 9.36 tokens. Every downstream gate passed except the inherited retrieval-recall gate.

## Runtime disclosure

The first downstream attempt was terminated by the desktop shell's ten-minute command ceiling before the runner wrote a run artifact. It produced no scored result. The complete rerun kept the model, tasks, trials, temperature, output limit, and targets fixed; worker concurrency increased from three to five. It completed 72/72 cells without execution failures. The rerun above is the sole official downstream record.

## Interpretation

Writing-aware coverage rules were the main development-set improvement but did not generalize alone. Dense semantic similarity was necessary on the sealed novel, yet its gains were uneven: it recovered thematic and mechanism links while sometimes displacing causal evidence close to a focus passage. A single blended ranking score is therefore not a sufficient general retrieval architecture for novel-scale work.

The next retrieval design should be evaluated only after other harness mechanisms mature. Likely directions are typed indexes for object state, events, testimony, and relationships; query-specific subretrievers; and an explicit evidence-set optimizer rather than one global rank. Those hypotheses are recorded but not tuned on Glass Orchard.
