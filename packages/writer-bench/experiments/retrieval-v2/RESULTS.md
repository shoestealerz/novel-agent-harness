# Retrieval v2 development results

## Decision

Freeze hybrid-temporal retrieval v2 for one sealed validation. It materially improves retrieval on both development novels without reducing precision, temporal safety, or the task-defined item budget. This is not a graduation result because Harbor Light and Quiet Meridian were both inspected during development.

## Experimental controls

- Date: 2026-07-13
- Corpora: Harbor Light 0.4.0 (7 tasks, 32 passages) and Quiet Meridian 1.0.0 (12 tasks, 64 passages)
- Trials: one deterministic trial per target
- Control: frozen hierarchical-temporal retrieval v1
- Candidate A: coverage-temporal retrieval v2 without embeddings
- Candidate B: hybrid-temporal retrieval v2 with `onnx-community/all-MiniLM-L6-v2-ONNX`
- Temporal policy: hard `throughRef` filtering for every temporal candidate
- Hidden isolation: relevance labels remain evaluator-only
- Run IDs: `2026-07-13T23-27-31-755Z-3e5745cd` and `2026-07-13T23-27-31-755Z-b6ce1bfd`

## Results

### Harbor Light

| Strategy | Recall | Precision | Temporal safety | Mean latency |
| --- | ---: | ---: | ---: | ---: |
| Retrieval v1 | 0.9524 | 0.7024 | 1.0000 | 3.11 ms |
| V2 coverage | 1.0000 | 0.7381 | 1.0000 | 15.64 ms |
| V2 hybrid | 1.0000 | 0.7381 | 1.0000 | 479.89 ms |

### Quiet Meridian

| Strategy | Recall | Precision | Temporal safety | Mean latency |
| --- | ---: | ---: | ---: | ---: |
| Retrieval v1 | 0.6875 | 0.5496 | 1.0000 | 4.71 ms |
| V2 coverage | 0.7944 | 0.6260 | 1.0000 | 26.03 ms |
| V2 hybrid | 0.8111 | 0.6399 | 1.0000 | 650.38 ms |

All targets returned exactly the task-defined number of items and had no execution failures. Hybrid embeddings add no Harbor Light gain but add 0.0167 recall and 0.0139 precision on Quiet Meridian. The coverage-only variant remains a useful lower-latency fallback.

## Discarded iterations

- A first query-expansion implementation accidentally changed the v1 control. It was discarded and the original control path restored before the recorded comparison.
- Raising anchor-relation weight from 0.15 to 0.25 reduced Quiet Meridian recall from 0.7944 to 0.7903. The lower weight was restored.
- `Xenova/all-MiniLM-L6-v2` returned HTTP 403 for its requested quantized artifact. That provider failure produced no benchmark result. The candidate now uses the maintained ONNX Community export and its documented default artifact.

## Interpretation

The largest gain comes from writing-aware coverage rather than dense embeddings. Decomposing a request, matching relations to focus and preservation anchors, and avoiding redundant neighbors recovers evidence that a single lexical score misses. Embeddings provide a smaller second-stage benefit and impose roughly 0.5–0.65 seconds of per-process cold-start latency in this benchmark configuration.

The candidate is now frozen. The next result must use a newly authored, preregistered corpus whose relevance labels are not inspected until after execution. Retrieval graduates only if that sealed test passes its gates; otherwise the temporal invariant and useful mechanisms remain available without making a generalization claim.
