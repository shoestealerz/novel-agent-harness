# Novel Agent Harness 0.1.0 alpha 2

This release adds the first one-command interactive Writer experience to the source-distributed public alpha.

After the one-time source install and `bun run install:cli`, run `novel` from a Novel Agent workspace. The CLI keeps an ongoing, resumable Writer conversation; routes Explain, Diagnose, Plan, and scoped Revise requests; and exposes Writer-specific `/status`, `/job`, `/model`, `/review`, `/reject`, `/new`, and `/session` commands. `/approve` always renders the exact proposal, requires the author to type `APPLY`, and then delegates to the same stale-safe verified Git transaction as the headless command.

`novel init` can now conservatively discover committed chapter files under conventional manuscript, chapter, or draft paths. `novel login [provider]`, `novel providers`, and `novel models` expose retained provider configuration without sending authors through the generic coding CLI.

It retains the Git-backed headless Writer workflow for Explain, Diagnose, Plan, and scoped Revise. The harness compiles controlled narrative context, keeps analysis separate from edits, saves revisions as immutable content-addressed proposals, renders stale-safe review diffs, and requires an explicit author decision before a verified Git commit. Manuscript and typed story-state commits create content-addressed receipts and restore prior files and index state if a transaction fails before `HEAD` advances.

The repository also includes Writer Harness Bench, synthetic fiction corpora, recorded experiments, deterministic authority and scope gates, paired comparisons, confidence intervals, and production adapters for raw-model, stock-OpenCode, and the shipped Writer command.

Known limitations:

- distributed as source; the `novel` CLI requires Git and Bun 1.3.14 or newer, while benchmark and full development commands also require Node.js 22 or newer;
- no public web application or stable standalone binary;
- Generate, Synchronize, Brainstorm, and Translate are outside this alpha;
- no broad literary-quality claim is made from the small synthetic production pilot;
- the retained generic runtime is derived from OpenCode and is not a security sandbox.

Read `README.md`, `RELEASE.md`, and `SECURITY.md` before using the alpha with valuable or private manuscript material.
