# Writer domain

Domain contracts and reusable harness behavior for long-form fiction projects.

This package remains independent of product UI. It should contain only schemas, behavior, and interfaces that a CLI, web client, desktop client, evaluation runner, or third-party integration can share.

## Authority model

- Manuscript text and accepted story state are authoritative.
- Conversation history, retrieved context, summaries, and extracted facts are not authoritative.
- Model tools produce proposals.
- Application code commits proposals only after explicit approval.

## Planned modules

- Project, manuscript, chapter, scene, and stable-block schemas
- Story entities, assertions, character knowledge, events, arcs, and open threads
- Writer task interpretation
- Narrative retrieval and context compilation
- Prose and story-state proposal validation
- Evaluation fixtures and graders
