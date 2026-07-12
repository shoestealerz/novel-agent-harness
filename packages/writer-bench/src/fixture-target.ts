import { protocolVersion, requireObject } from "./contracts.ts"

const mode = process.argv[2]
const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
const request = requireObject(JSON.parse(Buffer.concat(chunks).toString("utf8")), "request")
const task = requireObject(request.task, "request.task")
const metadata = requireObject(task.metadata, "task.metadata")
const responses = requireObject(metadata.fixtureResponses, "task.metadata.fixtureResponses")

if (request.kind === "judge") {
  const response = requireObject(request.response, "request.response")
  const responseMetadata = requireObject(response.metadata, "response.metadata")
  console.log(JSON.stringify({ protocolVersion, taskId: task.id, scores: responseMetadata.judgeScores ?? {} }))
  process.exit(0)
}

const fixture = requireObject(responses[mode ?? ""], `fixture response ${mode}`)
const fixtureMetadata = { ...(fixture.metadata as Record<string, unknown> | undefined), judgeScores: fixture.judgeScores }
console.log(JSON.stringify({
  protocolVersion,
  taskId: task.id,
  text: fixture.text ?? "",
  artifacts: fixture.artifacts,
  metadata: fixtureMetadata,
  usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
}))
