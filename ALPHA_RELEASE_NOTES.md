# Novel Agent Harness 0.1.0 alpha 1

This is the first source-distributed public alpha of the Novel Agent Harness.

It provides a Git-backed headless Writer workflow for Explain, Diagnose, Plan, and scoped Revise. The harness compiles controlled narrative context, keeps analysis separate from edits, saves revisions as immutable content-addressed proposals, renders stale-safe review diffs, and requires an explicit author decision before a verified Git commit. Manuscript and typed story-state commits create content-addressed receipts and restore prior files and index state if a transaction fails before `HEAD` advances.

The repository also includes Writer Harness Bench, synthetic fiction corpora, recorded experiments, deterministic authority and scope gates, paired comparisons, confidence intervals, and production adapters for raw-model, stock-OpenCode, and the shipped Writer command.

Known limitations:

- distributed as source; requires Git, Bun 1.3.14, and Node.js 22 or newer;
- no public web application or stable standalone binary;
- Generate, Synchronize, Brainstorm, and Translate are outside this alpha;
- no broad literary-quality claim is made from the small synthetic production pilot;
- the retained generic runtime is derived from OpenCode and is not a security sandbox.

Read `README.md`, `RELEASE.md`, and `SECURITY.md` before using the alpha with valuable or private manuscript material.
