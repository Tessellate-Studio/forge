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
//   tier             'pitch' | 'rfd' — controls research depth + review rigor
//   criteria         string[]        — objective acceptance criteria
//   rendersUI        boolean         — run the device-verify phase?
//   task             string          — what is being built (title + description)
//   context          object          — repo, goals, framework notes
//   reviewScriptPath string          — absolute path to adversarial-review.js;
//                    when set, the RFD review phase runs it as a nested
//                    sub-workflow (single source of review logic). Falls back
//                    to the inline panel when absent or unresolvable.
// Returns: { tier, findings, crossRepo, tests, impl, review, verify }
// ---------------------------------------------------------------------------

// Normalize args defensively (stringified-JSON args severed the first live
// adversarial-review run from its target — same guard here).
let input = args || {}
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    input = {}
  }
}
const tier = input.tier === 'rfd' ? 'rfd' : 'pitch'
const criteria = input.criteria || []
const rendersUI = Boolean(input.rendersUI)
const task = input.task || ''
const context = input.context || {}
const reviewScriptPath = input.reviewScriptPath || ''
const MAX_REVIEW_ROUNDS = 2
const MAX_VERIFY_ROUNDS = 3

if (!task && criteria.length === 0) {
  return {
    tier,
    error:
      'No task or criteria provided — refusing to build without an explicit target. ' +
      'Pass args as a JSON object: { tier, criteria, rendersUI, task, context }.',
  }
}

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
  // branchRef is required: the main loop integrates that branch after the
  // workflow returns, so an implementation without one is unreachable work.
  required: ['filesChanged', 'diff', 'testsPass', 'branchRef'],
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

// The caller's repo/framework context. Forge ships to every consuming repo, so
// nothing here may assume alate's stack — agents that need conventions get them
// from this block, or discover them from the repo when it is absent.
const contextBlock = Object.keys(context).length
  ? `Repo context (authoritative — do NOT assume another repo's stack):\n${JSON.stringify(context, null, 2)}`
  : 'No repo context supplied — discover the repo\'s conventions (test framework, directory layout, theme tokens) by reading the repo before writing anything. Do not assume any particular stack.'

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
    contextBlock,
    'Read the repo\'s existing test conventions FIRST and match them exactly — test runner, file locations, naming, and selector style. Never invent a new harness, and never assume another repo\'s stack. Assert observable behaviour via testID selectors where the repo uses them — reuse existing testIDs; report any new one you introduce (it becomes the litmus contract). Run the tests and confirm they FAIL for the right reason (feature absent). Return full file contents so the implementer can materialize them in its own worktree.',
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
    contextBlock,
    `Failing tests to satisfy (materialize these):\n${JSON.stringify(tests?.testFiles || [], null, 2)}`,
    findings?.summary ? `Prior art informing the approach:\n${findings.summary}` : '',
    crossRepo ? `Cross-repo constraints (do not break these):\n${JSON.stringify(crossRepo, null, 2)}` : '',
    'Theme tokens not literals; proportional flex; reuse-first. Run the repo\'s own typecheck + test commands green (new tests AND the full suite) before committing. Do not weaken the tester\'s tests to get green. Return the diff AND the branch ref — the main loop integrates that branch after this workflow returns, so a missing branchRef strands the work.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function fixPrompt(findings, priorImpl, kind, priorTests) {
  const label = kind === 'verify' ? 'device-verification failures' : 'review findings'
  return [
    `You are the IMPLEMENTER in a fix round. You run in a FRESH worktree that does NOT yet contain the prior implementation — you must recover it before you can fix anything.`,
    priorImpl?.branchRef
      ? `STEP 1 — recover the work: the prior implementation is committed on branch \`${priorImpl.branchRef}\`. Check it out (or cherry-pick it) into your worktree FIRST, and confirm the files below are present before editing anything:\n${JSON.stringify(priorImpl.filesChanged || [], null, 2)}`
      : `STEP 1 — recover the work: no branch ref was returned by the prior round. Reconstruct its state by applying this diff to your worktree before editing:\n${priorImpl?.diff || '(no diff available — STOP and report this in notes rather than fixing against the wrong tree)'}`,
    priorTests?.testFiles?.length
      ? `STEP 2 — ensure the tests are present (re-materialize any that are missing after checkout):\n${JSON.stringify(priorTests.testFiles, null, 2)}`
      : '',
    `Prior change notes: ${priorImpl?.notes || '(none)'}`,
    `STEP 3 — address these ${label} with the smallest correct change:\n${JSON.stringify(findings, null, 2)}`,
    'Then run `npx tsc --noEmit && npx jest --no-coverage` green and re-commit ON THE SAME BRANCH so the accumulated work travels together. Return the updated diff and branch ref. Do not introduce new issues; do not weaken tests. If you could not recover the prior implementation, say so explicitly in notes and do NOT return a diff built against the wrong tree.',
  ]
    .filter(Boolean)
    .join('\n\n')
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
    'You are a SKEPTIC verifying one review finding. You are REVIEW-SIDE: you CANNOT edit, write, or commit anything — read and reason only. Never "fix" the code to make a finding moot; report your verdict instead.',
    'REFUTE the finding if you honestly can. Default to refuted=true if uncertain.',
    framings[index % framings.length],
    `Finding: ${finding.summary} (${finding.file}:${finding.line}, ${finding.category}) — claimed failure: ${finding.failureScenario}`,
    `Diff:\n${diff}`,
  ].join('\n\n')
}

function verifierPrompt(failed, currentImpl) {
  return [
    'You are the VERIFIER. You CANNOT edit code — you publish, measure, and report only.',
    currentImpl?.branchRef
      ? `STEP 1 — get the built code into your checkout FIRST. The implementation lives on branch \`${currentImpl.branchRef}\`, NOT on your current branch; the main loop does not integrate it until after this workflow returns. Check that branch out before building. Then confirm the files below are actually present — if they are not, STOP and return structuralLimit "could not obtain the implementation branch" rather than measuring the wrong bundle:\n${JSON.stringify(currentImpl.filesChanged || [], null, 2)}`
      : 'STEP 1 — no implementation branch ref was returned. STOP: return structuralLimit "no implementation branch to verify" rather than publishing an OTA from an unchanged checkout and measuring the old app.',
    'STEP 2 — publish the OTA to the device channel (alate: preview), apply via double-relaunch, screenshot with adb, and confirm via logcat that the running bundle is the one you just published. Set updateConfirmed accordingly — if you cannot confirm it, report updateConfirmed:false and do NOT present stale measurements as results.',
    'STEP 3 — MEASURE each criterion as a % position. Numbers, not "looks fine".',
    criteriaBlock,
    failed && failed.length ? `Re-verify — prior failures to re-measure:\n${failed.map((c) => `- ${c}`).join('\n')}` : '',
    'If a criterion is unsatisfiable by tweaking (e.g. "fill screen" with two small elements), set structuralLimit instead of looping.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// --- Review phase (tier-branched) ----------------------------------------------
// pitch → single reviewer. rfd → the adversarial-review sub-workflow when its
// scriptPath was provided (single source of review logic); inline panel as the
// fallback so the pipeline still works when the path is absent or unresolvable.
// FAIL CLOSED: a review-side agent that fails is NOT an approval. Every path
// that cannot actually produce a review returns verdict 'error' + reviewFailed,
// so the caller can never mistake infrastructure failure for a clean gate.
function reviewFailure(reason) {
  log(`REVIEW GATE FAILED CLOSED: ${reason}`)
  return { findings: [], testIdDrift: false, verdict: 'error', reviewFailed: reason }
}

// A verdict is only 'approve' when a review actually ran, found nothing, AND
// no testID contract drift was reported — drift is a hard block regardless of
// whether the skeptics stripped the individual finding.
function verdictFor(findings, drift) {
  if (drift) {
    return 'changes-requested'
  }
  return findings.length ? 'changes-requested' : 'approve'
}

async function runReview(diff, crossRepo) {
  if (tier !== 'rfd') {
    const r = await agent(reviewerPrompt('correctness+standards', diff, crossRepo), {
      label: 'review',
      phase: 'Review',
      schema: REVIEW_SCHEMA,
    })
    if (!r) {
      return reviewFailure('single reviewer agent returned no result')
    }
    return {
      findings: r.findings || [],
      testIdDrift: Boolean(r.testIdDrift),
      verdict: verdictFor(r.findings || [], r.testIdDrift),
    }
  }

  if (reviewScriptPath) {
    try {
      const sub = await workflow({ scriptPath: reviewScriptPath }, { diff, criteria, crossRepo })
      if (sub && Array.isArray(sub.confirmed) && !sub.error) {
        return {
          findings: sub.confirmed,
          testIdDrift: Boolean(sub.testIdDrift),
          verdict: verdictFor(sub.confirmed, sub.testIdDrift),
          unverified: sub.unverified || [],
        }
      }
      log(`adversarial-review sub-workflow returned ${sub && sub.error ? `error: ${sub.error}` : 'no usable result'} — falling back to inline panel`)
    } catch (err) {
      log(`adversarial-review sub-workflow unavailable (${err.message}) — falling back to inline panel`)
    }
  }

  // RFD fallback: parallel multi-lens panel + skeptic verification, inline.
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
        // FAIL CLOSED: no valid skeptic votes means verification never ran —
        // that is NOT a refutation. Keep the finding and flag it unverified.
        if (valid.length === 0) {
          return { finding: f, survives: true, unverified: true }
        }
        const notRefuted = valid.filter((v) => !v.refuted).length
        return { finding: f, survives: notRefuted > valid.length / 2, unverified: false }
      })
    )
  )

  const survivors = judged.filter(Boolean).filter((j) => j.survives)
  const findings = survivors.map((j) => j.finding)
  const unverified = survivors.filter((j) => j.unverified).map((j) => j.finding)
  if (unverified.length) {
    log(`WARNING: ${unverified.length} finding(s) kept WITHOUT skeptic verification (all skeptics failed) — treat as unconfirmed`)
  }
  return { findings, testIdDrift: drift, verdict: verdictFor(findings, drift), unverified }
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
  const fixed = await agent(fixPrompt(review.findings, impl, 'review', tests), {
    label: `fix:review:r${reviewRound}`,
    phase: 'Review',
    schema: IMPL_SCHEMA,
    isolation: 'worktree',
  })
  // Preserve the prior branchRef when the fix round didn't return one — losing
  // it would leave the main loop with nothing integrable.
  if (fixed) {
    impl = { ...impl, ...fixed, branchRef: fixed.branchRef || impl.branchRef }
  }
  review = await runReview(impl.diff, crossRepo)
}
if (review.verdict === 'error') {
  log(`Review gate never completed (${review.reviewFailed}) — returning WITHOUT an approval so the caller does not merge unreviewed code.`)
}

// Phase 5 — Verify (UI only, + fix loop)
let verify = null
if (rendersUI) {
  phase('Verify')
  verify = await agent(verifierPrompt([], impl), { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA })
  // An unconfirmed bundle means the measurements describe some OTHER build —
  // never treat them as a verdict on this change.
  if (verify && verify.updateConfirmed === false) {
    log('WARNING: verifier could not confirm the running bundle is the one it published — measurements describe an unknown build and are NOT trustworthy.')
  }
  let verifyRound = 0
  while (
    verify &&
    (verify.failedCriteria || []).length > 0 &&
    !verify.structuralLimit &&
    verifyRound < MAX_VERIFY_ROUNDS
  ) {
    verifyRound += 1
    log(`Verify round ${verifyRound}: ${verify.failedCriteria.length} failed criteria → implementer fix`)
    const fixed = await agent(fixPrompt(verify.failedCriteria, impl, 'verify', tests), {
      label: `fix:verify:r${verifyRound}`,
      phase: 'Verify',
      schema: IMPL_SCHEMA,
      isolation: 'worktree',
    })
    if (fixed) {
      impl = { ...impl, ...fixed, branchRef: fixed.branchRef || impl.branchRef }
    }
    verify = await agent(verifierPrompt(verify.failedCriteria, impl), {
      label: `verify:r${verifyRound}`,
      phase: 'Verify',
      schema: VERIFY_SCHEMA,
    })
  }
}

return { tier, findings, crossRepo, tests, impl, review, verify }
