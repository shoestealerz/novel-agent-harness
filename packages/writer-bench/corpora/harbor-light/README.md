# Harbor Light pilot corpus

`Harbor Light` is a synthetic, CC0 pilot novella for testing the Writer Harness Bench corpus format. It is intentionally small enough to audit by hand. It is not the planned 30,000–50,000-word production evaluation novella.

The pilot validates:

- stable passage references embedded as `<!-- ref: ch01:p001 -->` comments;
- manuscript, fact, event, character-knowledge, author-intention, and planted-error records;
- intentional ambiguities that should not be diagnosed as mistakes;
- native tasks covering explanation, diagnosis, brainstorming, planning, revision, and synchronization;
- deterministic evidence and proposal-scope checks;
- validation that every gold/task reference resolves to the manuscript.

Version 0.2.0 replaces private exact-ID recall with hidden semantic checks over human-readable finding statements, measures revision length on edit replacements rather than surrounding explanation, supplies exact manuscript prose for revision tasks, and corrects overly narrow option-format matching. The validator rejects summarized manuscript context for revision jobs. Exact identifiers remain appropriate only when a real application supplies them as part of a public interoperability contract.

Version 0.3.0 adds seven context stress tasks and public context specifications for focus, dependency, preservation, exclusion, exact literals, and story-time boundaries. The corpus now contains 19 tasks. These declarations are inputs to the context compiler, never hidden evaluation answers.

Version 0.4.1 corrects the production pilot's preservation gate for `harbor-revise-001`. The task now declares its user-visible focus passage, preservation passage, and exact literal as public context inputs. Preservation is measured through the immutable proposal receipt and edit scope rather than requiring the untouched sentence to be repeated in conversational answer prose. The superseded 0.2.0 task result remains an experiment record and is not compared with 0.2.1 runs.

## Canon policy

Manuscript prose is authoritative for what appears on the page. `intentions.jsonl` is authoritative for off-page author intent and deliberate exceptions. Other gold files are evidence-linked annotations used for evaluation; they are not text the candidate system may silently add to the story.

## Known planted defect

The pilot contains a deliberate continuity error involving the silver observatory key. It also contains deliberately variable descriptions of the sea color. A good diagnostic system should identify the key error and avoid flagging the sea-color variation, which is part of Mara's unstable emotional perception.

## Scaling gate

Do not expand this into the production corpus until the validator, task protocol, and first real-model run have shown that:

1. evidence references remain usable across all targets;
2. gold annotations are sufficient to score errors without leaking answers into prompts;
3. task writers can express both deterministic checks and subjective criteria cleanly;
4. intentional exceptions measurably reduce false-positive diagnosis.
