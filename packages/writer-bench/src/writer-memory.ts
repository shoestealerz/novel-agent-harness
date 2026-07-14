export type MemoryMode = "coding" | "writer"

const codingTemplate = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>`

const writerTemplate = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Author Objective
- [current author intent, requested job, and success condition]

## Canon Facts
- [established story facts with passage references; distinguish fact from inference]

## Character Knowledge
- [what each relevant character knows, believes, suspects, or cannot know]

## Unresolved and Protected Ambiguity
- [open questions, competing explanations, and facts that must not be promoted to canon]

## Chronology and Causality
- [ordered events, causes, consequences, and temporal boundaries]

## Object and Location State
- [possession, condition, location, and last established state of important objects]

## Relationships and Arcs
- [relationship state, changes, withheld trust/forgiveness/consent, and arc direction]

## Motifs, Promises, and Payoffs
- [recurring images, setup, promises, exceptions, and pending payoffs]

## Voice and Style Constraints
- [POV, tense, register, rhythm, imagery, and author-specific prohibitions]

## Author Decisions
### Accepted
- [decisions the author approved and why]

### Rejected
- [options explicitly rejected and why; do not revive them]

## Active Proposal
- [uncommitted proposal ID, targets, preservation constraints, validation state, or "(none)"]

## Next Move
1. [immediate concrete action]
2. [next action if known]
</template>`

export function renderMemoryPrompt(mode: MemoryMode, history: string) {
  const role = mode === "writer"
    ? "You are an anchored memory reconstruction assistant for long-form fiction-writing sessions."
    : "You are an anchored context summarization assistant for coding sessions."
  return `${role}

Summarize only the session history below. Preserve exact passage references, proposal IDs, exact literals, and explicit author decisions. Do not answer the pending request.

${mode === "writer" ? writerTemplate : codingTemplate}

<session-history>
${history}
</session-history>`
}
