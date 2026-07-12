import { Schema } from "effect"

export namespace WriterTask {
  export const Operation = Schema.Literals(["answer", "diagnose", "revise", "brainstorm", "update_story_state"])
  export type Operation = typeof Operation.Type

  export const StoryRef = Schema.Struct({
    type: Schema.Literals(["project", "book", "part", "chapter", "scene", "block", "entity", "arc"]),
    id: Schema.String,
  })
  export type StoryRef = typeof StoryRef.Type

  export const Clarification = Schema.Struct({
    question: Schema.String,
    reason: Schema.String,
  })
  export type Clarification = typeof Clarification.Type

  export const Info = Schema.Struct({
    operation: Operation,
    goal: Schema.String,
    scope: Schema.Array(StoryRef),
    preserve: Schema.Array(Schema.String),
    change: Schema.Array(Schema.String),
    creative_decisions: Schema.Array(Schema.String),
    evidence_needed: Schema.Array(Schema.String),
    clarification: Schema.NullOr(Clarification),
  })
  export type Info = typeof Info.Type
}
