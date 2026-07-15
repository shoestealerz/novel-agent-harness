# Security policy

## Supported versions

Novel Agent Harness is pre-release software. Security fixes are made on the `dev` branch and in the newest alpha release only.

## Reporting a vulnerability

Please use GitHub's private [Report a vulnerability](https://github.com/shoestealerz/novel-agent-harness/security/advisories/new) form. Do not open a public issue for an unpatched vulnerability and do not include private manuscript text, provider credentials, or other secrets in a report.

## Threat model

Novel Agent Harness runs locally and inherits a powerful agent runtime. It is not a security sandbox. A configured model or extension can receive context, inspect allowed files, and invoke tools permitted by the host. Run untrusted repositories, plugins, and MCP servers inside a container or virtual machine when isolation matters.

The author-confirmation protocol is an integrity boundary, not a sandbox. Models can analyze text and create immutable proposals, but the trusted host must keep confirmation and commit operations outside the model tool loop. A host that exposes confirmation construction, commit functions, or unrestricted filesystem tools to the model defeats that boundary.

Manuscript passages, story state, prompts, and session history may be sent to the model provider selected by the user. Provider retention and training policies are outside this project's control. API keys must be supplied through provider configuration or process environment and must never be committed to a novel workspace, benchmark result, or bug report.

Git-backed workspaces and proposal receipts protect review scope and detect stale inputs; they do not make malicious repository contents safe. Review changes before confirmation and keep backups of valuable manuscripts.

Server mode is optional. If enabled, require authentication and bind only to trusted interfaces. An unauthenticated server intentionally exposes the capabilities configured by its operator.

## Security invariants for contributions

- Explain, Diagnose, and Plan remain read-only.
- Revise creates proposals only; it never confirms or commits them.
- Manuscript and state commits require an explicit author decision bound to one exact proposal.
- Source hashes, evidence, Git scope, staged blobs, and `HEAD` are revalidated immediately before commit.
- Secrets and hidden benchmark answers never enter model-visible context or committed result fixtures.
