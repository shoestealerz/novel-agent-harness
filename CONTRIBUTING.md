# Contributing to Novel Agent Harness

Novel Agent Harness is an experimental, public agent harness for long-form fiction. The generic runtime began as an OpenCode source import; new work should strengthen writer-specific behavior, safety, evaluation, or maintainability.

## Before opening a change

- Search existing issues and pull requests.
- Keep changes scoped. Separate upstream-runtime refactors from writer behavior when practical.
- Do not add copyrighted novels or text without explicit redistribution rights. Benchmark corpora must be synthetic, public domain, or permissioned and must record their provenance.
- Do not put API keys, private manuscripts, hidden gold answers, or provider responses containing secrets in commits or CI logs.

## Development setup

The repository requires Bun 1.3.14, Node.js 22 or newer, and Git. Windows contributors running the full monorepo install also need Visual Studio Build Tools with the C++ workload for inherited native parser dependencies.

```sh
bun install --frozen-lockfile

bun run --cwd packages/writer typecheck
bun run --cwd packages/writer test

bun run --cwd packages/opencode typecheck
bun run --cwd packages/opencode test

bun run --cwd packages/writer-bench typecheck
bun run --cwd packages/writer-bench test
```

Run the narrowest relevant tests while developing, then the package-level checks before opening a pull request. Changes to Writer contracts, context, proposals, story state, headless sessions, or benchmark adapters must pass the cross-platform Writer harness workflow.

## Writer invariants

Contributions must preserve the trusted author boundary:

1. Explain, Diagnose, and Plan are read-only.
2. Revise may save an immutable proposal but may not apply it.
3. Only trusted host code may construct author confirmation or call commit operations.
4. Commits revalidate proposal identity, source and state hashes, evidence, Git scope, staged blobs, and unchanged `HEAD`.
5. Hidden evaluation material stays outside model-visible context.

A quality improvement does not excuse a deterministic authority, scope, stale-input, or preservation failure.

## Benchmark changes

Use the same model revision and inference settings across compared targets. Preregister release gates before paid runs, retain complete result artifacts, and distinguish development results from sealed or held-out evidence. Model judges may supplement deterministic checks; they do not replace them or blinded human review for broad literary-quality claims.

## Pull requests

PR titles use conventional commit form:

- `feat(writer): ...`
- `fix(opencode): ...`
- `test(writer-bench): ...`
- `docs: ...`
- `refactor(core): ...`
- `chore(ci): ...`

Complete every section of the pull request template, describe the author-facing or reliability effect, and list the exact checks you ran. Maintainers may merge small related commits with squash merge.

## Security reports

Follow [SECURITY.md](SECURITY.md). Do not disclose an unpatched vulnerability in a public issue.
