# The Glass Orchard sealed corpus

`The Glass Orchard` is a synthetic, CC0 speculative-fiction corpus created after retrieval v2 was frozen at commit `e4684b8a2`. It is the one-shot sealed validation corpus for experiment 3C.

It changes the setting, plot mechanism, vocabulary, chapter structure, relationship structure, and motif system from both development novels. Its seven chapters contain 56 stable passages and twelve retrieval tasks spanning temporal evidence, mechanisms, object state, relationships, motifs, planning, revision, and calibrated uncertainty.

The retriever, task labels, and gates are committed before the first benchmark execution. No retrieval tuning is permitted after observing this corpus. Only invalid references, malformed checks, or provider/runtime failures may be corrected, with every correction disclosed. After the result is recorded, this corpus becomes diagnosed development data and cannot be reused for another held-out claim.
