# OpenCode-to-writing-harness implementation plan

## 1. Goal

Turn OpenCode into a reusable, public agent harness for long-form fiction without rebuilding its generalized agent infrastructure.

The harness succeeds when it can:

1. Understand what a writer wants changed or investigated.
2. Find the necessary evidence across a long manuscript and accepted story state.
3. Ask a focused creative question only when the answer materially changes the work.
4. Produce cited analysis or a bounded prose-and-story-state proposal.
5. Validate the proposal against scope, canon, time, character knowledge, and stated constraints.
6. Stop at an approval boundary before changing authoritative project state.
7. Resume the session and revert an accepted change reliably.

The private product UI, accounts, billing, collaboration, and publishing workflow are separate consumers of this harness.

## 2. MVP boundaries

### Included

- Markdown fiction projects
- Chapter, scene, and stable-block indexing
- Project-level author instructions
- Exact and semantic manuscript search
- Character, place, event, timeline, arc, and knowledge-state records
- Writer-intent normalization
- Read-only story questions and continuity diagnosis
- Reviewable block-level prose patches
- Paired story-state proposals
- Explicit approval and reversible checkpoints
- Provider-neutral model configuration inherited from OpenCode
- Skills for bounded editorial workflows
- CLI/server/SDK access suitable for a private web client
- Evaluation fixtures, baselines, and graders

### Deferred

- Product-specific web UI
- DOCX and Scrivener fidelity beyond an import/export spike
- Multi-user collaboration
- Literary translation
- Automatic full-book generation
- Autonomous research and browser use
- General shell access for the writer agent
- Multi-agent orchestration unless evaluation demonstrates a need
- Fine-tuning before prompt, context, and tool baselines are established

## 3. Reuse, adapt, and replace

### Reuse with minimal changes

| OpenCode subsystem | Why it stays |
|---|---|
| Provider layer | Model and provider neutrality |
| Session V2 execution | Durable input admission, continuation, interruption, and streaming |
| Message and event protocol | Existing server/client communication |
| Permission evaluator | Allow, ask, and deny behavior per tool and agent |
| Skills and plugins | On-demand editorial workflows and extensions |
| MCP support | Future integrations without core coupling |
| Config loading | User, project, and managed configuration |
| Server and SDK generation | Public harness API for private and third-party clients |
| Compaction lifecycle | Long-running conversation management |
| Question tool | Material writer decisions and clarification |
| Snapshot/revert concepts | Reversible accepted changes |

### Adapt through extension points

| OpenCode subsystem | Required adaptation |
|---|---|
| Project/instance context | Add fiction-project metadata and narrative-store services |
| Agent definitions | Register a writer profile and writer-specific hidden agents |
| System prompt assembly | Insert a domain prompt layer before provider-specific behavior |
| Tool registry | Register and filter tools by domain profile |
| Instructions | Load `AUTHOR.md` in addition to coding instruction sources |
| Context sources | Add manuscript, story state, decisions, and voice evidence |
| Diff protocol | Represent stable-block prose patches and story-state proposals |
| Snapshot implementation | Snapshot authoritative manuscript and story-state revisions together |
| Server protocol | Expose proposals, approvals, checkpoints, and narrative resources |

### Disable for writer runs

- Shell and PTY tools
- LSP tools
- Generic write, edit, and apply-patch tools
- Generic filesystem search after narrative tools are complete
- Unscoped web search and web fetch
- Coding-oriented explore and build agents

These features can remain available to the original code profile.

## 4. Target architecture

```text
CLI / Evaluation Runner / Private Web App
                  |
          OpenCode Server + SDK
                  |
        Durable Session Execution
                  |
            Domain Profile
       +----------+-----------+
       |                      |
 Writer Intent            Writer Tools
       |                      |
       +------ Context -------+
              Compiler
                  |
          Narrative Workspace
       +----------+-----------+
       |                      |
 Manuscript Revision      Story State
       |                      |
       +------ Proposal ------+
                  |
             Validation
                  |
          Approval / Commit
```

## 5. Package structure

Keep domain code additive.

```text
packages/writer/
  src/
    task.ts                 normalized writer intent
    proposal.ts             prose and story-state proposals
    project.ts              writer-project configuration
    manuscript.ts           book/chapter/scene/block schemas
    story-state.ts          entities, assertions, knowledge, events, arcs
    revision.ts             authoritative revision and checkpoint schemas
    profile.ts              writer agent/tool/prompt profile
    instructions.ts         AUTHOR.md discovery and loading
    import/
      markdown.ts
      docx.ts               spike only
    index/
      exact.ts
      embedding.ts
      metadata.ts
    context/
      compiler.ts
      budget.ts
      rerank.ts
    tools/
      search-manuscript.ts
      read-chapter.ts
      read-scene.ts
      query-story-state.ts
      get-character-knowledge.ts
      get-timeline-window.ts
      propose-prose-patch.ts
      propose-story-state.ts
    validation/
      patch-structure.ts
      scope.ts
      continuity.ts
      invariants.ts
      evidence.ts
    evals/
      fixtures/
      cases/
      graders/
      reports/
```

Only create modules as their milestone begins. This tree describes boundaries, not a request to scaffold empty files.

## 6. Domain profile extension

Introduce a generic domain-profile service inside `packages/opencode`, with the code profile reproducing current behavior and the writer profile contributed by `packages/writer`.

```ts
type DomainProfile = {
  id: string
  agents: () => AgentDefinition[]
  tools: () => ToolDefinition[]
  filterTools: (tools: ToolDefinition[]) => ToolDefinition[]
  systemContext: (input: DomainContextInput) => Promise<string[]>
  instructionFiles: string[]
}
```

Expected core touch points:

- `packages/opencode/src/agent/agent.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/session/system.ts`
- `packages/opencode/src/session/instruction.ts`
- `packages/opencode/src/config/config.ts`

The first core PR should add only the extension seam and a code-profile compatibility test. Writer behavior lands separately.

## 7. Writer agents

### `write`

The only visible primary agent for the MVP. It interprets requests, gathers context, answers questions, and creates proposals. It cannot commit.

### `plan`

Read-only primary agent for structural planning. It may create plan artifacts but not manuscript proposals.

### `story-summary`

Hidden agent used for hierarchical scene and chapter summaries. No tools beyond scoped reads.

### `compaction`

Hidden agent that preserves writer decisions, citations, unresolved questions, pending proposals, and task state. It must not convert inferred facts into accepted canon.

### Deferred specialist agents

- Continuity critic
- Voice critic
- Developmental editor
- Translator and translation reviewer

Add a specialist only when a benchmark shows a statistically or practically meaningful improvement over the primary loop.

## 8. Writer intent

Every user prompt first becomes a `WriterTask`. This is the run contract, not a form the writer must fill out.

Required fields:

- Operation: answer, diagnose, revise, brainstorm, or update story state
- Goal
- Explicit and inferred scope
- Elements to preserve
- Elements to change
- Creative decisions that remain open
- Evidence required
- Clarification question and reason, when needed

### Clarification rule

Ask only when plausible answers produce materially different outcomes. Do not ask about reversible implementation details or preferences that project instructions already settle.

Examples that warrant clarification:

- Which character should win a conflict when the prompt is ambiguous
- Whether an apparent contradiction is intentional unreliable narration
- Whether a requested voice change applies to one POV or the whole book

Examples that do not:

- Which retrieval query to run
- How many adjacent paragraphs to inspect
- Whether to use exact search before semantic search

## 9. Narrative workspace

### Portable project layout

```text
AUTHOR.md
manuscript/
  001-the-oath.md
  002-smoke.md
story/
  characters.yaml
  places.yaml
  timeline.yaml
  arcs.yaml
  open-threads.yaml
notes/
.writer/
  project.json
  index.sqlite
```

### Authority model

- Manuscript files and accepted story records form authoritative project state.
- `.writer/index.sqlite`, embeddings, extracted facts, and summaries are derived and rebuildable.
- Conversation messages are session history, not story state.
- Proposals are review artifacts, not accepted revisions.

### Stable blocks

Each prose block receives:

- Stable ID
- Parent scene and chapter IDs
- Position
- Content hash
- Revision introduced
- Revision retired, if any

Patch operations reference stable IDs and base hashes so stale proposals cannot overwrite newer writing.

## 10. Context compiler

The context compiler—not model context-window size—is the main product differentiator.

### Retrieval pipeline

1. Parse `WriterTask` and explicit selections.
2. Resolve IDs, chapter references, character names, and exact phrases.
3. Filter by entity, location, arc, and story time.
4. Run semantic retrieval for conceptually relevant passages.
5. Expand one relationship hop from directly implicated entities.
6. Rerank against goal, preserve constraints, and evidence needs.
7. Select diverse evidence across chapters and evidence types.
8. Assemble within a measured token budget.
9. Attach source IDs to every excerpt.

### Context tiers

1. Harness rules and writer task
2. `AUTHOR.md` and active skill
3. Explicit selection and current scene
4. Accepted story state relevant at the scene's story time
5. Retrieved manuscript evidence
6. Hierarchical summaries and approved voice examples

Accepted canon is supplied as structured records, never only as conversational summary prose.

## 11. Narrative tools

### Read tools

- `search_manuscript(query, filters, limit)`
- `read_chapter(chapter_id, range)`
- `read_scene(scene_id, include_adjacent)`
- `query_story_state(subjects, predicates, at_story_time)`
- `get_character_knowledge(character_id, at_story_time)`
- `get_timeline_window(start, end, participants)`

### Proposal tools

- `propose_prose_patch(base_revision_id, operations, rationale, evidence)`
- `propose_story_state(base_revision_id, changes, rationale, evidence)`
- `request_creative_decision(question, options, impact)`

### Validation tools

- `validate_patch_structure(proposal_id)`
- `validate_scope(proposal_id, writer_task_id)`
- `check_invariants(proposal_id, invariants)`
- `check_continuity(proposal_id, affected_entities)`
- `check_evidence_coverage(proposal_id, writer_task_id)`

### Hard boundary

No model-visible tool commits a proposal. Approval and commit are server operations invoked by a trusted client after an explicit human decision.

## 12. Prompt architecture

Assemble prompts in layers:

1. OpenCode provider-specific compatibility prompt
2. Writer-domain contract
3. Project instructions from `AUTHOR.md`
4. Optional editorial skill
5. `WriterTask`
6. Compiled evidence packet

Store prompt-template versions and hashes in traces. Avoid copying and editing every provider prompt; the domain layer should be provider-independent unless an evaluation proves otherwise.

The writer contract requires:

- Cite manuscript evidence for factual claims.
- Separate observation, inference, and creative suggestion.
- Preserve explicit constraints.
- State uncertainty when evidence conflicts or is incomplete.
- Create proposals rather than direct mutations.
- Never silently promote extracted information to canon.
- Avoid direct imitation of living authors.

## 13. Proposal and commit lifecycle

```text
drafted
  -> structurally_valid
  -> narrative_validation
  -> awaiting_approval
  -> accepted | rejected | revision_requested
  -> committed
  -> reverted
```

### Deterministic validation

- Base revision still current
- Block hashes match
- Operations target valid blocks
- No unrequested blocks changed
- Required evidence IDs resolve
- Story-state changes reference valid entities
- Patch can be applied and reversed

### Model-assisted validation

- Goal satisfaction
- Preserve-constraint compliance
- Emotional and causal plausibility
- Knowledge and timeline consistency
- Material voice deviation

Critic output is advisory evidence. It does not override deterministic failures or author decisions.

### Atomic commit

One approved operation commits:

- Manuscript changes
- Accepted story-state changes
- Revision record
- Checkpoint
- Proposal provenance
- Author approval record

If any part fails, none becomes authoritative.

## 14. Public server and SDK boundary

The harness exposes domain behavior without prescribing a UI.

Minimum API capabilities:

- Create/open writer project
- Import and index manuscript
- Start/resume/cancel writer session
- Stream messages, tool activity, citations, and decisions
- List/read narrative resources
- List/read proposals and validation reports
- Approve, reject, or request revision
- List/restore checkpoints
- Run evaluation cases

Prefer additions to the existing OpenCode protocol and generated SDK. Do not create a second unrelated HTTP server.

## 15. Evaluation plan

### Fixture manuscript

Build or license a 30,000–50,000-word novel containing:

- 10 factual contradictions
- 6 timeline errors
- 6 character-knowledge leaks
- 5 dropped promises
- 5 emotional-causality gaps
- 5 harmless apparent contradictions
- 10 scoped revision tasks with human reference outcomes
- 10 ambiguous prompts that should trigger clarification

### Baselines

1. Direct chat with the largest feasible manuscript context
2. Embedding retrieval without story state
3. Writer harness with structured context

### Measures

- Writer-intent classification accuracy
- Scope accuracy
- Necessary and unnecessary clarification rates
- Evidence recall at K
- Citation precision
- Continuity recall and false-positive rate
- Patch scope precision
- Constraint preservation
- Human preference against baselines
- Accepted-change revert rate
- Tokens, latency, and cost per accepted result

No architectural component is considered valuable until it improves a task-level metric or a clearly measured operational property.

## 16. Pull-request sequence

Keep PRs narrow enough to sync upstream safely.

### PR 1 — Domain contracts

- `packages/writer`
- `WriterTask`
- Prose and story-state proposal schemas
- Fork policy

**Status:** drafted in the initial `writer-profile` branch.

### PR 2 — Domain profile seam

- Generic profile interface
- Compatibility code profile
- Profile config selection
- Tests proving unchanged coding-tool and agent behavior

### PR 3 — Writer profile

- Writer primary agent
- Writer prompt layer
- Writer permissions
- `AUTHOR.md` loader
- No shell, LSP, web, or raw edit tools

### PR 4 — Manuscript model and importer

- Project hierarchy and stable blocks
- Markdown importer
- Fixture project
- Derived SQLite index

### PR 5 — Narrative read tools

- Exact search
- Chapter and scene reads
- Tool traces and citations
- Read-only story-question evaluation

### PR 6 — Story state and context compiler

- Entities, assertions, events, knowledge, arcs, and open threads
- Semantic retrieval and metadata filtering
- Evidence reranking and budget assembly

### PR 7 — Proposal tools

- Typed prose patches
- Story-state proposals
- Deterministic validation
- No authoritative mutation

### PR 8 — Approval and checkpoints

- Server-side approval operations
- Atomic commit
- Snapshot/revert integration
- Resume at approval boundary

### PR 9 — Evaluation harness

- Fixture cases
- Baselines
- Graders and reports
- CI regression thresholds

### PR 10 — Public protocol and SDK

- Narrative resources
- Proposal and approval endpoints
- Generated client support
- Minimal integration example for a separate web app

## 17. Eight-week MVP schedule

### Weeks 1–2: adaptation spike

- Complete PRs 1–3.
- Prove a writer session exposes only the intended tools.
- Resume a writer session after restart.
- Confirm the code profile still behaves as upstream.

**Go/no-go:** Continue only if the profile can be added without replacing session execution or the server protocol.

### Weeks 3–4: understanding and retrieval

- Complete PRs 4–6 at read-only scope.
- Import the fixture.
- Answer cited cross-chapter questions.
- Compare structured retrieval with baselines.

**Gate:** At least 90% citation precision and a material evidence-recall gain over embedding-only retrieval.

### Weeks 5–6: controlled revision

- Complete PRs 7–8.
- Add intent contracts, proposals, validation, approval, and revert.
- Support one knowledge-leak repair and one intent-sensitive emotional revision.

**Gate:** Zero silent out-of-scope mutations, at least 95% patch-application success, and reliable reversal.

### Weeks 7–8: evaluation and public API

- Complete PRs 9–10.
- Add cost and step budgets, recovery, and trace redaction.
- Run five writers through the core scenarios.

**Gate:** The harness beats direct chat on constraint preservation and four of five writers complete the scenarios without operator intervention.

## 18. Definition of MVP complete

The public harness is MVP-complete when a client can:

1. Import the fixture project.
2. Start a writer session through the SDK.
3. Ask a cross-manuscript question and receive precise citations.
4. Request a bounded scene revision with explicit preserve constraints.
5. Inspect the evidence, prose patch, story-state proposal, and validation report.
6. Approve the proposal through a trusted API operation.
7. Observe an atomic checkpoint.
8. Resume the session and revert the checkpoint.
9. Re-run the evaluation suite and remain above agreed regression thresholds.

No product-specific UI is required to satisfy this definition.

## 19. Immediate next ticket

Implement the domain-profile seam without adding writer behavior yet.

Acceptance criteria:

- A profile can contribute agents, tools, system context, and instruction filenames.
- The default code profile reproduces the current tool list and agent definitions.
- `packages/opencode` tests and typecheck remain green.
- `packages/writer` can define a writer profile without importing private product code.
- The change does not alter public protocol schemas.

This is the smallest architectural step that unlocks the writing harness while minimizing long-term fork maintenance.
