import type { Criterion, Task } from "./contracts.ts"
import { readJsonl, writeJsonl } from "./io.ts"

type WritingBenchRow = {
  index: number
  domain1: string
  domain2: string
  lang: string
  query: string
  checklist?: Array<{ name: string; criteria_description: string }>
}

type ConStoryRow = {
  id: string | number
  language?: string
  task_type?: string
  prompt: string
}

export async function importWritingBench(input: {
  source: string
  out: string
  domain?: string
  language?: string
  limit?: number
}) {
  const rows = (await readJsonl(input.source)) as WritingBenchRow[]
  const tasks = rows
    .filter((row) => !input.domain || row.domain1 === input.domain)
    .filter((row) => !input.language || row.lang === input.language)
    .slice(0, input.limit)
    .map((row) => ({
      id: `writingbench-${row.index}`,
      suite: "writingbench",
      suiteVersion: "2025-04-29",
      source: "https://github.com/X-PLUG/WritingBench",
      job: inferWritingJob(row.domain2),
      language: row.lang,
      prompt: row.query,
      authority: "read",
      criteria: row.checklist?.map((criterion, index) => ({
        id: `criterion-${index + 1}`,
        description: `${criterion.name}: ${criterion.criteria_description}`,
      })) satisfies Criterion[] | undefined,
      tags: [row.domain1, row.domain2, "external"],
      metadata: { upstreamIndex: row.index, upstreamDomain: row.domain1, upstreamSubdomain: row.domain2 },
    } satisfies Task))
  await writeJsonl(input.out, tasks)
  return tasks.length
}

export async function importConStory(input: { source: string; out: string; language?: string; limit?: number }) {
  const rows = (await readJsonl(input.source)) as ConStoryRow[]
  const tasks = rows
    .filter((row) => !input.language || row.language === input.language)
    .slice(0, input.limit)
    .map((row) => ({
      id: `constory-${row.id}`,
      suite: "constory-bench",
      suiteVersion: "2026-04-07",
      source: "https://github.com/Picrew/ConStory-Bench",
      job: "generate",
      language: row.language,
      prompt: row.prompt,
      authority: "read",
      criteria: consistencyCriteria,
      tags: [row.task_type ?? "generation", "long-form", "external"],
      metadata: { upstreamId: row.id, upstreamTaskType: row.task_type, nativeEvaluator: "ConStory-Checker" },
    } satisfies Task))
  await writeJsonl(input.out, tasks)
  return tasks.length
}

const consistencyCriteria: Criterion[] = [
  { id: "characterization", description: "Character memory, knowledge, skills, powers, and established characterization remain consistent." },
  { id: "factual-detail", description: "Appearances, names, quantities, and other established factual details remain consistent." },
  { id: "narrative-style", description: "Perspective, tone, and narrative style do not drift unintentionally." },
  { id: "timeline-plot", description: "Time, duration, simultaneity, causality, and established plot elements remain consistent." },
  { id: "world-building", description: "Core rules, social norms, and geography remain consistent." },
]

function inferWritingJob(domain: string): Task["job"] {
  if (/edit|polish|rewrite|revision/i.test(domain)) return "revise"
  if (/outline|plan/i.test(domain)) return "plan"
  if (/translat/i.test(domain)) return "translate"
  return "generate"
}
