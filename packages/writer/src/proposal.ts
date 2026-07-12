import { Schema } from "effect"

const Evidence = Schema.Struct({
  block_id: Schema.String,
  reason: Schema.String,
})

export namespace ProsePatchProposal {
  export const Operation = Schema.Struct({
    block_id: Schema.String,
    base_hash: Schema.String,
    action: Schema.Literals(["replace", "insert_before", "insert_after", "delete"]),
    proposed_text: Schema.NullOr(Schema.String),
    rationale: Schema.String,
  })
  export type Operation = typeof Operation.Type

  export const Info = Schema.Struct({
    base_revision_id: Schema.String,
    goal: Schema.String,
    operations: Schema.Array(Operation),
    evidence: Schema.Array(Evidence),
  })
  export type Info = typeof Info.Type
}

export namespace StoryStateProposal {
  export const Change = Schema.Struct({
    action: Schema.Literals(["assert", "retire", "contradict"]),
    subject_id: Schema.String,
    predicate: Schema.String,
    value: Schema.String,
    effective_story_time: Schema.NullOr(Schema.String),
    rationale: Schema.String,
  })
  export type Change = typeof Change.Type

  export const Info = Schema.Struct({
    base_revision_id: Schema.String,
    changes: Schema.Array(Change),
    evidence: Schema.Array(Evidence),
  })
  export type Info = typeof Info.Type
}
