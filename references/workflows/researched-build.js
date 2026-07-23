export const meta = {
  name: 'researched-build',
  description:
    'Research-backed, test-first, adversarially-reviewed build pipeline for Pitch/RFD-tier changes. Researcher → Tester → Implementer → Reviewer (fix loop) → Verifier (fix loop, UI only).',
  phases: [
    { title: 'Research', detail: 'prior art, cited (2 rounds pitch / 3 rounds rfd)' },
    { title: 'Cross-repo', detail: 'blast-radius map (rfd only)' },
    { title: 'Test', detail: 'failing tests from acceptance criteria' },
    { title: 'Implement', detail: 'make tests pass in an isolated worktree' },
    { title: 'Review', detail: 'adversarial review + fix loop' },
    { title: 'Verify', detail: 'on-device measurement + fix loop (UI only)' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs (via `args`):
//   tier       'pitch' | 'rfd'   — controls research depth + review rigor
//   criteria   string[]          — objective acceptance criteria
//   rendersUI  boolean           — run the device-verify phase?
//   task       string            — what is being built (title + description)
//   context    object            — repo, goals, framework notes
// Returns: { tier, findings, crossRepo, tests, impl, review, verify }
// ---------------------------------------------------------------------------

const input = args || {}
const tier = input.tier === 'rfd' ? 'rfd' : 'pitch'
const criteria = input.criteria || []
const rendersUI = Boolean(input.rendersUI)
const task = input.task || ''
const context = input.context || {}
const MAX_REVIEW_ROUNDS = 2
const MAX_VERIFY_ROUNDS = 3

// --- Schemas ------------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          url: { type: 'string' },
          tier: { type: 'string' },
          relevance: { type: 'string' },
        },
        required: ['claim', 'evidence', 'url', 'tier', 'relevance'],
      },
    },
    againstSignals: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}

const BLAST_RADIUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    touchpoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string' },
          file: { type: 'string' },
          contract: { type: 'string' },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          note: { type: 'string' },
        },
        required: ['repo', 'file', 'contract', 'risk', 'note'],
      },
    },
    breakingChanges: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['touchpoints', 'summary'],
}

const TESTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testFiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' }, contents: { type: 'string' } },
        required: ['path', 'contents'],
      },
    },
    newTestIds: { type: 'array', items: { type: 'string' } },
    failingConfirmed: { type: 'boolean' },
    criteriaCovered: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { criterion: { type: 'string' }, testName: { type: 'string' } },
        required: ['criterion', 'testName'],
      },
    },
    openConcerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['testFiles', 'failingConfirmed'],
}

const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filesChanged: { type: 'array', items: { type: 'string' } },
    diff: { type: 'string' },
    branchRef: { type: 'string' },
    testsPass: { type: 'boolean' },
    commitSha: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['filesChanged', 'diff', 'testsPass'],
}

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
  properties: { refuted: { type: 'boolean' }, reasoning: { type: 'string' } },
  required: ['refuted', 'reasoning'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    screenshotTaken: { type: 'boolean' },
    updateConfirmed: { type: 'boolean' },
    measurements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          criterion: { type: 'string' },
          measured: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail'] },
        },
        required: ['criterion', 'measured', 'verdict'],
      },
    },
    failedCriteria: { type: 'array', items: { type: 'string' } },
    structuralLimit: { type: 'string' },
  },
  required: ['measurements', 'failedCriteria'],
}

// --- Prompt builders (mirrored from references/agents/*.md) --------------------
const criteriaBlock = criteria.length
  ? `Acceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}`
  : 'No explicit criteria supplied — infer them from the task.'

function researcherPrompt() {
  const rounds =
    tier === 'rfd'
      ? '3 rounds: (1) problem-space — how top orgs solve this class; (2) solution-space — tools, trade-offs, pitfalls; (3) validation — scale concerns, migrations, "moving away from X", "regret X".'
      : '2 rounds: (1) problem-space — how top orgs solve this class; (2) solution-space — tools, trade-offs, pitfalls.'
  return [
    'You are a READ-ONLY researcher gathering prior art. Tools: Read, Glob, Grep, WebSearch, WebFetch. You cannot edit code.',
    `Task: ${task}`,
    `Run ${rounds}`,
    'Label every finding by source tier (authoritative > practitioner > community > marketing) and include a URL — unsourced is a hypothesis, not prior art. Surface evidence AGAINST the likely approach too. "No prior art found" is valid; never fabricate a citation. If WebSearch is unavailable, return one finding noting that and stop.',
  ].join('\n\n')
}

function crossRepoPrompt(findings) {
  return [
    'You are mapping CROSS-REPO blast radius for an architecture change (RFD tier). Tools: Read, Glob, Grep only.',
    `Task: ${task}`,
    'Map which shared contracts, data models, endpoints, and consumers this touches across the Tessellate repos (alate ↔ loom ↔ shared). Read DATA_CONTRACT.md, shared/ types, and composed-endpoint definitions. Flag anything an existing consumer reads as a breaking change. Never shadow Shopify-owned fields.',
    `Research context:\n${JSON.stringify(findings?.summary || '', null, 2)}`,
  ].join('\n\n')
}

function testerPrompt(findings) {
  return [
    'You are the TESTER. Write FAILING tests from the acceptance criteria BEFORE any implementation exists. You write tests ONLY — never implementation. You do not see implementation code.',
    `Task: ${task}`,
    criteriaBlock,
    'Read the repo test conventions first and match them (alate: Jest + React Native Testing Library, src/__tests__/*, screenSmoke.test.tsx). Assert observable behaviour via testID selectors — reuse existing testIDs; report any new one you introduce (it becomes the litmus contract). Run the tests and confirm they FAIL for the right reason (feature absent). Return full file contents so the implementer can materialize them in its own worktree.',
    findings?.summary ? `Prior art (edge cases worth testing):\n${findings.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function implementerPrompt(findings, tests, crossRepo) {
  return [
    'You are the IMPLEMENTER, running in an isolated worktree. Materialize the tester\'s failing tests FIRST, run them, confirm they fail, then make them pass with the smallest correct change. Commit the code in your worktree (code and docs separate, with the repo Co-Authored-By trailer).',
    `Task: ${task}`,
    criteriaBlock,
    `Failing tests to satisfy (materialize these):\n${JSON.stringify(tests?.testFiles || [], null, 2)}`,
    findings?.summary ? `Prior art informing the approach:\n${findings.summary}` : '',
    crossRepo ? `Cross-repo constraints (do not break these):\n${JSON.stringify(crossRepo, null, 2)}` : '',
    'Theme tokens not literals; proportional flex; reuse-first. Run `npx tsc --noEmit && npx jest --no-coverage` green (new tests AND the full suite) before committing. Do not weaken the tester\'s tests to get green. Return the diff and branch ref.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function fixPrompt(findings, priorImpl, kind) {
  const label = kind === 'verify' ? 'device-verification failures' : 'review findings'
  return [
    `You are the IMPLEMENTER in a fix round, in your worktree. Address these ${label} with the smallest correct change, keep the suite green, and re-commit.`,
    `Prior change notes: ${priorImpl?.notes || '(none)'}`,
    `${label} to address:\n${JSON.stringify(findings, null, 2)}`,
    'Return the updated diff and branch ref. Do not introduce new issues; do not weaken tests.',
  ].join('\n\n')
}

function reviewerPrompt(lens, diff, crossRepo) {
  const lensBrief = {
    'correctness+standards':
      'Review for BOTH correctness (logic bugs, edge cases, null/empty, races, swallowed errors) AND standards (hardcoded colours/fonts/alphas, hooks below a conditional return, WCAG 2.1 AA, OWASP — any OWASP violation is a finding, testID contract drift = hard block).',
    correctness:
      'CORRECTNESS lens only: logic bugs, unhandled edge cases, off-by-one, null/empty states, races, error paths that swallow failures.',
    standards:
      'STANDARDS lens only: hardcoded colours/fonts/alphas, hooks below a conditional return, WCAG 2.1 AA, OWASP (any violation is a finding), testID contract drift (renamed/removed testID = hard block).',
    'cross-repo':
      'CROSS-REPO lens only: does the diff break any contract in the blast-radius report — shared types, composed endpoints, data-ownership (never shadow Shopify-owned fields)?',
  }[lens]
  return [
    'You are a REVIEWER with fresh eyes on a diff you did NOT write. You cannot edit — only report. Report most-severe first; each finding needs file:line and the concrete failure it causes. Empty findings + verdict "approve" is valid — do not invent nits.',
    lensBrief,
    criteriaBlock,
    crossRepo ? `Blast-radius report:\n${JSON.stringify(crossRepo, null, 2)}` : '',
    `DIFF:\n${diff}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function skepticPrompt(finding, index, diff) {
  const framings = [
    'Assume the reviewer was WRONG — find the strongest reason this is a false positive.',
    'Check whether the code already handles this case elsewhere, making the finding moot.',
  ]
  return [
    'You are a SKEPTIC verifying one review finding. REFUTE it if you honestly can. Default to refuted=true if uncertain.',
    framings[index % framings.length],
    `Finding: ${finding.summary} (${finding.file}:${finding.line}, ${finding.category}) — claimed failure: ${finding.failureScenario}`,
    `Diff:\n${diff}`,
  ].join('\n\n')
}

function verifierPrompt(failed) {
  return [
    'You are the VERIFIER. Publish the OTA to the device channel (alate: preview), apply via double-relaunch, screenshot with adb, confirm the running bundle is yours via logcat, then MEASURE each criterion as a % position — numbers, not "looks fine". Tools: Read, Bash, Browser. You cannot edit code.',
    criteriaBlock,
    failed && failed.length ? `Re-verify — prior failures to re-measure:\n${failed.map((c) => `- ${c}`).join('\n')}` : '',
    'If a criterion is unsatisfiable by tweaking (e.g. "fill screen" with two small elements), set structuralLimit instead of looping.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// --- Review phase (tier-branched, self-contained) -----------------------------
async function runReview(diff, crossRepo) {
  if (tier !== 'rfd') {
    const r = await agent(reviewerPrompt('correctness+standards', diff, crossRepo), {
      label: 'review',
      phase: 'Review',
      schema: REVIEW_SCHEMA,
    })
    return r || { findings: [], testIdDrift: false, verdict: 'approve' }
  }

  // RFD: parallel multi-lens panel + skeptic verification.
  const lenses = ['correctness', 'standards', 'cross-repo']
  const revs = (
    await parallel(
      lenses.map((lens) => () =>
        agent(reviewerPrompt(lens, diff, crossRepo), {
          label: `review:${lens}`,
          phase: 'Review',
          schema: REVIEW_SCHEMA,
        })
      )
    )
  ).filter(Boolean)

  const drift = revs.some((r) => r.testIdDrift)
  const all = revs.flatMap((r) => r.findings || [])
  const seen = new Set()
  const deduped = []
  for (const f of all) {
    const key = `${f.file}:${f.line}:${f.category}`
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(f)
    }
  }

  const judged = await parallel(
    deduped.map((f) => () =>
      parallel(
        [0, 1].map((i) => () =>
          agent(skepticPrompt(f, i, diff), { label: `skeptic:${f.file}`, phase: 'Review', schema: VERDICT_SCHEMA })
        )
      ).then((votes) => {
        const valid = votes.filter(Boolean)
        const notRefuted = valid.filter((v) => !v.refuted).length
        return { finding: f, survives: valid.length > 0 && notRefuted > valid.length / 2 }
      })
    )
  )

  const findings = judged
    .filter(Boolean)
    .filter((j) => j.survives)
    .map((j) => j.finding)
  return { findings, testIdDrift: drift, verdict: findings.length ? 'changes-requested' : 'approve' }
}

// === Pipeline =================================================================
log(`researched-build starting — tier=${tier}, rendersUI=${rendersUI}`)

// Phase 1 — Research
phase('Research')
const findings = (await agent(researcherPrompt(), { label: 'research', phase: 'Research', schema: FINDINGS_SCHEMA })) || {
  findings: [],
  summary: 'Research produced no result.',
}

// Phase 1b — Cross-repo (rfd only)
let crossRepo = null
if (tier === 'rfd') {
  phase('Cross-repo')
  crossRepo = await agent(crossRepoPrompt(findings), {
    label: 'cross-repo',
    phase: 'Cross-repo',
    schema: BLAST_RADIUS_SCHEMA,
  })
}

// Phase 2 — Test (failing tests first)
phase('Test')
const tests = (await agent(testerPrompt(findings), {
  label: 'test',
  phase: 'Test',
  schema: TESTS_SCHEMA,
  isolation: 'worktree',
})) || { testFiles: [], failingConfirmed: false }

// Phase 3 — Implement
phase('Implement')
let impl = (await agent(implementerPrompt(findings, tests, crossRepo), {
  label: 'implement',
  phase: 'Implement',
  schema: IMPL_SCHEMA,
  isolation: 'worktree',
})) || { filesChanged: [], diff: '', testsPass: false, notes: 'Implementation produced no result.' }

// Phase 4 — Review (+ fix loop)
phase('Review')
let review = await runReview(impl.diff, crossRepo)
let reviewRound = 0
while (review.findings.length > 0 && reviewRound < MAX_REVIEW_ROUNDS) {
  reviewRound += 1
  log(`Review round ${reviewRound}: ${review.findings.length} findings → implementer fix`)
  const fixed = await agent(fixPrompt(review.findings, impl, 'review'), {
    label: `fix:review:r${reviewRound}`,
    phase: 'Review',
    schema: IMPL_SCHEMA,
    isolation: 'worktree',
  })
  if (fixed) {
    impl = fixed
  }
  review = await runReview(impl.diff, crossRepo)
}

// Phase 5 — Verify (UI only, + fix loop)
let verify = null
if (rendersUI) {
  phase('Verify')
  verify = await agent(verifierPrompt([]), { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA })
  let verifyRound = 0
  while (
    verify &&
    (verify.failedCriteria || []).length > 0 &&
    !verify.structuralLimit &&
    verifyRound < MAX_VERIFY_ROUNDS
  ) {
    verifyRound += 1
    log(`Verify round ${verifyRound}: ${verify.failedCriteria.length} failed criteria → implementer fix`)
    const fixed = await agent(fixPrompt(verify.failedCriteria, impl, 'verify'), {
      label: `fix:verify:r${verifyRound}`,
      phase: 'Verify',
      schema: IMPL_SCHEMA,
      isolation: 'worktree',
    })
    if (fixed) {
      impl = fixed
    }
    verify = await agent(verifierPrompt(verify.failedCriteria), {
      label: `verify:r${verifyRound}`,
      phase: 'Verify',
      schema: VERIFY_SCHEMA,
    })
  }
}

return { tier, findings, crossRepo, tests, impl, review, verify }
