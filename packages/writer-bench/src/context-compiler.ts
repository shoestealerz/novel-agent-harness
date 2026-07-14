import { readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
export { compileContext } from "@novel-agent-harness/writer"
export type { ContextStrategy, ContextTrace } from "@novel-agent-harness/writer"

export async function loadManuscriptContext(directory: string) {
  const files = (await readdir(resolve(directory), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
  const passages = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(resolve(directory, file), "utf8")
      return [
        ...content.matchAll(/<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs),
      ].map((match) => ({
        ref: match[1]!,
        text: match.groups!.text.trim(),
        kind: "manuscript" as const,
      }))
    }),
  )
  const output = passages.flat()
  if (!output.length) throw new Error(`manuscript context directory has no referenced passages: ${directory}`)
  return output
}
