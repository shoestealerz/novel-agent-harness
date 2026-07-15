# Alpha release process

The current public release line is `v0.1.0-alpha.N`. It is a source-distributed harness alpha, not a finished writing application or a claim of general literary superiority.

## Release gate

Do not run the alpha release workflow until all of these are true:

- The repository is detached from the OpenCode fork network, its default branch contains only the imported baseline plus Novel Agent Harness work, and inherited OpenCode release tags have been removed.
- Linux and Windows Writer harness, unit, typecheck, and applicable end-to-end checks pass on the release commit.
- The preregistered production DeepSeek pilot completes three trials for raw model, stock OpenCode, and the shipped production Writer adapter with the same pinned model and inference settings.
- Production comparisons pass: no candidate mean-score regression, zero candidate deterministic safety failures, and no safety-failure increase.
- Restart recovery, stale-proposal rejection, model-configuration failure, author-only confirmation, Git scope, rollback, and receipt tests pass.
- The isolated `bun run verify:cli-install` check proves that the globally linked `novel` command launches on both Linux and Windows.
- The lifecycle-script-free source quick start succeeds in a fresh clone without relying on an unrelated globally installed Writer build; full native development requirements are documented separately.
- Security, contribution, data-handling, known-limitations, and OpenCode attribution documents match the release.
- No API keys, private manuscripts, hidden benchmark answers, or unlicensed corpus text are present in Git history or release artifacts.

The release operator selects `dev` and runs the `alpha-release` workflow with the exact tag matching the root `package.json` version. The workflow repeats the cross-platform Writer checks, validates the version, and creates a GitHub prerelease from the verified commit. It does not publish to npm, package registries, OpenCode channels, Discord, or upstream infrastructure.

## Alpha limitations

- Supported jobs are Explain, Diagnose, Plan, and scoped Revise.
- Revise creates an immutable proposal; only an explicit author action can commit it.
- Installation is from source. A stable standalone binary and package-manager distribution are not yet provided.
- The interactive terminal and headless workflows are public; the web application remains a separate private project.
- Generate, Synchronize, Brainstorm, and Translate are not silently mapped onto the four MVP jobs.
- Hierarchical semantic retrieval, verbose writer memory, and broad automatic critics remain experimental or rejected based on the recorded evaluations.
- The production pilot is a reliability gate on a small synthetic corpus. Broader fiction-quality claims require the larger corpus and blinded human review described in the roadmap.

## Versioning

Pre-release tags use `vMAJOR.MINOR.PATCH-alpha.N`. Proposal, receipt, manifest, state, and CLI JSON formats keep their own explicit format versions; a repository release does not waive compatibility checks on those artifacts.
