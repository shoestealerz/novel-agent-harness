# Novel Agent Harness fork notes

This public fork adapts OpenCode's generalized agent runtime for long-form fiction writing, editing, and eventually translation.

## Upstream

- Repository: `https://github.com/anomalyco/opencode`
- Default branch: `dev`
- License: MIT; retain upstream copyright and license notices
- Local remote convention: `upstream` is OpenCode and `origin` is this fork

## Product boundary

This repository owns the reusable agent harness:

- Writer-intent interpretation
- Narrative tools and permissions
- Manuscript and story-state schemas
- Context compilation and retrieval interfaces
- Reviewable prose and story-state proposals
- Agent sessions, tracing, skills, and provider integration
- Evaluation fixtures and graders

It does not own the private commercial web product, account system, billing, collaboration features, or proprietary product UI.

## Fork policy

1. Prefer additive packages and domain-profile extension points.
2. Keep the upstream coding profile building until the writer profile is proven.
3. Avoid broad renames during the MVP.
4. Do not modify provider, session, permission, or protocol internals unless a documented extension point is insufficient.
5. Record every intentional upstream divergence in this file.

## Intentional divergences

### Writer domain package

`packages/writer` defines domain contracts that must not depend on the private web application.

The first contracts are:

- `WriterTask`: normalized writer intent and constraints
- `ProsePatchProposal`: non-authoritative manuscript changes with evidence
- `StoryStateProposal`: non-authoritative canon changes with evidence

The model-facing runtime may create proposals. Only an external approval boundary may commit them.
