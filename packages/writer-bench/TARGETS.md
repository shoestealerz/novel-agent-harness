# Real benchmark targets

Writer Harness Bench ships two initial system adapters. They use the same command protocol as fixture and future writer-harness targets.

## Evaluation-data isolation

System targets receive only:

- public task identity and source;
- job and authority;
- author prompt;
- supplied context and passage references;
- public tags.

They do not receive deterministic checks, subjective rubrics, gold answers, or private metadata. A separately configured judge receives the public task plus subjective criteria, but not deterministic checks or gold metadata.

This boundary prevents benchmark answers from leaking into the system under test.

## Raw OpenAI-compatible model

Command:

```json
["{node}", "--experimental-strip-types", "src/targets/openai-compatible.ts"]
```

Environment:

| Variable | Required | Description |
| --- | --- | --- |
| `WRITER_BENCH_MODEL` | yes | Exact model identifier sent to the endpoint |
| `WRITER_BENCH_BASE_URL` | no | API root; defaults to `https://api.openai.com/v1` |
| `WRITER_BENCH_API_KEY` | endpoint-dependent | Bearer token; omitted for unauthenticated local servers |
| `WRITER_BENCH_TEMPERATURE` | no | Defaults to `0.2` |
| `WRITER_BENCH_MAX_TOKENS` | no | Defaults to `4096` |
| `WRITER_BENCH_SEED` | no | Sent when configured and supported |
| `WRITER_BENCH_JUDGE_MODEL` | no | Independent judge model; defaults to `WRITER_BENCH_MODEL` |

The adapter intentionally behaves like direct chat: it renders the request and context, returns plain model text, and extracts only explicit passage citations. It does not synthesize structured findings or edits on the model's behalf.

## Stock OpenCode

Command:

```json
["{node}", "--experimental-strip-types", "src/targets/opencode-cli.ts"]
```

Environment:

| Variable | Required | Description |
| --- | --- | --- |
| `WRITER_BENCH_OPENCODE_BIN` | no | OpenCode executable; defaults to `opencode` |
| `WRITER_BENCH_OPENCODE_MODEL` | recommended | Exact `provider/model` used by `opencode run --model` |
| `WRITER_BENCH_OPENCODE_AGENT` | no | Stock primary agent to evaluate |
| `WRITER_BENCH_OPENCODE_DIR` | no | Workspace directory for the run |
| `WRITER_BENCH_OPENCODE_ATTACH` | no | Existing server URL to avoid repeated cold starts |

The adapter invokes OpenCode's documented non-interactive `run` command with JSON event output, captures completed text, token counts, and cost, and leaves OpenCode's default non-interactive permission behavior intact. It does not pass automatic-approval flags. See the [OpenCode CLI documentation](https://opencode.ai/docs/cli/) for model, agent, attach, and server configuration.

## Configuration

Copy `fixtures/targets.real.example.json`, replace every placeholder, and ensure raw and stock-OpenCode targets have the same `comparisonKey`. The key should encode at least:

```text
model revision + temperature + max output + task-renderer revision
```

Then run a small, inexpensive subset first:

```sh
bun src/cli.ts run \
  --suite corpora/harbor-light/tasks/pilot.jsonl \
  --targets targets.local.json \
  --out .results/harbor-pilot \
  --trials 3
```

If a judge is configured, use a different model family where practical and retain judge rationale in the run record. Human review remains required before making creative-quality claims.

## First baseline matrix

The initial real run should compare:

1. raw model with task-provided context;
2. stock OpenCode using the same base model;
3. later, raw model with a deliberately larger manuscript context;
4. only then, a writer-specific context/tool experiment.

Do not label model upgrades as harness improvements. The comparison command rejects mismatched `comparisonKey` values by default.
