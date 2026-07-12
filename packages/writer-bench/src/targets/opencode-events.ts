export function parseOpenCodeEvents(output: string) {
  const events = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as unknown)
  const texts: string[] = []
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  for (const value of events) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const event = value as Record<string, unknown>
    if (event.type === "error") throw new Error(`opencode event error: ${JSON.stringify(event.error)}`)
    if (!event.part || typeof event.part !== "object" || Array.isArray(event.part)) continue
    const part = event.part as Record<string, unknown>
    if (event.type === "text" && typeof part.text === "string") texts.push(part.text.trim())
    if (event.type !== "step_finish") continue
    if (typeof part.cost === "number") costUsd += part.cost
    if (!part.tokens || typeof part.tokens !== "object" || Array.isArray(part.tokens)) continue
    const tokens = part.tokens as Record<string, unknown>
    if (typeof tokens.input === "number") inputTokens += tokens.input
    if (typeof tokens.output === "number") outputTokens += tokens.output
  }
  const text = texts.filter(Boolean).join("\n\n")
  if (!text) throw new Error("opencode returned no completed text events")
  return { text, usage: { inputTokens, outputTokens, costUsd } }
}
