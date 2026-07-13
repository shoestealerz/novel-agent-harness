# The Quiet Meridian held-out corpus

`The Quiet Meridian` is a synthetic, CC0 speculative-fiction corpus created after the narrative retriever was frozen at commit `394884ec7`. It is a one-shot held-out validation corpus for retrieval experiment 3B, not a new development set.

The corpus deliberately changes the setting, vocabulary, plot mechanism, relationship arc, and motif system from Harbor Light. It contains eight chapters, 64 stable passages, two planted continuity/misdirection cases, and twelve retrieval tasks spanning temporal evidence, mechanism explanation, continuity diagnosis, motifs, relationship arcs, planning, revision, and character knowledge.

The retriever must not be changed in response to this corpus before the preregistered result is recorded. Corpus parsing errors, broken references, invalid checks, and provider/runtime failures may be corrected, but such corrections must be disclosed. Any later retrieval improvement belongs in a new development experiment and must be evaluated against a different held-out set.
