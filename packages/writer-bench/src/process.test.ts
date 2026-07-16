import assert from "node:assert/strict"
import test from "node:test"
import { protocolVersion, type ExecutionRequest, type Target } from "./contracts.ts"
import { executeTarget } from "./process.ts"

test("reports an immediately exited target without an unhandled stdin EPIPE", async () => {
  const target: Target = {
    id: "immediate-exit",
    baseModel: "fixture",
    comparisonKey: "fixture",
    command: [process.execPath, "-e", "process.stderr.write('early exit');process.exit(7)"],
  }
  const request: ExecutionRequest = {
    protocolVersion,
    kind: "execute",
    runId: "run",
    trial: 0,
    task: {
      id: "task",
      suite: "suite",
      suiteVersion: "1",
      source: "fixture",
      job: "explain",
      prompt: "x".repeat(2_000_000),
    },
  }
  await assert.rejects(executeTarget(target, request), /target immediate-exit exited 7: early exit/)
})
