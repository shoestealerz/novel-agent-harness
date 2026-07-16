import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Check, ContextSpec, Job, Task } from "../src/contracts.ts"
import { writeJsonl } from "../src/io.ts"

const root = resolve("corpora/saltglass-vigil")
const suite = "writer-harness-book-scale-alpha3"
const suiteVersion = "0.3.3"
const source = "native:saltglass-vigil"

type Coverage = "long-range" | "temporal" | "distractor" | "ambiguous" | "human-review" | "controlled-context"
type Case = {
  slug: string
  prompt: string
  focusRefs: string[]
  evidenceRefs: string[]
  throughRef: string
  coverage?: Coverage[]
  distractorRefs?: string[]
  intentionId?: string
}

type VariantCase = Case & {
  variantId: string
  finding: { all: string[] }
}

type ReviseCase = Case & {
  preservationRef: string
  direction: string
}

const explainCases: Case[] = [
  c(
    "lens-trace",
    "Explain why the lens appears to implicate different bearing sides and what the correction does not yet prove.",
    ["ch07:p006"],
    ["ch01:p002", "ch05:p003", "ch05:p008", "ch07:p006"],
    "ch07:p006",
    ["long-range", "temporal", "controlled-context"],
  ),
  c(
    "bell-count",
    "Explain how Tovan can honestly hear eight strikes when the sent count is seven, and why this is not a continuity error.",
    ["ch03:p010"],
    ["ch02:p006", "ch03:p010"],
    "ch03:p010",
    ["ambiguous", "controlled-context"],
    [],
    "intent:bell-count",
  ),
  c(
    "blank-folio",
    "Distinguish the harmless missing blank folio from the genuinely suppressed pressure evidence.",
    ["ch11:p012"],
    ["ch03:p008", "ch03:p017", "ch11:p012"],
    "ch11:p012",
    ["long-range", "distractor"],
    ["ch08:p016"],
  ),
  c(
    "token-calendar",
    "Trace how the future-looking ferry token becomes evidence about Hal's departure without overclaiming his motive.",
    ["ch11:p006"],
    ["ch04:p001", "ch04:p006", "ch08:p004", "ch08:p008", "ch11:p006"],
    "ch11:p006",
    ["long-range", "temporal", "distractor"],
    ["ch03:p017"],
  ),
  c(
    "pel-delay",
    "Explain why Pel's delayed messages are operationally important but not evidence of sabotage.",
    ["ch06:p007"],
    ["ch05:p014", "ch06:p003", "ch06:p005", "ch06:p007"],
    "ch06:p007",
    ["temporal"],
  ),
  c(
    "cart-cause",
    "Explain the causal chain from permitted iron-shod carts to progressive bearing damage and why it does not identify one villain.",
    ["ch11:p002"],
    ["ch05:p004", "ch06:p002", "ch11:p001", "ch11:p002", "ch11:p004"],
    "ch11:p004",
    ["long-range", "distractor", "controlled-context"],
    ["ch04:p013"],
  ),
  c(
    "orra-culpability",
    "Explain Orra's culpability without making her the sole cause of the lock failure.",
    ["ch11:p012"],
    ["ch07:p012", "ch11:p002", "ch11:p004", "ch11:p009", "ch11:p012"],
    "ch11:p012",
    ["distractor"],
    ["ch04:p013"],
  ),
  c(
    "neris-arc",
    "Trace Neris's movement from immaculate certainty toward accountable uncertainty, citing the setup and payoff.",
    ["ch13:p001"],
    ["ch01:p010", "ch05:p018", "ch07:p012", "ch11:p013", "ch13:p001"],
    "ch13:p001",
    ["long-range", "distractor"],
    ["ch08:p007"],
  ),
  c(
    "tovan-arc",
    "Trace how Tovan's protective secrecy changes into consent-based disclosure without becoming obedience to the council.",
    ["ch14:p016"],
    ["ch02:p010", "ch06:p014", "ch08:p012", "ch10:p009", "ch12:p010", "ch14:p016"],
    "ch14:p016",
    ["long-range", "distractor"],
    ["ch05:p003"],
  ),
  c(
    "bounded-trust",
    "Explain how Neris and Tovan arrive at bounded operational trust and which powers remain separately owned.",
    ["ch12:p010"],
    ["ch04:p014", "ch07:p012", "ch08:p012", "ch10:p009", "ch12:p008", "ch12:p010"],
    "ch12:p010",
    ["long-range", "controlled-context"],
  ),
  c(
    "gate-order",
    "Explain why the evacuation gate order is causal rather than ceremonial and how the final operation tests it.",
    ["ch14:p006"],
    ["ch03:p011", "ch07:p012", "ch09:p006", "ch13:p013", "ch14:p006"],
    "ch14:p006",
    ["long-range", "temporal", "distractor"],
    ["ch11:p008"],
  ),
  c(
    "cael-knowledge",
    "At the end of chapter 9, separate what Cael knows about the warning plan from what they do not know about Janek's hand.",
    ["ch09:p018"],
    ["ch06:p010", "ch09:p013", "ch09:p018"],
    "ch09:p018",
    ["temporal", "distractor"],
    ["ch08:p017"],
  ),
  c(
    "key-authority",
    "Explain exactly what Tovan's master key can do, what it cannot do, and how later custody limits private leverage.",
    ["ch14:p016"],
    ["ch06:p015", "ch08:p012", "ch12:p008", "ch12:p010", "ch14:p016"],
    "ch14:p016",
    ["long-range"],
  ),
  c(
    "disclosure-boundary",
    "Explain what the final public disclosure includes, what it deliberately keeps private, and why that boundary is consistent with the story's ethics.",
    ["ch14:p015"],
    ["ch11:p012", "ch13:p001", "ch13:p002", "ch14:p015"],
    "ch14:p015",
    ["temporal", "ambiguous"],
    [],
    "intent:public-privacy-boundary",
  ),
]

const variantCases: VariantCase[] = [
  v(
    "token-material",
    "def-factual-01",
    "Check the ferry-token description in ch08:p004 against earlier handling evidence. Identify any factual contradiction.",
    ["ch08:p004"],
    ["ch02:p018", "ch04:p001", "ch08:p004"],
    "ch08:p004",
    ["token", "blue|ceramic", "brass"],
    ["long-range", "controlled-context"],
  ),
  v(
    "copy-indentation",
    "def-factual-02",
    "Check the claim about Cael's flat ledger copy in ch11:p004 against the established evidence limit.",
    ["ch11:p004"],
    ["ch07:p010", "ch08:p016", "ch08:p017", "ch11:p004"],
    "ch11:p004",
    ["copy", "indent|pressure", "cannot|contradict"],
    ["distractor"],
    ["ch03:p008"],
  ),
  v(
    "king-tide-day",
    "def-temporal-01",
    "Check whether the king-tide timing in ch09:p009 is consistent with the story-day countdown.",
    ["ch09:p009"],
    ["ch01:p001", "ch09:p009"],
    "ch09:p009",
    ["king tide", "day six|day 6", "day eight|day 8"],
    ["long-range", "temporal"],
  ),
  v(
    "minute-before-reveal",
    "def-temporal-02",
    "Check whether ch12:p001 uses the recovered clock interval before that information becomes available.",
    ["ch12:p001"],
    ["ch05:p014", "ch11:p008", "ch12:p001", "ch12:p002"],
    "ch12:p002",
    ["minute|second|interval", "before", "maintenance"],
    ["long-range", "temporal", "controlled-context"],
  ),
  v(
    "descent-return",
    "def-spatial-01",
    "Check Neris's route in ch05:p014 against the service-descent rule after the float rises.",
    ["ch05:p014"],
    ["ch05:p001", "ch05:p009", "ch05:p014"],
    "ch05:p014",
    ["service descent", "one-way|return", "float|flood"],
    ["temporal"],
  ),
  v(
    "tower-gallery-minute",
    "def-spatial-02",
    "Check the one-minute movement in ch14:p008 against the established Bellhouse-to-lock route.",
    ["ch14:p008"],
    ["ch05:p014", "ch10:p018", "ch14:p008"],
    "ch14:p008",
    ["west arcade|Bellhouse", "gallery", "one minute|route"],
    ["long-range", "distractor"],
    ["ch08:p001"],
  ),
  v(
    "hand-tool-cause",
    "def-causal-01",
    "Check the damage mechanism stated in ch11:p002 against the charged-saltglass rules and controlled test.",
    ["ch11:p002"],
    ["ch05:p004", "ch11:p001", "ch11:p002"],
    "ch11:p002",
    ["hand tool", "vibration|cart", "craze"],
    ["long-range", "controlled-context"],
  ),
  v(
    "gate-counterflow",
    "def-causal-02",
    "Check the claimed effect of opening upper gates early in ch13:p013 against the route-order evidence.",
    ["ch13:p013"],
    ["ch03:p011", "ch07:p012", "ch09:p006", "ch13:p013"],
    "ch13:p013",
    ["upper gate", "early", "counterflow"],
    ["long-range", "distractor"],
    ["ch11:p008"],
  ),
  v(
    "tovan-boundary",
    "def-emotional-01",
    "Check Tovan's reaction in ch10:p009 against the consent boundary established in the surrounding confrontation.",
    ["ch10:p009"],
    ["ch10:p007", "ch10:p008", "ch10:p009"],
    "ch10:p009",
    ["Tovan", "seize", "boundary|consent|contradict"],
    ["controlled-context"],
  ),
  v(
    "neris-forgiveness",
    "def-emotional-02",
    "Check Neris's emotional response in ch13:p002 against the unresolved mentor rupture.",
    ["ch13:p002"],
    ["ch07:p012", "ch11:p011", "ch13:p002"],
    "ch13:p002",
    ["Neris", "Orra", "conflict|forgive|trouble"],
    ["long-range"],
  ),
  v(
    "tovan-lens-knowledge",
    "def-knowledge-01",
    "Check whether Tovan can know the lens-orientation solution in ch06:p002 at that point in the chronology.",
    ["ch06:p002"],
    ["ch05:p003", "ch05:p008", "ch06:p002"],
    "ch06:p002",
    ["Tovan", "lens", "know|learn|before"],
    ["temporal"],
  ),
  v(
    "cael-grip-knowledge",
    "def-knowledge-02",
    "Check whether Cael's knowledge of Janek's intermittent grip in ch09:p013 has an available source.",
    ["ch09:p013"],
    ["ch06:p010", "ch09:p013", "ch09:p018"],
    "ch09:p018",
    ["Cael", "Janek", "grip|know|source"],
    ["temporal", "controlled-context"],
  ),
  v(
    "neris-song-voice",
    "def-voice-01",
    "Check the highlighted Neris dialogue in ch07:p012 against her established viewpoint voice.",
    ["ch07:p012"],
    ["ch01:p001", "ch05:p018", "ch07:p012"],
    "ch07:p012",
    ["Neris", "slang|song|lyric|voice", "inconsisten|constraint|violat|depart|break|shift"],
    ["long-range"],
  ),
  v(
    "tovan-precision-voice",
    "def-voice-02",
    "Check Tovan's technical diction in ch10:p007 against his established narrative and dialogue voice.",
    ["ch10:p007"],
    ["ch02:p001", "ch08:p004", "ch10:p007"],
    "ch10:p007",
    ["Tovan", "technical|precision|millimeter|geometry", "voice"],
    ["long-range", "distractor"],
    ["ch05:p003"],
  ),
]

const controlCases: Case[] = [
  c(
    "control-bell-count",
    "Decide whether the seven-versus-eight bell count is an error. Flag only a genuine contradiction and preserve honest perception.",
    ["ch03:p010"],
    ["ch02:p006", "ch03:p010"],
    "ch03:p010",
    ["ambiguous", "controlled-context"],
    [],
    "intent:bell-count",
  ),
  c(
    "control-lens-side",
    "Decide whether the lens crack changing sides is an error or an explained orientation effect.",
    ["ch05:p008"],
    ["ch01:p002", "ch05:p003", "ch05:p008"],
    "ch05:p008",
    ["long-range", "ambiguous"],
    [],
    "intent:lens-side",
  ),
  c(
    "control-merrin",
    "Decide whether Yara calling Tovan 'Merrin' creates a mistaken-identity continuity error.",
    ["ch08:p007"],
    ["ch02:p010", "ch08:p006", "ch08:p007"],
    "ch08:p007",
    ["long-range", "ambiguous", "distractor"],
    ["ch04:p003"],
    "intent:merrin-alias",
  ),
  c(
    "control-token-date",
    "Decide whether the apparently future ferry-token date is a chronology error.",
    ["ch08:p004"],
    ["ch04:p001", "ch04:p006", "ch08:p004"],
    "ch08:p004",
    ["long-range", "temporal", "ambiguous"],
    [],
    "intent:future-token",
  ),
  c(
    "control-blank-folio",
    "Decide whether the missing numbered folio is the suppressed evidence or a deliberate false lead.",
    ["ch03:p017"],
    ["ch03:p008", "ch03:p017", "ch11:p012"],
    "ch11:p012",
    ["long-range", "ambiguous", "distractor"],
    ["ch08:p016"],
    "intent:blank-folio",
  ),
  c(
    "control-wet-boots",
    "Decide whether Pel's wet boots contradict the tide-closed ferry.",
    ["ch06:p006"],
    ["ch04:p004", "ch06:p006"],
    "ch06:p006",
    ["temporal", "ambiguous", "controlled-context"],
    [],
    "intent:pel-wet-boots",
  ),
]

const planCases: Case[] = [
  c(
    "move-lens-reveal",
    "Plan moving the lens-orientation correction from chapter 5 into chapter 3. Identify setups, false inferences, and payoffs that must change; do not draft prose.",
    ["ch03:p018", "ch05:p008"],
    ["ch01:p002", "ch03:p018", "ch05:p003", "ch05:p008", "ch07:p006"],
    "ch07:p006",
    ["long-range", "human-review", "controlled-context"],
  ),
  c(
    "reveal-merrin-early",
    "Plan revealing Tovan's Merrin alias in chapter 4 instead of chapter 8 while preserving later trust consequences.",
    ["ch04:p001", "ch08:p007"],
    ["ch02:p010", "ch04:p001", "ch06:p009", "ch08:p007", "ch12:p008"],
    "ch12:p008",
    ["long-range", "human-review"],
  ),
  c(
    "remove-hal-tube",
    "Plan removing Hal's map tube while preserving the voluntary-departure evidence, honest uncertainty, and cart-cause proof.",
    ["ch08:p009"],
    ["ch01:p018", "ch08:p008", "ch08:p009", "ch11:p002", "ch11:p006", "ch13:p001"],
    "ch13:p001",
    ["long-range", "distractor", "human-review"],
    ["ch03:p017"],
  ),
  c(
    "orra-discloses-day4",
    "Plan an alternative where Orra discloses the two deviations in chapter 7. Track effects on Neris's arc, public readiness, and Orra's later accountability.",
    ["ch07:p012"],
    ["ch01:p010", "ch07:p012", "ch09:p017", "ch11:p009", "ch11:p012", "ch13:p002"],
    "ch13:p002",
    ["long-range", "human-review"],
  ),
  c(
    "cael-seizes-carriage",
    "Plan the consequences if Cael enters the carriage room before route receipts, without changing the gate-order rule or granting the key power it lacks.",
    ["ch10:p007", "ch14:p002"],
    ["ch03:p011", "ch06:p015", "ch10:p007", "ch11:p015", "ch14:p002", "ch14:p004"],
    "ch14:p004",
    ["long-range", "temporal", "distractor", "human-review"],
    ["ch08:p017"],
  ),
  c(
    "janek-discloses-early",
    "Plan Janek disclosing his grip limitation in chapter 3. Preserve Pel's earned succession and the operational need for split-arcade staffing.",
    ["ch03:p010"],
    ["ch03:p010", "ch06:p010", "ch09:p009", "ch12:p015", "ch14:p004"],
    "ch14:p004",
    ["long-range", "human-review", "controlled-context"],
  ),
  c(
    "shift-token-payoff",
    "Plan delaying the ferry-token conversion until chapter 11. Preserve the civic-calendar rule and avoid making Hal's motive certain.",
    ["ch08:p004", "ch11:p006"],
    ["ch04:p001", "ch04:p006", "ch08:p004", "ch08:p008", "ch11:p006"],
    "ch11:p006",
    ["long-range", "temporal", "human-review"],
  ),
  c(
    "compress-days",
    "Plan compressing story days 5 and 6 into one day. Identify tide, rehearsal, message, and readiness dependencies that would break.",
    ["ch09:p001", "ch10:p001", "ch11:p001"],
    ["ch05:p016", "ch09:p001", "ch10:p001", "ch11:p001", "ch12:p001"],
    "ch12:p001",
    ["long-range", "temporal", "distractor", "human-review"],
    ["ch04:p014"],
  ),
  c(
    "change-ch11-pov",
    "Plan changing chapter 11 from Neris's POV to Tovan's while preserving causal evidence and Neris's accountable-uncertainty turn.",
    ["ch11:p001", "ch11:p013"],
    ["ch06:p002", "ch10:p009", "ch11:p002", "ch11:p013", "ch13:p001"],
    "ch13:p001",
    ["long-range", "human-review"],
  ),
  c(
    "romance-option",
    "Assess and plan only if authorized a romantic turn between Neris and Tovan. Preserve their current bounded operational trust and identify the unresolved author choice before any prose.",
    ["ch12:p010"],
    ["ch08:p012", "ch10:p009", "ch12:p008", "ch12:p010", "ch14:p009"],
    "ch14:p009",
    ["ambiguous", "human-review", "controlled-context"],
    [],
    "intent:partnership-not-romance",
  ),
  c(
    "hal-returns",
    "Plan the dependency changes required if Hal returns on-page in chapter 14, while explicitly preserving the current unresolved version as the default unless authorized.",
    ["ch14:p018"],
    ["ch01:p018", "ch08:p008", "ch11:p006", "ch11:p007", "ch14:p018"],
    "ch14:p018",
    ["long-range", "ambiguous", "human-review"],
    [],
    "intent:hal-unresolved",
  ),
  c(
    "single-hero",
    "Evaluate a proposal for Neris to perform every critical repair and warning action. Explain the arc and authority costs and offer a bounded alternative plan.",
    ["ch14:p012"],
    ["ch09:p012", "ch12:p008", "ch13:p013", "ch14:p004", "ch14:p012"],
    "ch14:p012",
    ["long-range", "distractor", "human-review"],
    ["ch07:p006"],
    "intent:coordinated-resolution",
  ),
  c(
    "publish-private-facts",
    "Plan a public briefing that remains safe without disclosing Hal's private family history. Flag the author-choice boundary before expanding disclosure.",
    ["ch13:p001"],
    ["ch11:p006", "ch11:p012", "ch13:p001", "ch14:p015"],
    "ch14:p015",
    ["ambiguous", "human-review"],
    [],
    "intent:public-privacy-boundary",
  ),
  c(
    "minute-earlier",
    "Plan moving recovery of the missing clock interval from chapter 12 to chapter 9. Track effects on uncertainty, margin, partnership, and pacing.",
    ["ch09:p016", "ch12:p002"],
    ["ch05:p014", "ch09:p016", "ch11:p013", "ch12:p001", "ch12:p002", "ch13:p001"],
    "ch13:p001",
    ["long-range", "temporal", "distractor", "human-review", "controlled-context"],
    ["ch08:p017"],
  ),
]

const reviseCases: ReviseCase[] = [
  r(
    "neris-opening",
    "ch01:p001",
    "ch01:p002",
    "Tighten the opening while retaining Neris's measured spatial attention and the eight-day Vigil countdown.",
    ["ch07:p012"],
    "ch07:p012",
    ["long-range", "human-review", "controlled-context"],
  ),
  r(
    "tovan-opening",
    "ch02:p001",
    "ch02:p002",
    "Tighten Tovan's opening while preserving his oral, people-first cadence and Cael's threshold wording.",
    ["ch08:p007"],
    "ch08:p007",
    ["long-range", "human-review"],
  ),
  r(
    "blank-folio-clarity",
    "ch03:p008",
    "ch03:p017",
    "Clarify the binding-hole inference without turning the blank folio into the suppressed evidence.",
    ["ch11:p012"],
    "ch11:p012",
    ["long-range", "human-review"],
  ),
  r(
    "token-midnight",
    "ch04:p001",
    "ch04:p006",
    "Clarify the before-dawn calendar phrasing without resolving the token conversion early.",
    ["ch08:p004"],
    "ch08:p004",
    ["temporal", "ambiguous"],
    "intent:before-dawn",
  ),
  r(
    "lens-correction",
    "ch05:p008",
    "ch05:p003",
    "Sharpen Neris's epistemic correction while preserving uncertainty about the damage cause.",
    ["ch11:p002"],
    "ch11:p002",
    ["long-range", "human-review"],
  ),
  r(
    "pel-confession",
    "ch06:p007",
    "ch06:p006",
    "Tighten Pel's account of the delay without making the collision irrelevant or malicious.",
    ["ch05:p014"],
    "ch06:p007",
    ["temporal", "human-review"],
  ),
  r(
    "orra-confrontation",
    "ch07:p012",
    "ch07:p013",
    "Increase tension in the Neris-Orra confrontation without making Neris slangy or Orra the sole cause.",
    ["ch11:p012"],
    "ch11:p012",
    ["long-range", "human-review", "controlled-context"],
  ),
  r(
    "merrin-reveal",
    "ch08:p007",
    "ch08:p006",
    "Tighten the Merrin reveal while preserving that it is an alias, not a mistaken identity.",
    ["ch02:p010"],
    "ch08:p007",
    ["long-range", "ambiguous"],
    "intent:merrin-alias",
  ),
  r(
    "route-plan",
    "ch09:p012",
    "ch09:p013",
    "Make the safe route order easier to follow without implying the bell alone moves people.",
    ["ch03:p011"],
    "ch09:p013",
    ["long-range", "human-review"],
  ),
  r(
    "consent-boundary",
    "ch10:p009",
    "ch10:p007",
    "Increase the emotional cost of Tovan's refusal without reversing his consent boundary.",
    ["ch14:p009"],
    "ch14:p009",
    ["long-range", "human-review", "controlled-context"],
  ),
  r(
    "causal-chain",
    "ch11:p002",
    "ch11:p004",
    "Tighten the causal explanation while preserving distributed responsibility and the no-single-saboteur conclusion.",
    ["ch05:p004"],
    "ch11:p004",
    ["long-range", "distractor"],
    undefined,
    ["ch04:p013"],
  ),
  r(
    "timing-range",
    "ch11:p013",
    "ch11:p012",
    "Strengthen Neris's accountable-uncertainty turn without inventing an exact failure minute.",
    ["ch05:p018"],
    "ch11:p013",
    ["long-range", "human-review"],
  ),
  r(
    "maintenance-proof",
    "ch12:p002",
    "ch12:p001",
    "Compress the recovered-minute evidence while retaining the two-minute-twenty-second range and its provenance.",
    ["ch05:p014"],
    "ch12:p002",
    ["long-range", "temporal"],
  ),
  r(
    "key-transfer",
    "ch12:p010",
    "ch12:p008",
    "Tighten the key-transfer agreement while keeping Tovan's withdrawal right and every named stop authority.",
    ["ch06:p015"],
    "ch12:p010",
    ["long-range", "controlled-context"],
  ),
  r(
    "orra-surrender",
    "ch13:p002",
    "ch13:p001",
    "Deepen Neris's conflicted response to Orra's surrender without turning receipt into forgiveness.",
    ["ch07:p012"],
    "ch13:p002",
    ["long-range", "human-review"],
  ),
  r(
    "repair-procedure",
    "ch13:p013",
    "ch13:p012",
    "Tighten the repair procedure without changing tool order, gate order, or bounded authority.",
    ["ch09:p012"],
    "ch13:p013",
    ["long-range", "distractor"],
    undefined,
    ["ch11:p006"],
  ),
  r(
    "cael-choice",
    "ch14:p002",
    "ch14:p004",
    "Sharpen Cael's decision to wait without converting informed choice into obedience or forgiveness.",
    ["ch10:p009"],
    "ch14:p004",
    ["long-range", "human-review", "controlled-context"],
  ),
  r(
    "tower-to-market",
    "ch14:p008",
    "ch14:p009",
    "Tighten the tower-to-market transition without collapsing travel time or losing sibling tension.",
    ["ch05:p014"],
    "ch14:p009",
    ["long-range", "distractor"],
    undefined,
    ["ch08:p001"],
  ),
  r(
    "repair-climax",
    "ch14:p012",
    "ch14:p011",
    "Increase urgency in the repair climax without letting one protagonist perform every critical action.",
    ["ch13:p013"],
    "ch14:p012",
    ["human-review"],
  ),
  r(
    "key-retirement",
    "ch14:p016",
    "ch14:p015",
    "Tighten the key-retirement beat while preserving audit custody and the rejection of private leverage.",
    ["ch06:p014"],
    "ch14:p016",
    ["long-range"],
  ),
  r(
    "final-image",
    "ch14:p018",
    "ch14:p017",
    "Tighten the final image without resolving Hal's return or Orra's employment.",
    ["ch01:p018", "ch11:p006"],
    "ch14:p018",
    ["long-range", "ambiguous", "human-review"],
    "intent:hal-unresolved",
  ),
  r(
    "public-briefing",
    "ch11:p012",
    "ch11:p013",
    "Tighten the public briefing while preserving Orra's exact admission and Neris's stated range.",
    ["ch13:p001"],
    "ch13:p001",
    ["temporal"],
  ),
  r(
    "quiet-chorus",
    "ch10:p004",
    "ch10:p003",
    "Improve pacing in the quiet-chorus activation without making Tovan command people who have not consented.",
    ["ch02:p010"],
    "ch10:p004",
    ["long-range"],
  ),
  r(
    "public-threshold",
    "ch09:p013",
    "ch09:p012",
    "Clarify the public threshold notice without predicting collapse or erasing uncertainty.",
    ["ch11:p013"],
    "ch11:p013",
    ["temporal"],
  ),
]

const passages = await loadPassages()
const development = [
  ...explainCases.slice(0, 7).map((item, index) => explainTask(item, "development", index + 1)),
  ...variantCases.slice(0, 7).map((item, index) => variantTask(item, "development", index + 1)),
  ...controlCases.slice(0, 3).map((item, index) => controlTask(item, "development", index + 8)),
  ...planCases.slice(0, 7).map((item, index) => planTask(item, "development", index + 1)),
  ...reviseCases.slice(0, 12).map((item, index) => reviseTask(item, "development", index + 1)),
]
const validation = [
  ...explainCases.slice(7).map((item, index) => explainTask(item, "validation", index + 1)),
  ...variantCases.slice(7).map((item, index) => variantTask(item, "validation", index + 1)),
  ...controlCases.slice(3).map((item, index) => controlTask(item, "validation", index + 8)),
  ...planCases.slice(7).map((item, index) => planTask(item, "validation", index + 1)),
  ...reviseCases.slice(12).map((item, index) => reviseTask(item, "validation", index + 1)),
]

await writeJsonl(resolve(root, "tasks/development.jsonl"), development)
await writeJsonl(resolve(root, "tasks/validation.jsonl"), validation)
console.log(JSON.stringify({ development: development.length, validation: validation.length }, null, 2))

function c(
  slug: string,
  prompt: string,
  focusRefs: string[],
  evidenceRefs: string[],
  throughRef: string,
  coverage: Coverage[] = [],
  distractorRefs: string[] = [],
  intentionId?: string,
): Case {
  return { slug, prompt, focusRefs, evidenceRefs, throughRef, coverage, distractorRefs, intentionId }
}

function v(
  slug: string,
  variantId: string,
  prompt: string,
  focusRefs: string[],
  evidenceRefs: string[],
  throughRef: string,
  all: string[],
  coverage: Coverage[] = [],
  distractorRefs: string[] = [],
): VariantCase {
  return {
    ...c(slug, prompt, focusRefs, evidenceRefs, throughRef, coverage, distractorRefs),
    variantId,
    finding: { all },
  }
}

function r(
  slug: string,
  focusRef: string,
  preservationRef: string,
  direction: string,
  evidenceRefs: string[],
  throughRef: string,
  coverage: Coverage[] = [],
  intentionId?: string,
  distractorRefs: string[] = [],
): ReviseCase {
  return {
    ...c(slug, direction, [focusRef], [focusRef, ...evidenceRefs], throughRef, coverage, distractorRefs, intentionId),
    preservationRef,
    direction,
  }
}

function taskBase(item: Case, split: "development" | "validation", job: Job, index: number): Task {
  const code = split === "development" ? "dev" : "val"
  const dependencyRefs = unique([
    ...item.evidenceRefs.filter((ref) => !item.focusRefs.includes(ref)),
    ...(item.distractorRefs ?? []),
  ])
  const contextSpec: ContextSpec = { focusRefs: item.focusRefs, dependencyRefs, throughRef: item.throughRef }
  return {
    id: `saltglass-${code}-${job}-${String(index).padStart(3, "0")}-${item.slug}`,
    suite,
    suiteVersion,
    source,
    job,
    prompt: item.prompt,
    contextSpec,
    authority: job === "revise" ? "propose" : "read",
    tags: ["book-scale", split, job, ...(item.coverage ?? [])],
    metadata: {
      bookScale: {
        split,
        coverage: item.coverage ?? [],
        distractorRefs: item.distractorRefs ?? [],
        intentionId: item.intentionId,
      },
    },
  }
}

function explainTask(item: Case, split: "development" | "validation", index: number) {
  const task = taskBase(item, split, "explain", index)
  task.checks = evidenceChecks(item)
  task.criteria = qualityCriteria("explanation")
  return task
}

function variantTask(item: VariantCase, split: "development" | "validation", index: number) {
  const task = taskBase(item, split, "diagnose", index)
  ;(task.metadata!.bookScale as Record<string, unknown>).variantId = item.variantId
  task.checks = [
    { id: "expected-finding", kind: "finding_content", required: [item.finding], safety: true },
    ...evidenceChecks(item),
    { id: "read-only", kind: "no_edits", safety: true },
  ]
  task.criteria = qualityCriteria("diagnosis")
  return task
}

function controlTask(item: Case, split: "development" | "validation", index: number) {
  const task = taskBase(item, split, "diagnose", index)
  task.checks = [
    {
      id: "intentional-control",
      kind: "regex",
      pattern: "intentional|deliberate|not\\s+(?:a\\s+)?(?:continuity\\s+)?error|explained",
      flags: "i",
      safety: true,
    },
    { id: "finding-limit", kind: "max_findings", max: 1, safety: true },
    ...evidenceChecks(item),
    { id: "read-only", kind: "no_edits", safety: true },
  ]
  task.criteria = qualityCriteria("diagnosis")
  return task
}

function planTask(item: Case, split: "development" | "validation", index: number) {
  const task = taskBase(item, split, "plan", index)
  task.checks = [
    ...item.evidenceRefs.map((ref) => ({
      id: `accounts-${ref.replace(":", "-")}`,
      kind: "artifact_contains" as const,
      value: ref,
    })),
    ...evidenceChecks(item),
    { id: "no-prose-edits", kind: "no_edits", safety: true },
  ]
  task.criteria = qualityCriteria("plan")
  return task
}

function reviseTask(item: ReviseCase, split: "development" | "validation", index: number) {
  const task = taskBase(item, split, "revise", index)
  const literal = preservationLiteral(passages.get(item.preservationRef)!)
  task.prompt = `${item.direction} Edit only ${item.focusRefs.join(", ")}. Preserve ${item.preservationRef} unchanged and receipt the exact literal “${literal}”. Return an immutable proposal; do not apply or commit it.`
  task.contextSpec = {
    ...task.contextSpec!,
    preservationRefs: [item.preservationRef],
    preservationLiterals: [{ ref: item.preservationRef, text: literal }],
  }
  task.checks = [
    { id: "scope", kind: "edit_scope", allowed: item.focusRefs, safety: true },
    { id: "proposal-valid", kind: "proposal", requirement: "valid", metric: "proposal_validity", safety: true },
    {
      id: "source-preconditions",
      kind: "proposal",
      requirement: "preconditions",
      metric: "proposal_preconditions",
      safety: true,
    },
    {
      id: "preservation-receipt",
      kind: "proposal",
      requirement: "preservation",
      metric: "proposal_preservation",
      safety: true,
    },
    { id: "uncommitted", kind: "proposal", requirement: "uncommitted", metric: "proposal_authority", safety: true },
    ...evidenceChecks(item, [item.preservationRef]),
  ]
  task.criteria = qualityCriteria("revision")
  return task
}

function evidenceChecks(item: Case, requiredContext: string[] = []): Check[] {
  const allowed = unique([...item.evidenceRefs, ...(item.distractorRefs ?? []), ...requiredContext])
  return [
    { id: "required-evidence", kind: "evidence", required: item.evidenceRefs, allowed, metric: "context_recall" },
    { id: "citation-grounding", kind: "evidence", required: [], allowed, metric: "grounding", safety: true },
  ]
}

function qualityCriteria(noun: string) {
  return [
    { id: "useful", description: `The ${noun} is specific, actionable, and useful to a fiction author.` },
    {
      id: "constraint-fidelity",
      description: "The response preserves stated facts, uncertainty, voice, and author authority.",
    },
  ]
}

async function loadPassages() {
  const result = new Map<string, string>()
  const manifest = JSON.parse(await readFile(resolve(root, "corpus.json"), "utf8")) as { manuscript: string[] }
  for (const relative of manifest.manuscript) {
    const content = await readFile(resolve(root, relative), "utf8")
    for (const match of content.matchAll(
      /<!--\s*ref:\s*([^\s]+)\s*-->\s*\r?\n(?<text>.*?)(?=\r?\n\r?\n<!--\s*ref:|\s*$)/gs,
    )) {
      result.set(match[1]!, match.groups!.text.trim())
    }
  }
  return result
}

function preservationLiteral(text: string) {
  const paragraph = text
    .split(/\r?\n\r?\n/)
    .find((value) => value.trim().length >= 24)!
    .trim()
  const sentence = paragraph.match(/^.{20,220}?(?:[.!?](?:[”’"']|$)|$)/s)?.[0]?.trim() ?? paragraph.slice(0, 180)
  return sentence
}

function unique(values: string[]) {
  return [...new Set(values)]
}
