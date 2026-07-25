export const meta = {
  name: 'adversarial-review',
  description:
    'Multi-lens code review with adversarial verification — parallel reviewers find issues, independent skeptics try to refute each, only survivors are reported',
  phases: [
    { title: 'Find', detail: 'parallel reviewers, one per lens' },
    { title: 'Verify', detail: 'independent skeptics try to refute each finding' },
    { title: 'Synthesize', detail: 'report only confirmed findings' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs (via `args`):
//   diff       string   — the diff to review, inline (this or diffPath required)
//   diffPath   string   — absolute path to a file holding the diff; preferred for
//                         large diffs (re-encoding them inline risks corruption)
//   files      string[] — target manifest: the files the diff must change.
//                         Reviewers verify the diff matches before judging.
//   criteria   string[] — acceptance criteria the change must meet (optional)
//   crossRepo  object   — RFD blast-radius report; presence adds a cross-repo lens
//   standards  string   — extra standards context appended to reviewer prompts
// Returns: { confirmed, testIdDrift, counts } — or { ..., error } when no target.
// ---------------------------------------------------------------------------

// Normalize args defensively: a stringified-JSON args (the documented common
// mistake) severed the first live run from its target entirely — reviewers got
// an empty DIFF section and silently improvised by reviewing their cwd.
let input = args || {}
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    input = {}
  }
}
const diff = input.diff || ''
const diffPath = input.diffPath || ''
const files = input.files || []
const criteria = input.criteria || []
const crossRepo = input.crossRepo || null
const standards = input.standards || ''
const SKEPTICS_PER_FINDING = 3

// Fail LOUDLY on a missing target. A silent wrong-target review is far worse
// than an error — it produces confident findings about the wrong code.
if (!diff && !diffPath) {
  return {
    confirmed: [],
    testIdDrift: false,
    counts: { raw: 0, deduped: 0, confirmed: 0 },
    error:
      'No diff or diffPath provided — refusing to review without an explicit target. ' +
      'Pass the diff inline via args.diff, or write it to a file and pass args.diffPath.',
  }
}

const diffBlock = diffPath
  ? `The diff under review is stored at:\n  ${diffPath}\nRead that ENTIRE file. Review ONLY that diff — nothing else in your working directory is under review.`
  : diff

const manifestBlock = files.length
  ? `Target manifest — the diff must change exactly these files:\n${files
      .map((f) => `- ${f}`)
      .join('\n')}\nFIRST verify the diff you read matches this manifest. If it does not (wrong repo, different files, empty diff), STOP and return a single blocker finding with category "target-mismatch" describing what you actually saw instead.`
  : ''

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          category: { type: 'string' },
          summary: { type: 'string' },
          failureScenario: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'category', 'summary', 'failureScenario'],
      },
    },
    testIdDrift: { type: 'boolean' },
    verdict: { type: 'string', enum: ['approve', 'changes-requested'] },
  },
  required: ['findings', 'testIdDrift', 'verdict'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['refuted', 'reasoning'],
}

function reviewerPrompt(lens) {
  const lensBrief = {
    correctness:
      'CORRECTNESS lens: logic bugs, unhandled edge cases, off-by-one, null/empty states, race conditions, error paths that swallow failures.',
    standards:
      'STANDARDS lens: hardcoded colours/fonts/alphas, hooks below a conditional return, WCAG 2.1 AA violations, non-elastic layouts, OWASP issues (any OWASP violation is a finding, not a nit), and testID contract drift (renamed/removed testID litmus depends on = hard block).',
    'cross-repo':
      'CROSS-REPO lens: does the diff break any contract in the blast-radius report — shared types, composed endpoints, data-ownership rules (never shadow Shopify-owned fields)?',
  }[lens]

  return [
    'You are a code REVIEWER with fresh eyes on a diff you did NOT write. You cannot edit — you only report. This adversarial separation is the point.',
    lensBrief,
    manifestBlock,
    criteria.length ? `Acceptance criteria the change must meet:\n${criteria.map((c) => `- ${c}`).join('\n')}` : '',
    crossRepo ? `Cross-repo blast-radius report:\n${JSON.stringify(crossRepo, null, 2)}` : '',
    standards ? `Additional standards context:\n${standards}` : '',
    'Read the FULL diff — not excerpts. Report findings most-severe first. Each finding needs file:line, what is wrong, and the concrete failure it causes. An empty findings list with verdict "approve" is a valid, honest result — do not invent nits.',
    '',
    'DIFF UNDER REVIEW:',
    diffBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function skepticPrompt(finding, index) {
  const framings = [
    'Assume the reviewer was WRONG. Find the strongest reason this finding is a false positive.',
    'Check whether the code already handles this case elsewhere, making the finding moot.',
    'Ask whether this can actually be triggered in practice, or whether it is theoretical.',
  ]
  return [
    'You are an independent SKEPTIC verifying one code-review finding. Your job is to REFUTE it if you honestly can.',
    framings[index % framings.length],
    'Default to refuted=true if you are uncertain — only a finding that clearly survives scrutiny should pass.',
    '',
    `Finding: ${finding.summary} (${finding.file}:${finding.line}, ${finding.category}, ${finding.severity})`,
    `Claimed failure: ${finding.failureScenario}`,
    '',
    'Diff under review:',
    diffBlock,
  ].join('\n\n')
}

// --- Phase 1: Find — parallel reviewers, one per lens --------------------------
phase('Find')
const lenses = ['correctness', 'standards']
if (crossRepo) {
  lenses.push('cross-repo')
}

const reviews = await parallel(
  lenses.map((lens) => () =>
    agent(reviewerPrompt(lens), { label: `review:${lens}`, phase: 'Find', schema: REVIEW_SCHEMA })
  )
)

const validReviews = reviews.filter(Boolean)
const testIdDrift = validReviews.some((r) => r.testIdDrift)
const allFindings = validReviews.flatMap((r) => r.findings || [])

// Dedup by file+line+category (same location, same class = one finding).
const seen = new Set()
const deduped = []
for (const f of allFindings) {
  const key = `${f.file}:${f.line}:${f.category}`
  if (!seen.has(key)) {
    seen.add(key)
    deduped.push(f)
  }
}

log(`Find: ${allFindings.length} raw findings across ${lenses.length} lenses → ${deduped.length} after dedup`)

// Early exit: nothing to verify.
if (deduped.length === 0) {
  return {
    confirmed: [],
    testIdDrift,
    counts: { raw: allFindings.length, deduped: 0, confirmed: 0 },
  }
}

// --- Phase 2: Verify — independent skeptics try to refute each finding ---------
phase('Verify')
const judged = await parallel(
  deduped.map((finding) => () =>
    parallel(
      Array.from({ length: SKEPTICS_PER_FINDING }, (_, i) => () =>
        agent(skepticPrompt(finding, i), {
          label: `skeptic:${finding.file}:${finding.line}`,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
        })
      )
    ).then((votes) => {
      const valid = votes.filter(Boolean)
      const notRefuted = valid.filter((v) => !v.refuted).length
      // Survives if a MAJORITY of skeptics could not refute it.
      const survives = valid.length > 0 && notRefuted > valid.length / 2
      return { finding, survives, votes: valid.length, notRefuted }
    })
  )
)

const confirmed = judged
  .filter(Boolean)
  .filter((j) => j.survives)
  .map((j) => j.finding)

log(`Verify: ${deduped.length} findings → ${confirmed.length} survived skeptical majority`)

// --- Phase 3: Synthesize ------------------------------------------------------
phase('Synthesize')
return {
  confirmed,
  testIdDrift,
  counts: { raw: allFindings.length, deduped: deduped.length, confirmed: confirmed.length },
}
