import { readFile } from "node:fs/promises"
import { join } from "node:path"

const args = process.argv.slice(2)
const root = flag("--dir")
const job = flag("--job")
const refs = flags("--focus")
const manifest = JSON.parse(await readFile(join(root, "novel.json"), "utf8")) as {
  chapters: { path: string }[]
}
const manuscript = (
  await Promise.all(manifest.chapters.map((chapter) => readFile(join(root, chapter.path), "utf8")))
).join("\n")
if (!refs.every((ref) => manuscript.includes(`novel-agent:passage ${ref}`))) {
  throw new Error("fixture did not receive the benchmark passages")
}
console.log(
  JSON.stringify({
    protocolVersion: 1,
    sessionID: "ses_production_fixture",
    job,
    authority: job === "revise" ? "propose" : "read",
    contextTrace: { selectedRefs: refs },
    result: {
      answer: `Grounded in ${refs.join(", ")}.`,
      evidence: refs,
      findings: [],
      edits: [],
      data: { observations: [], inferences: [], unresolved: [], preservation: [] },
    },
    usage: { inputTokens: 12, outputTokens: 5, costUsd: 0.001 },
  }),
)

function flag(name: string) {
  const index = args.indexOf(name)
  const value = args[index + 1]
  if (index < 0 || !value) throw new Error(`fixture requires ${name}`)
  return value
}

function flags(name: string) {
  return args.flatMap((value, index) => (value === name && args[index + 1] ? [args[index + 1]!] : []))
}
