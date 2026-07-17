# Novel Agent Harness

An open-source model harness for writing, editing, and translating long-form fiction.

Novel Agent Harness adapts the reliable parts of coding agents—scoped tasks, controlled context, immutable patches, validation, review, and reversible commits—to novels. The author remains the final authority: analysis and proposed edits are distinct from applying changes.

The public harness core and first interactive CLI are available as an alpha. The private web application is intentionally deferred until the harness protocol is stable.

## Current capabilities

- Git-friendly novel workspaces with durable passage references
- task-aware context packets with explicit focus, dependency, preservation, exclusion, and temporal boundaries
- immutable, content-addressed edit proposals with source preconditions and preservation receipts
- persisted proposal artifacts and stale-safe review diffs
- typed, evidence-linked story state with immutable state-change proposals and temporal read filtering
- Writer Harness Bench for deterministic reliability gates, paired comparisons, confidence intervals, cost/latency reporting, and optional qualitative judging
- synthetic fiction corpora for development and sealed held-out evaluation

## Evidence-backed design

The experiment phase tested each proposed mechanism before promoting it into the runtime.

| Mechanism                        | Decision                               |
| -------------------------------- | -------------------------------------- |
| Writer Task Contract v0.1        | Graduated                              |
| Task-aware controlled context    | Graduated                              |
| Immutable edit proposals         | Graduated                              |
| Hierarchical semantic retrieval  | Experimental; failed sealed graduation |
| Verbose writer-memory summaries  | Rejected                               |
| Broad automatic semantic critics | Rejected                               |

The integrated reliability evaluation completed 108/108 cells. The graduated harness scored 0.9960 with zero deterministic safety failures on its development suite. This is evidence for the proposal and authority architecture, not a claim of universal literary-quality improvement. See [Phase 7 results](packages/writer-bench/experiments/PHASE7_RESULTS.md) for the full interpretation.

## Repository map

- [`packages/writer`](packages/writer): production writer workspace, context, proposal, persistence, and review primitives
- [`packages/writer-bench`](packages/writer-bench): benchmark runner, corpora, experiments, and regression gates
- [`WRITER_HARNESS_RESEARCH.md`](WRITER_HARNESS_RESEARCH.md): product requirements and agent-harness research
- [`ROADMAP.md`](ROADMAP.md): current phase, experiment record, and implementation sequence
- [`packages/opencode`](packages/opencode): the retained generic agent runtime inherited from OpenCode

## Alpha quick start

The alpha is source-distributed and requires Git and Bun 1.3.14 or newer. Clone only from this repository, install the locked dependencies, and register the `novel` command once:

```bash
git clone --branch v0.1.0-alpha.2 --depth 1 https://github.com/shoestealerz/novel-agent-harness.git
cd novel-agent-harness
bun install --frozen-lockfile --ignore-scripts
bun run install:cli
novel --help
```

`bun run install:cli` uses Bun's global link mechanism, so the command continues to use this checked-out, locked source tree. Run it again if the checkout is moved. The proposal-only Writer path does not require inherited desktop/native lifecycle scripts. Full monorepo development and the inherited OpenCode surfaces use `bun install --frozen-lockfile`; on Windows that also requires Visual Studio Build Tools with the C++ workload. Node.js 22 or newer is needed for benchmark and full monorepo development commands, but not for the `novel` launcher itself.

Provider credentials are read by the retained OpenCode model layer. ChatGPT Plus and Pro subscribers can use the supported browser or device-code login without creating an OpenAI API key. Keep all credentials in the provider configuration or current process environment; never add them to a novel repository. Manuscript passages and Writer session context are sent to the provider selected by the author.

For package development:

```bash
bun run --cwd packages/writer typecheck
bun run --cwd packages/writer test

bun run --cwd packages/writer-bench typecheck
bun run --cwd packages/writer-bench test
```

Benchmark model credentials and local target files are intentionally excluded from Git. See [`packages/writer-bench/README.md`](packages/writer-bench/README.md) for runner usage.

### Interactive Writer workflow

Start with a separate, clean Git repository containing committed chapter files. `novel init` conservatively discovers tracked Markdown or text chapters under `manuscript/`, `chapter/`, `chapters/`, or `draft/`; explicit `--chapter stable-id=path` mappings remain available for other layouts.

```bash
cd my-novel
novel init

# Review the inserted stable passage markers, then establish the clean base.
git add novel.json manuscript
git commit -m "Initialize Novel Agent workspace"

# One-time ChatGPT Plus/Pro setup. This opens OpenAI's sign-in page.
novel login chatgpt
novel models openai

# Open the Writer agent in the current novel.
novel --model openai/MODEL_ID
```

`novel login chatgpt` selects ChatGPT subscription authentication directly; it does not ask for an API key. On a remote machine where the browser cannot return to the CLI, use `novel login chatgpt --device-code`, open the displayed OpenAI URL on any device, and enter the one-time code. After login, `novel models openai` prints the models available to that account; use one of those exact IDs with `--model` or `/model`.

The same setup is available without leaving an active Writer conversation. Enter `/login chatgpt`; the harness displays the OpenAI authorization URL, waits for completion, reloads the provider catalog, lists the subscription's available models, and asks which model to attach to the current durable session. Use `/login chatgpt --device-code` in a remote terminal. No manuscript request is sent while login is in progress.

This path uses the user's ChatGPT plan allowance and its current Codex usage limits. It is distinct from OpenAI Platform API-key billing. The retained credential service stores the OAuth credential outside the novel repository and refreshes it automatically. Signing out is explicit:

```bash
novel providers logout openai
```

OpenAI documents ChatGPT subscription authentication for Codex clients and browser/device-code login for embedded app-server clients in its [authentication guide](https://developers.openai.com/codex/auth) and [Codex app-server reference](https://developers.openai.com/codex/app-server). Novel Agent Harness never asks the author to copy ChatGPT browser cookies or tokens. As with every remote provider, the selected manuscript context is transmitted to OpenAI under the policies of the account and workspace used to sign in.

API-key providers remain available when desired. For example:

```bash
novel login deepseek
novel models deepseek
novel --model deepseek/deepseek-v4-pro
```

Inside the session, write normal requests or use:

```text
/status              workspace, model, job, Git, and pending proposal
/login chatgpt       connect a ChatGPT subscription in this conversation
/login chatgpt --device-code
                     connect from a headless or remote terminal
/models [PROVIDER]   list available model IDs; defaults to openai
/job auto|JOB        automatic routing or explain, diagnose, plan, revise
/model PROVIDER/ID   change the model for later prompts
/review [ID]         render the latest or named immutable proposal diff
/approve [ID]        render again, require typed APPLY, then verified Git commit
/reject [ID]         dismiss without deleting the immutable audit artifact
/new                 start a new conversation in the same novel
/session             print the durable session ID
/exit                save and leave
```

Resume with `novel --continue` or the exact command printed at exit, `novel --session ses_...`. A normal writing request can never bypass proposal review: scoped Revise produces an immutable artifact, and `/approve` is the only interactive path to the existing author-confirmed commit transaction.

Provider credentials are stored by the retained OpenCode credential service outside the novel repository. ChatGPT OAuth and environment variables such as `DEEPSEEK_API_KEY` remain supported. Manuscript passages and Writer session context are sent to the provider selected by the author.

### Headless and automation workflow

For a Git-backed novel workspace containing `novel.json` and stable passage markers:

```bash
# Bootstrap clean, already tracked chapter files. Unmarked files receive one
# conservative whole-chapter passage marker and are never silently overwritten.
bun run writer -- init --dir ./my-novel --title "My Novel" \
  --chapter ch01=manuscript/chapter-01.md --yes

# Optional typed story-state store
bun run writer -- state --init --dir ./my-novel

# The model selects controlled context, or pass --focus/--through explicitly
bun run writer -- run --dir ./my-novel --model deepseek/deepseek-v4-pro \
  --job revise "Tighten the confrontation without changing who knows the secret"

# Continue the same durable Writer conversation after the command exits
bun run writer -- run --dir ./my-novel --session ses_... --job explain \
  "Now test that interpretation against chapter two"

# Review the returned content-addressed proposal ID
bun run writer -- review sha256:... --dir ./my-novel

# Only an explicit author confirmation can create the Git commit and receipt
bun run writer -- commit sha256:... --dir ./my-novel --confirmed-by "Author Name" --yes

# Story-state proposals use the same explicit author boundary and a separate receipt.
bun run writer -- commit sha256:... --kind state --dir ./my-novel \
  --confirmed-by "Author Name" --yes
```

`writer run` emits a versioned JSON result with its durable session ID and per-turn token/cost usage by default. Explain, Diagnose, and Plan remain read-only; Revise can only save an immutable proposal. `--session` resumes only a prior headless Writer session from the same canonical novel workspace. `writer commit` executes outside the model tool loop and rechecks the exact proposal, source or state hashes, evidence references, clean Git scope, staged blobs, and unchanged `HEAD` before creating a commit. Failed transactions restore the exact prior files and index.

## Relationship to OpenCode

The initial source tree was imported from [anomalyco/opencode](https://github.com/anomalyco/opencode) at commit [`34e5809`](https://github.com/anomalyco/opencode/commit/34e58090595d44e3e7cc37498f16753a98627456). OpenCode provides the generic session, model, tool, permission, event, persistence, and snapshot machinery. Novel Agent Harness owns the writer-specific contracts, context, story-state, proposal, evaluation, and author-authority layers.

The repository history begins with that source snapshot as a single baseline commit so subsequent history represents Novel Agent Harness work. The imported OpenCode source remains available under the MIT license in this repository.

## Status

Phase 7 experiments and the public harness MVP are complete. Version `0.1.0-alpha.2` supports Explain, Diagnose, Plan, and scoped Revise through a globally linked interactive `novel` command and the structured headless workflow. Broader generation, translation, a standalone binary or package-registry distribution, the private web application, and broad literary-quality claims remain outside this alpha. See [RELEASE.md](RELEASE.md) for the release gate and limitations.
