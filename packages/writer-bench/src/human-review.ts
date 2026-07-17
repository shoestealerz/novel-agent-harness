import { createHash, createHmac } from "node:crypto"
import type { ExecutionResponse, Job, RunFile, RunRecord, Task } from "./contracts.ts"

export const reviewDimensions = [
  "proseQuality",
  "voiceRetention",
  "pacingOrDramaticEffect",
  "constraintFidelity",
  "usefulness",
] as const

export type ReviewDimension = (typeof reviewDimensions)[number]
export type ReviewPreference = "left" | "tie" | "right"

export type HumanReviewManifest = {
  formatVersion: 1
  study: string
  outputSelection: { trial: number; rule: string }
  randomization: { algorithm: string; seed: string }
  eligibility: {
    minimumReviewersPerPair: number
    minimumPairRatings: number
    reviewerRequirements: string[]
  }
  tasks: { id: string; split?: string; job: Job; tags?: string[] }[]
  comparisons: {
    pairId: string
    taskId: string
    trial: number
    baselineTargetId: string
    leftTargetId: string
    rightTargetId: string
  }[]
}

export type BlindedOutput = {
  answer: string
  proposedChanges: { target: string; text: string }[]
}

export type BlindedPair = {
  pairId: string
  job: Job
  authorRequest: string
  sourcePassages: { ref: string; text: string }[]
  left: BlindedOutput
  right: BlindedOutput
}

export type ReviewPacket = {
  formatVersion: 1
  study: string
  reviewerCode: string
  scale: {
    minimum: 1
    maximum: 5
    anchors: Record<"1" | "2" | "3" | "4" | "5", string>
  }
  instructions: string[]
  pairs: BlindedPair[]
}

export type ReviewerEligibility = {
  adult: boolean
  fluentEnglish: boolean
  fictionExperience: boolean
  didNotAuthorOutput: boolean
  consentToDeidentifiedPublication: boolean
}

export type PairRating = {
  pairId: string
  dimensions: Record<ReviewDimension, { left: number; right: number }>
  preference: ReviewPreference
  defectFlags?: { left: string[]; right: string[] }
  rationale?: string
}

export type ReviewSubmission = {
  formatVersion: 1
  study: string
  reviewerCode: string
  eligibility: ReviewerEligibility
  ratings: PairRating[]
}

export type HumanReviewAnalysis = ReturnType<typeof analyzeHumanReview>
export type HumanReviewAssembly = ReturnType<typeof assembleHumanReviewRun>

export function parseHumanReviewManifest(value: unknown): HumanReviewManifest {
  const input = object(value, "human-review manifest")
  if (input.formatVersion !== 1) throw new Error("human-review manifest formatVersion must be 1")
  const outputSelection = object(input.outputSelection, "human-review manifest.outputSelection")
  const randomization = object(input.randomization, "human-review manifest.randomization")
  const eligibility = object(input.eligibility, "human-review manifest.eligibility")
  const tasks = array(input.tasks, "human-review manifest.tasks").map((value, index) => {
    const task = object(value, `human-review manifest.tasks[${index}]`)
    return {
      id: string(task.id, `human-review manifest.tasks[${index}].id`),
      split: optionalString(task.split),
      job: string(task.job, `human-review manifest.tasks[${index}].job`) as Job,
      tags: optionalStringArray(task.tags),
    }
  })
  const comparisons = array(input.comparisons, "human-review manifest.comparisons").map((value, index) => {
    const pair = object(value, `human-review manifest.comparisons[${index}]`)
    return {
      pairId: string(pair.pairId, `human-review manifest.comparisons[${index}].pairId`),
      taskId: string(pair.taskId, `human-review manifest.comparisons[${index}].taskId`),
      trial: integer(pair.trial, `human-review manifest.comparisons[${index}].trial`),
      baselineTargetId: string(pair.baselineTargetId, `human-review manifest.comparisons[${index}].baselineTargetId`),
      leftTargetId: string(pair.leftTargetId, `human-review manifest.comparisons[${index}].leftTargetId`),
      rightTargetId: string(pair.rightTargetId, `human-review manifest.comparisons[${index}].rightTargetId`),
    }
  })
  requireUnique(tasks.map((task) => task.id), "human-review task")
  requireUnique(comparisons.map((pair) => pair.pairId), "human-review pair")
  const taskIds = new Set(tasks.map((task) => task.id))
  for (const pair of comparisons) {
    if (!taskIds.has(pair.taskId)) throw new Error(`human-review pair references unknown task: ${pair.taskId}`)
    if (pair.trial !== outputSelection.trial) throw new Error(`human-review pair uses an unregistered trial: ${pair.pairId}`)
    const baselineSides = [pair.leftTargetId, pair.rightTargetId].filter((id) => id === pair.baselineTargetId).length
    if (baselineSides !== 1) throw new Error(`human-review pair must contain its baseline exactly once: ${pair.pairId}`)
  }
  return {
    formatVersion: 1,
    study: string(input.study, "human-review manifest.study"),
    outputSelection: {
      trial: integer(outputSelection.trial, "human-review manifest.outputSelection.trial"),
      rule: string(outputSelection.rule, "human-review manifest.outputSelection.rule"),
    },
    randomization: {
      algorithm: string(randomization.algorithm, "human-review manifest.randomization.algorithm"),
      seed: string(randomization.seed, "human-review manifest.randomization.seed"),
    },
    eligibility: {
      minimumReviewersPerPair: positiveInteger(
        eligibility.minimumReviewersPerPair,
        "human-review manifest.eligibility.minimumReviewersPerPair",
      ),
      minimumPairRatings: positiveInteger(
        eligibility.minimumPairRatings,
        "human-review manifest.eligibility.minimumPairRatings",
      ),
      reviewerRequirements: stringArray(
        eligibility.reviewerRequirements,
        "human-review manifest.eligibility.reviewerRequirements",
      ),
    },
    tasks,
    comparisons,
  }
}

export function prepareReviewPacket(run: RunFile, manifest: HumanReviewManifest, reviewerCode: string): ReviewPacket {
  if (!reviewerCode.trim()) throw new Error("reviewerCode must be non-empty")
  const records = new Map(run.records.map((record) => [recordKey(record.targetId, record.task.id, record.trial), record]))
  const taskMetadata = new Map(manifest.tasks.map((task) => [task.id, task]))
  const redactions = unique(run.targets.flatMap((target) => [target.id, target.label].filter((value): value is string => Boolean(value))))
  const pairs = manifest.comparisons.map((comparison) => {
    const left = requiredRecord(records, comparison.leftTargetId, comparison.taskId, comparison.trial)
    const right = requiredRecord(records, comparison.rightTargetId, comparison.taskId, comparison.trial)
    assertComparableTasks(left.task, right.task, comparison.pairId)
    const metadata = taskMetadata.get(comparison.taskId)
    if (!metadata) throw new Error(`human-review task metadata is missing: ${comparison.taskId}`)
    return {
      pairId: comparison.pairId,
      job: metadata.job,
      authorRequest: left.task.prompt,
      sourcePassages: necessaryPassages(left.task),
      left: blindedOutput(left.response!, left.task.job, redactions),
      right: blindedOutput(right.response!, right.task.job, redactions),
    }
  })
  const seed = /^[a-f\d]{64}$/i.test(manifest.randomization.seed)
    ? Buffer.from(manifest.randomization.seed, "hex")
    : Buffer.from(manifest.randomization.seed)
  pairs.sort((a, b) => reviewOrder(seed, reviewerCode, a.pairId).localeCompare(reviewOrder(seed, reviewerCode, b.pairId)))
  return {
    formatVersion: 1,
    study: manifest.study,
    reviewerCode,
    scale: {
      minimum: 1,
      maximum: 5,
      anchors: {
        "1": "materially harmful or unusable",
        "2": "weak; major repair needed",
        "3": "acceptable; useful with ordinary revision",
        "4": "strong; minor repair only",
        "5": "exceptional for this request and source",
      },
    },
    instructions: [
      "Rate each response only against the author request and supplied source passages.",
      "Score both responses independently before choosing left, tie, or right.",
      "Do not guess which system produced a response or use outside story knowledge.",
      "Treat unsupported invention, broken continuity, lost voice, and ignored constraints as defects.",
      "Optional rationales are hidden from quantitative analysis until that aggregate is frozen.",
    ],
    pairs,
  }
}

export function assembleHumanReviewRun(primary: RunFile, supplemental: RunFile, manifest: HumanReviewManifest) {
  const trial = manifest.outputSelection.trial
  if (trial >= primary.trials) throw new Error("primary run does not contain the frozen human-review trial")
  if (supplemental.trials !== 1 || trial !== 0) {
    throw new Error("supplemental human-review execution must contain only frozen trial zero")
  }
  const targets = unique(manifest.comparisons.flatMap((pair) => [pair.leftTargetId, pair.rightTargetId]))
  for (const targetId of targets) {
    const left = primary.targets.find((target) => target.id === targetId)
    const right = supplemental.targets.find((target) => target.id === targetId)
    if (!left || !right || left.baseModel !== right.baseModel || left.comparisonKey !== right.comparisonKey || JSON.stringify(left.command) !== JSON.stringify(right.command)) {
      throw new Error(`human-review source target mismatch: ${targetId}`)
    }
  }
  const primaryRecords = new Map(primary.records.map((record) => [recordKey(record.targetId, record.task.id, record.trial), record]))
  const supplementalRecords = new Map(supplemental.records.map((record) => [recordKey(record.targetId, record.task.id, record.trial), record]))
  const taskOrder = new Map(manifest.tasks.map((task, index) => [task.id, index]))
  const targetOrder = new Map(targets.map((target, index) => [target, index]))
  const records = unique(manifest.comparisons.flatMap((pair) => [
    `${pair.leftTargetId}\u0000${pair.taskId}`,
    `${pair.rightTargetId}\u0000${pair.taskId}`,
  ])).map((key) => {
    const [targetId, taskId] = key.split("\u0000") as [string, string]
    const metadata = manifest.tasks.find((task) => task.id === taskId)
    if (!metadata) throw new Error(`human-review assembly task is missing: ${taskId}`)
    const source = metadata.split === "sealed" ? primaryRecords : supplementalRecords
    return requiredRecord(source, targetId, taskId, trial)
  }).sort((left, right) =>
    (targetOrder.get(left.targetId) ?? Number.MAX_SAFE_INTEGER) - (targetOrder.get(right.targetId) ?? Number.MAX_SAFE_INTEGER)
    || (taskOrder.get(left.task.id) ?? Number.MAX_SAFE_INTEGER) - (taskOrder.get(right.task.id) ?? Number.MAX_SAFE_INTEGER)
  ).map((record) => ({ ...record, trial: 0 }))
  const expectedRecords = new Set(manifest.comparisons.flatMap((pair) => [
    `${pair.leftTargetId}\u0000${pair.taskId}`,
    `${pair.rightTargetId}\u0000${pair.taskId}`,
  ])).size
  if (records.length !== expectedRecords) throw new Error("human-review assembly record count mismatch")
  const digest = createHash("sha256").update(JSON.stringify(records)).digest("hex")
  const run: RunFile = {
    formatVersion: 1,
    runId: `human-review-${digest.slice(0, 16)}`,
    createdAt: [primary.createdAt, supplemental.createdAt].sort().at(-1)!,
    suiteFiles: ["human-review-composite.jsonl"],
    targets: targets.map((targetId) => primary.targets.find((target) => target.id === targetId)!),
    trials: 1,
    concurrency: supplemental.concurrency,
    records,
  }
  return {
    run,
    receipt: {
      formatVersion: 1 as const,
      study: manifest.study,
      primaryRunId: primary.runId,
      supplementalRunId: supplemental.runId,
      trial,
      tasks: new Set(records.map((record) => record.task.id)).size,
      records: records.length,
      recordsSha256: digest,
      rule: "sealed outputs come from the accepted primary run; development and validation outputs come from the frozen one-trial supplemental run; no output is selected by score or content",
    },
  }
}

export function renderReviewHtml(packet: ReviewPacket) {
  const payload = JSON.stringify(packet).replaceAll("<", "\\u003c")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blinded fiction review</title>
<style>
:root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{margin:0;background:#111827;color:#f9fafb}main{max-width:1180px;margin:auto;padding:24px}.panel{background:#1f2937;border:1px solid #374151;border-radius:12px;padding:20px;margin:16px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.response,.source{white-space:pre-wrap;background:#111827;border-radius:8px;padding:14px}.source{margin:8px 0}.muted{color:#9ca3af}.ratings{width:100%;border-collapse:collapse}.ratings th,.ratings td{padding:8px;border-bottom:1px solid #374151;text-align:left}select,textarea,button{font:inherit}select,textarea{background:#111827;color:#f9fafb;border:1px solid #4b5563;border-radius:6px;padding:7px}textarea{width:100%;min-height:70px;box-sizing:border-box}button{border:0;border-radius:7px;padding:10px 16px;cursor:pointer}.primary{background:#60a5fa;color:#08111f}.secondary{background:#374151;color:#fff}.nav{display:flex;gap:10px;justify-content:space-between;align-items:center}.hidden{display:none}.checks label,.flags label{display:block;margin:7px 0}.error{color:#fca5a5}.complete{color:#86efac}@media(max-width:800px){.grid{grid-template-columns:1fr}}
</style></head>
<body><main><h1>Blinded fiction review</h1><div id="app"></div></main>
<script id="packet" type="application/json">${payload}</script>
<script>
const packet=JSON.parse(document.getElementById('packet').textContent);const app=document.getElementById('app');
const dimensions=[['proseQuality','Prose quality'],['voiceRetention','Voice retention'],['pacingOrDramaticEffect','Pacing / dramatic effect'],['constraintFidelity','Constraint fidelity'],['usefulness','Usefulness to the author']];
const storageKey='novel-review:'+packet.study+':'+packet.reviewerCode;let state=JSON.parse(localStorage.getItem(storageKey)||'{"eligibility":{},"ratings":{}}');let index=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){localStorage.setItem(storageKey,JSON.stringify(state))}function score(name,side,value){const p=packet.pairs[index];state.ratings[p.pairId]??={dimensions:{},preference:''};state.ratings[p.pairId].dimensions[name]??={};state.ratings[p.pairId].dimensions[name][side]=Number(value);persist()}
function eligibility(){app.innerHTML='<section class="panel"><h2>Eligibility and consent</h2><p>This study publishes only de-identified aggregate ratings. Response producers and target identities remain hidden.</p><div class="checks">'+[['adult','I am an adult.'],['fluentEnglish','I am a fluent English reader.'],['fictionExperience','I write or substantively edit fiction.'],['didNotAuthorOutput','I did not author either compared output.'],['consentToDeidentifiedPublication','I consent to publication of de-identified ratings.']].map(([k,l])=>'<label><input type="checkbox" data-k="'+k+'" '+(state.eligibility[k]?'checked':'')+'> '+l+'</label>').join('')+'</div><p id="elig-error" class="error"></p><button id="start" class="primary">Begin review</button></section>';document.querySelectorAll('[data-k]').forEach(el=>el.onchange=()=>{state.eligibility[el.dataset.k]=el.checked;persist()});document.getElementById('start').onclick=()=>{if(Object.values(state.eligibility).filter(Boolean).length!==5){document.getElementById('elig-error').textContent='All eligibility and consent statements are required.';return}review()}}
function output(label,value){return '<section class="panel"><h3>'+label+'</h3><div class="response">'+esc(value.answer)+'</div>'+value.proposedChanges.map(e=>'<h4>Proposed change: '+esc(e.target)+'</h4><div class="response">'+esc(e.text)+'</div>').join('')+'</section>'}
function current(){return state.ratings[packet.pairs[index].pairId]||{dimensions:{},preference:'',defectFlags:{left:[],right:[]},rationale:''}}
function review(){const p=packet.pairs[index],r=current();app.innerHTML='<div class="nav"><span>Pair '+(index+1)+' of '+packet.pairs.length+'</span><button id="export-top" class="secondary">Export ratings</button></div><section class="panel"><h2>Author request</h2><div class="response">'+esc(p.authorRequest)+'</div><h3>Necessary source passages</h3>'+p.sourcePassages.map(x=>'<div class="source"><strong>'+esc(x.ref)+'</strong>\\n'+esc(x.text)+'</div>').join('')+'</section><div class="grid">'+output('Response A',p.left)+output('Response B',p.right)+'</div><section class="panel"><h2>Independent scores</h2><p class="muted">1 = harmful/unusable; 3 = acceptable; 5 = exceptional.</p><table class="ratings"><tr><th>Dimension</th><th>Response A</th><th>Response B</th></tr>'+dimensions.map(([k,l])=>'<tr><td>'+l+'</td><td>'+select(k,'left',r.dimensions[k]?.left)+'</td><td>'+select(k,'right',r.dimensions[k]?.right)+'</td></tr>').join('')+'</table><h3>Forced preference</h3>'+['left','tie','right'].map((v,i)=>'<label><input type="radio" name="preference" value="'+v+'" '+(r.preference===v?'checked':'')+'> '+['Response A','Tie','Response B'][i]+'</label>').join(' ')+'<h3>Optional defect flags</h3><div class="grid"><div><strong>Response A</strong><div class="flags">'+flags('left',r)+'</div></div><div><strong>Response B</strong><div class="flags">'+flags('right',r)+'</div></div></div><h3>Optional concise rationale</h3><textarea id="rationale">'+esc(r.rationale||'')+'</textarea><p id="pair-error" class="error"></p></section><div class="nav"><button id="previous" class="secondary" '+(index===0?'disabled':'')+'>Previous</button><span id="done" class="complete">'+Object.keys(state.ratings).length+' saved</span><button id="next" class="primary">'+(index===packet.pairs.length-1?'Save final pair':'Save and next')+'</button></div>';document.querySelectorAll('select[data-d]').forEach(el=>el.onchange=()=>score(el.dataset.d,el.dataset.side,el.value));document.querySelectorAll('input[name=preference]').forEach(el=>el.onchange=()=>{const q=current();q.preference=el.value;state.ratings[p.pairId]=q;persist()});document.querySelectorAll('[data-flag]').forEach(el=>el.onchange=()=>{const q=current();q.defectFlags??={left:[],right:[]};q.defectFlags[el.dataset.flagSide]=[...document.querySelectorAll('[data-flag-side="'+el.dataset.flagSide+'"]:checked')].map(x=>x.dataset.flag);state.ratings[p.pairId]=q;persist()});document.getElementById('rationale').oninput=e=>{const q=current();q.rationale=e.target.value;state.ratings[p.pairId]=q;persist()};document.getElementById('previous').onclick=()=>{save(false);index--;review()};document.getElementById('next').onclick=()=>{if(!save(true))return;if(index<packet.pairs.length-1){index++;review()}else exportRatings()};document.getElementById('export-top').onclick=exportRatings}
function flags(side,r){return ['continuity','voice','pacing','factual','constraint','unsupported-invention','authority-overreach','awkward-prose'].map(f=>'<label><input type="checkbox" data-flag="'+f+'" data-flag-side="'+side+'" '+((r.defectFlags?.[side]||[]).includes(f)?'checked':'')+'> '+f+'</label>').join('')}
function select(d,side,value){return '<select data-d="'+d+'" data-side="'+side+'"><option value="">—</option>'+[1,2,3,4,5].map(n=>'<option '+(value===n?'selected':'')+'>'+n+'</option>').join('')+'</select>'}
function save(requireComplete){const p=packet.pairs[index],r=current();if(requireComplete&&(dimensions.some(([k])=>!r.dimensions[k]?.left||!r.dimensions[k]?.right)||!r.preference)){document.getElementById('pair-error').textContent='Score both responses on every dimension and choose a preference.';return false}state.ratings[p.pairId]=r;persist();return true}
function validRating(r){return r&&r.preference&&dimensions.every(([k])=>[1,2,3,4,5].includes(r.dimensions[k]?.left)&&[1,2,3,4,5].includes(r.dimensions[k]?.right))}function exportRatings(){const ratings=packet.pairs.map(p=>state.ratings[p.pairId]&&({pairId:p.pairId,...state.ratings[p.pairId]})).filter(Boolean);if(ratings.length!==packet.pairs.length||ratings.some(r=>!validRating(r))){alert('Complete all '+packet.pairs.length+' pairs before exporting.');return}const submission={formatVersion:1,study:packet.study,reviewerCode:packet.reviewerCode,eligibility:state.eligibility,ratings};const blob=new Blob([JSON.stringify(submission,null,2)+'\\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ratings-'+packet.reviewerCode+'.json';a.click();URL.revokeObjectURL(a.href)}
eligibility();
</script></body></html>`
}

export function parseReviewSubmission(value: unknown): ReviewSubmission {
  const input = object(value, "review submission")
  if (input.formatVersion !== 1) throw new Error("review submission formatVersion must be 1")
  const eligibility = object(input.eligibility, "review submission.eligibility")
  const parsedEligibility: ReviewerEligibility = {
    adult: boolean(eligibility.adult, "review submission.eligibility.adult"),
    fluentEnglish: boolean(eligibility.fluentEnglish, "review submission.eligibility.fluentEnglish"),
    fictionExperience: boolean(eligibility.fictionExperience, "review submission.eligibility.fictionExperience"),
    didNotAuthorOutput: boolean(eligibility.didNotAuthorOutput, "review submission.eligibility.didNotAuthorOutput"),
    consentToDeidentifiedPublication: boolean(
      eligibility.consentToDeidentifiedPublication,
      "review submission.eligibility.consentToDeidentifiedPublication",
    ),
  }
  return {
    formatVersion: 1,
    study: string(input.study, "review submission.study"),
    reviewerCode: string(input.reviewerCode, "review submission.reviewerCode"),
    eligibility: parsedEligibility,
    ratings: array(input.ratings, "review submission.ratings").map(parsePairRating),
  }
}

export function analyzeHumanReview(
  manifest: HumanReviewManifest,
  submissions: ReviewSubmission[],
  bootstrapIterations = 10_000,
) {
  if (!Number.isInteger(bootstrapIterations) || bootstrapIterations < 100) throw new Error("bootstrapIterations must be at least 100")
  requireUnique(submissions.map((item) => item.reviewerCode), "reviewer code")
  const comparisons = new Map(manifest.comparisons.map((pair) => [pair.pairId, pair]))
  const tasks = new Map(manifest.tasks.map((task) => [task.id, task]))
  const ratings = new Map<string, { reviewerCode: string; rating: PairRating }[]>()
  const exclusions = submissions.flatMap((submission) => {
    const reasons = Object.entries(submission.eligibility).filter(([, value]) => !value).map(([key]) => key)
    return reasons.length ? [{ reviewerCode: submission.reviewerCode, reasons }] : []
  })
  const excludedCodes = new Set(exclusions.map((item) => item.reviewerCode))
  const eligibleSubmissions = submissions.filter((submission) => !excludedCodes.has(submission.reviewerCode))
  for (const submission of eligibleSubmissions) {
    if (submission.study !== manifest.study) throw new Error(`review submission study mismatch: ${submission.reviewerCode}`)
    requireUnique(submission.ratings.map((rating) => rating.pairId), `pair rating for ${submission.reviewerCode}`)
    for (const rating of submission.ratings) {
      if (!comparisons.has(rating.pairId)) throw new Error(`review submission contains unknown pair: ${rating.pairId}`)
      validateRating(rating)
      ratings.set(rating.pairId, [...(ratings.get(rating.pairId) ?? []), { reviewerCode: submission.reviewerCode, rating }])
    }
  }
  const pairCoverage = manifest.comparisons.map((pair) => ({
    pairId: pair.pairId,
    taskId: pair.taskId,
    baselineTargetId: pair.baselineTargetId,
    ratings: ratings.get(pair.pairId)?.length ?? 0,
    missing: Math.max(0, manifest.eligibility.minimumReviewersPerPair - (ratings.get(pair.pairId)?.length ?? 0)),
  }))
  const totalRatings = pairCoverage.reduce((sum, pair) => sum + pair.ratings, 0)
  const complete = pairCoverage.every((pair) => pair.missing === 0) && totalRatings >= manifest.eligibility.minimumPairRatings
  const baselines = [...new Set(manifest.comparisons.map((pair) => pair.baselineTargetId))]
  const comparisonsByBaseline = Object.fromEntries(baselines.map((baseline) => {
    const pairs = manifest.comparisons.filter((pair) => pair.baselineTargetId === baseline)
    const observations = pairs.flatMap((pair) => (ratings.get(pair.pairId) ?? []).map(({ rating }) => {
      const candidateSide = pair.leftTargetId === baseline ? "right" : "left"
      const baselineSide = candidateSide === "left" ? "right" : "left"
      return {
        pairId: pair.pairId,
        taskId: pair.taskId,
        job: tasks.get(pair.taskId)?.job,
        candidateSide,
        preference: preferencePoint(rating.preference, candidateSide),
        candidateWon: rating.preference === candidateSide,
        tied: rating.preference === "tie",
        baselineWon: rating.preference === baselineSide,
        dimensions: Object.fromEntries(reviewDimensions.map((dimension) => [dimension, {
          candidate: rating.dimensions[dimension][candidateSide],
          baseline: rating.dimensions[dimension][baselineSide],
        }])) as Record<ReviewDimension, { candidate: number; baseline: number }>,
        defectFlags: {
          candidate: rating.defectFlags?.[candidateSide] ?? [],
          baseline: rating.defectFlags?.[baselineSide] ?? [],
        },
      }
    }))
    const interval = clusteredPreferenceInterval(observations, manifest.randomization.seed + baseline, bootstrapIterations)
    const preference = {
      mean: mean(observations.map((item) => item.preference)),
      lower95: interval[0],
      upper95: interval[1],
      candidateWins: observations.filter((item) => item.candidateWon).length,
      ties: observations.filter((item) => item.tied).length,
      baselineWins: observations.filter((item) => item.baselineWon).length,
      status: complete ? preferenceStatus(interval) : "incomplete-sample-no-claim",
    }
    const dimensions = Object.fromEntries(reviewDimensions.map((dimension) => {
      const candidate = observations.map((item) => item.dimensions[dimension].candidate)
      const baselineValues = observations.map((item) => item.dimensions[dimension].baseline)
      return [dimension, {
        candidateMean: mean(candidate),
        baselineMean: mean(baselineValues),
        meanDelta: mean(candidate) - mean(baselineValues),
        candidateDistribution: distribution(candidate),
        baselineDistribution: distribution(baselineValues),
      }]
    }))
    const byJob = Object.fromEntries(["plan", "revise"].map((job) => {
      const values = observations.filter((item) => item.job === job).map((item) => item.preference)
      return [job, { ratings: values.length, meanPreference: mean(values) }]
    }))
    return [baseline, {
      pairCount: pairs.length,
      ratingCount: observations.length,
      preference,
      dimensions,
      defectFlags: {
        candidate: flagCounts(observations.flatMap((item) => item.defectFlags.candidate)),
        baseline: flagCounts(observations.flatMap((item) => item.defectFlags.baseline)),
      },
      forcedPreferenceAgreement: fleissKappa(pairs.map((pair) => {
        const candidateSide = pair.leftTargetId === baseline ? "right" : "left"
        return (ratings.get(pair.pairId) ?? []).map(({ rating }) => preferenceCategory(rating.preference, candidateSide))
      })),
      byJob,
    }]
  }))
  return {
    formatVersion: 1 as const,
    study: manifest.study,
    quantitativeOnly: true,
    submittedReviewerCount: submissions.length,
    reviewerCount: eligibleSubmissions.length,
    excludedReviewers: exclusions,
    totalRatings,
    requiredRatings: manifest.eligibility.minimumPairRatings,
    complete,
    pairCoverage,
    ratingsSha256: createHash("sha256").update(JSON.stringify(
      submissions.map((submission) => ({ ...submission, ratings: submission.ratings.map(({ rationale: _rationale, ...rating }) => rating) }))
        .sort((a, b) => a.reviewerCode.localeCompare(b.reviewerCode)),
    )).digest("hex"),
    comparisons: comparisonsByBaseline,
    limitations: [
      "Optional rationales are excluded until this quantitative aggregate is frozen.",
      "Preference claims remain conditional on the preregistered automated safety gates.",
      "Results do not generalize beyond the frozen corpus, model, protocol, and eligible reviewer sample.",
    ],
  }
}

export function renderHumanReviewAnalysis(analysis: HumanReviewAnalysis) {
  const lines = [
    `# Blinded human-review quantitative result`,
    "",
    `Study: \`${analysis.study}\``,
    "",
    `Complete: **${analysis.complete ? "yes" : "no"}** (${analysis.totalRatings}/${analysis.requiredRatings} required ratings; ${analysis.reviewerCount} reviewers).`,
    "",
    "Optional rationales are excluded from this aggregate. Creative-quality claims remain conditional on the automated safety gates.",
  ]
  for (const [baseline, result] of Object.entries(analysis.comparisons)) {
    lines.push(
      "",
      `## Production Writer vs ${baseline}`,
      "",
      `Preference: ${(result.preference.mean * 100).toFixed(1)}% (task-clustered 95% CI ${(result.preference.lower95 * 100).toFixed(1)}% to ${(result.preference.upper95 * 100).toFixed(1)}%).`,
      "",
      `Wins/ties/losses: ${result.preference.candidateWins}/${result.preference.ties}/${result.preference.baselineWins}. Agreement (Fleiss' kappa): ${format(result.forcedPreferenceAgreement)}.`,
      "",
      `Preregistered interpretation: **${result.preference.status}**.`,
      "",
      "| Dimension | Writer mean | Baseline mean | Delta |",
      "|---|---:|---:|---:|",
    )
    for (const dimension of reviewDimensions) {
      const value = result.dimensions[dimension]
      lines.push(`| ${dimension} | ${format(value.candidateMean)} | ${format(value.baselineMean)} | ${format(value.meanDelta)} |`)
    }
  }
  return lines.join("\n") + "\n"
}

function parsePairRating(value: unknown, index: number): PairRating {
  const input = object(value, `review submission.ratings[${index}]`)
  const dimensions = object(input.dimensions, `review submission.ratings[${index}].dimensions`)
  const defectFlags = optionalDefectFlags(input.defectFlags)
  const rationale = optionalString(input.rationale)
  return {
    pairId: string(input.pairId, `review submission.ratings[${index}].pairId`),
    dimensions: Object.fromEntries(reviewDimensions.map((dimension) => {
      const scores = object(dimensions[dimension], `review submission.ratings[${index}].dimensions.${dimension}`)
      return [dimension, {
        left: score(scores.left, `review submission.ratings[${index}].dimensions.${dimension}.left`),
        right: score(scores.right, `review submission.ratings[${index}].dimensions.${dimension}.right`),
      }]
    })) as PairRating["dimensions"],
    preference: preference(input.preference, `review submission.ratings[${index}].preference`),
    ...(defectFlags ? { defectFlags } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
  }
}

function requiredRecord(records: Map<string, RunRecord>, target: string, task: string, trial: number) {
  const record = records.get(recordKey(target, task, trial))
  if (!record) throw new Error(`human-review output is missing: ${target}/${task}/trial-${trial}`)
  if (record.error) throw new Error(`human-review output failed: ${target}/${task}/trial-${trial}`)
  if (!record.response) throw new Error(`human-review output has no response: ${target}/${task}/trial-${trial}`)
  return record
}

function recordKey(target: string, task: string, trial: number) {
  return `${target}\u0000${task}\u0000${trial}`
}

function assertComparableTasks(left: Task, right: Task, pairId: string) {
  if (left.id !== right.id || left.job !== right.job || left.prompt !== right.prompt || JSON.stringify(left.context) !== JSON.stringify(right.context)) {
    throw new Error(`human-review pair does not contain identical task material: ${pairId}`)
  }
}

function necessaryPassages(task: Task) {
  const refs = unique([
    ...(task.contextSpec?.focusRefs ?? []),
    ...(task.contextSpec?.dependencyRefs ?? []),
    ...(task.contextSpec?.preservationRefs ?? []),
  ])
  const context = (task.context ?? []).filter((item) => (item.kind ?? "manuscript") === "manuscript")
  const requested = new Set(refs.length ? refs : context.map((item) => item.ref))
  const found = new Set(context.filter((item) => requested.has(item.ref)).map((item) => item.ref))
  for (const ref of requested) {
    if (!found.has(ref)) throw new Error(`human-review source passage is missing from materialized task ${task.id}: ${ref}`)
  }
  return context.filter((item) => requested.has(item.ref)).map((item) => ({ ref: item.ref, text: item.text }))
}

function blindedOutput(response: ExecutionResponse, job: Job, redactions: string[]): BlindedOutput {
  const edits = response.artifacts?.proposal?.edits ?? response.artifacts?.edits ?? []
  return {
    answer: normalizeText(response.text, redactions),
    proposedChanges: job === "revise"
      ? edits.filter((edit) => typeof edit.replacement === "string").map((edit) => ({
        target: edit.target,
        text: normalizeText(edit.replacement!, redactions),
      }))
      : [],
  }
}

function normalizeText(value: string, redactions: string[]) {
  let output = value.replaceAll("\r\n", "\n").trim()
  for (const redaction of [...redactions].sort((a, b) => b.length - a.length)) {
    output = output.replace(new RegExp(escapeRegExp(redaction), "gi"), "[system]")
  }
  return output
}

function reviewOrder(seed: Buffer, reviewerCode: string, pairId: string) {
  return createHmac("sha256", seed).update(`${reviewerCode}\u0000${pairId}`).digest("hex")
}

function validateRating(rating: PairRating) {
  for (const dimension of reviewDimensions) {
    score(rating.dimensions[dimension].left, `${rating.pairId}.${dimension}.left`)
    score(rating.dimensions[dimension].right, `${rating.pairId}.${dimension}.right`)
  }
  preference(rating.preference, `${rating.pairId}.preference`)
}

function preferencePoint(value: ReviewPreference, candidateSide: "left" | "right") {
  return value === "tie" ? 0.5 : value === candidateSide ? 1 : 0
}

function preferenceCategory(value: ReviewPreference, candidateSide: "left" | "right") {
  return value === "tie" ? "tie" : value === candidateSide ? "candidate" : "baseline"
}

function clusteredPreferenceInterval(
  values: { taskId: string; preference: number }[],
  seed: string,
  iterations: number,
): [number, number] {
  if (!values.length) return [Number.NaN, Number.NaN]
  const clusters = new Map<string, number[]>()
  for (const value of values) clusters.set(value.taskId, [...(clusters.get(value.taskId) ?? []), value.preference])
  const taskIds = [...clusters.keys()]
  const random = mulberry32(Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16))
  const boot = Array.from({ length: iterations }, () => {
    const sample = Array.from({ length: taskIds.length }, () => clusters.get(taskIds[Math.floor(random() * taskIds.length)]!)!).flat()
    return mean(sample)
  }).sort((a, b) => a - b)
  return [quantile(boot, 0.025), quantile(boot, 0.975)]
}

function preferenceStatus(interval: [number, number]) {
  if (interval[0] > 0.5) return "preferred-if-automated-safety-passes"
  if (interval[0] >= 0.4 && interval[0] <= 0.5 && interval[1] >= 0.5) return "no-detected-material-preference-penalty"
  return "observed-regression-or-inconclusive-below-noninferiority-threshold"
}

function fleissKappa(items: string[][]) {
  const eligible = items.filter((item) => item.length >= 2)
  if (!eligible.length) return Number.NaN
  const categories = ["candidate", "tie", "baseline"]
  const totals = Object.fromEntries(categories.map((category) => [category, 0])) as Record<string, number>
  let ratings = 0
  const agreements = eligible.map((item) => {
    const counts = Object.fromEntries(categories.map((category) => [category, item.filter((value) => value === category).length]))
    for (const category of categories) totals[category] += counts[category]!
    ratings += item.length
    return categories.reduce((sum, category) => sum + counts[category]! * (counts[category]! - 1), 0) / (item.length * (item.length - 1))
  })
  const observed = mean(agreements)
  const expected = categories.reduce((sum, category) => sum + (totals[category] / ratings) ** 2, 0)
  return expected === 1 ? (observed === 1 ? 1 : Number.NaN) : (observed - expected) / (1 - expected)
}

function distribution(values: number[]) {
  return Object.fromEntries([1, 2, 3, 4, 5].map((value) => [value, values.filter((item) => item === value).length]))
}

function flagCounts(values: string[]) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]))
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN
}

function quantile(values: number[], probability: number) {
  if (!values.length) return Number.NaN
  const index = (values.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return values[lower]!
  return values[lower]! + (values[upper]! - values[lower]!) * (index - lower)
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function format(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a"
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function string(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function optionalString(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error("optional value must be a string")
  return value
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`)
  return value
}

function integer(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a nonnegative integer`)
  return value as number
}

function positiveInteger(value: unknown, label: string) {
  const parsed = integer(value, label)
  if (parsed < 1) throw new Error(`${label} must be positive`)
  return parsed
}

function score(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) throw new Error(`${label} must be an integer from 1 to 5`)
  return value as number
}

function preference(value: unknown, label: string) {
  if (value !== "left" && value !== "tie" && value !== "right") throw new Error(`${label} must be left, tie, or right`)
  return value
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array`)
  return value as string[]
}

function optionalStringArray(value: unknown) {
  return value === undefined ? undefined : stringArray(value, "optional value")
}

function optionalDefectFlags(value: unknown) {
  if (value === undefined) return undefined
  const input = object(value, "review submission defectFlags")
  return {
    left: input.left === undefined ? [] : stringArray(input.left, "review submission defectFlags.left"),
    right: input.right === undefined ? [] : stringArray(input.right, "review submission defectFlags.right"),
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function requireUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} IDs must be unique`)
}
