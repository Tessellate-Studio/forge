// Whether an automated fix may be merged without a human reading it.
//
// WHY THIS EXISTS. crash-monitor's "Confidence heuristic" was six bullets of
// English that the model read and graded itself against, unattended, at 3am.
// One of its six conditions — "no active cooldown" — could not be evaluated at
// all: the marker it named was never written to the file it named, so the
// condition silently PASSED on every run since the skill was created. A gate
// with a condition that cannot fail is not a gate, and nothing in the output
// made that visible, because a verdict stated without its evidence is an
// assertion, not a decision (standards/authoritative-claims.md).
//
// So: pure. The caller observes gh and git and passes the results in. Every
// condition emits its evidence whether it passed or not.
//
// FAIL CLOSED, AND DO NOT SOFTEN IT. Any condition whose evidence is missing
// or unreadable returns `unknown`, and `unknown` routes to 4b exactly like a
// failure. `unknown` is not "probably fine". Changing an `unknown` to a pass
// is the single edit that destroys this module's purpose — it recreates the
// silently-passing condition above. If a run is noisy, fix the observer.
//
// WHAT THE FILE COUNT IS NOT. Condition 4 counts production files. That is a
// proxy and it does NOT track blast radius: a one-line change to an auth guard
// is more dangerous than a three-file rename, and this cannot tell them apart.
// The inherited policy ("No path exclusions — auth, payment and data-deletion
// fixes auto-merge too") is carried forward here unchanged, but note it was
// justified by the cooldown catching repeat failures — the same cooldown that
// had never once fired. Treat that policy as inherited, not endorsed, and do
// not read a 4a as "this change was low risk". Whether the gate should be
// path-sensitive is an open decision, deliberately not made in this module.

'use strict';

/** Condition 5's thresholds. See checkDeclarationAgainstShape for provenance. */
const MAX_LINES_REMOVED = 2;
const MAX_LINES_ADDED = 20;

const DECLARED_CLASSES = new Set(['guard', 'rewrite']);
const CI_STATUSES = new Set(['pass', 'fail', 'unknown']);
const COOLDOWN_STATUSES = new Set(['clear', 'active', 'unknown']);

const MANIFESTS = new Set([
  'package.json',
  'podfile',
  'build.gradle',
  'build.gradle.kts',
  'gemfile',
  'cargo.toml',
]);
const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'podfile.lock',
  'gemfile.lock',
  'cargo.lock',
]);

function normalise(rawPath) {
  return String(rawPath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isTestPath(path) {
  return /(^|\/)__tests__\//.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path);
}

/**
 * Files that are neither production code nor tests: docs, licences, CI config.
 * These must not count against condition 4. standards/workflows.md → "Status
 * update on completion" REQUIRES a regression-log entry alongside a fix, so a
 * classifier without this bucket rejects fixes for obeying another standard —
 * it would have rejected alate #643, which is the shape of a good fix here.
 */
function isNonCodePath(path) {
  return (
    /\.mdx?$/i.test(path) ||
    /(^|\/)LICENSE(\.[a-z]+)?$/i.test(path) ||
    path.startsWith('.github/')
  );
}

/** @returns {{production: string[], test: string[], doc: string[]}} */
function classifyFiles(paths) {
  const production = [];
  const test = [];
  const doc = [];
  for (const rawPath of paths || []) {
    const path = normalise(rawPath);
    if (isTestPath(path)) {
      test.push(path);
    } else if (isNonCodePath(path)) {
      doc.push(path);
    } else {
      production.push(path);
    }
  }
  return { production, test, doc };
}

/** @returns {{manifestChanged: boolean, lockfileChanged: boolean}} */
function detectDependencyChanges(paths) {
  let manifestChanged = false;
  let lockfileChanged = false;
  for (const rawPath of paths || []) {
    const base = normalise(rawPath).split('/').pop().toLowerCase();
    if (LOCKFILES.has(base)) {
      lockfileChanged = true;
    } else if (MANIFESTS.has(base)) {
      manifestChanged = true;
    }
  }
  return { manifestChanged, lockfileChanged };
}

/**
 * Given `git log --grep=Revert` subjects already scoped to the changed paths,
 * is any of them an actual revert? The grep alone also matches a commit that
 * merely mentions the word, and a false cooldown is a refusal nobody can
 * explain.
 */
function isRevertOfAutoFix(subjects) {
  return (subjects || []).some(subject =>
    /^revert[\s"':]/i.test(String(subject).trim())
  );
}

/**
 * Reduce `gh pr checks --json name,bucket` rows to a CI status.
 *
 * Lives here rather than in the CLI because it is a decision, not an
 * observation, and decisions have to be provable. Two rules it would be easy
 * to get wrong in the opposite direction:
 *
 * - `skipping` is NOT a failure. alate's own `auto-merge` job reports that
 *   bucket on every PR, so treating it as red would refuse every merge.
 * - Zero rows is `unknown`, never a vacuous pass. A PR nothing checked is the
 *   case this whole command exists to catch; silence is not success.
 *
 * @returns {{status: 'pass'|'fail'|'unknown', detail: string}}
 */
function summariseChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return {
      status: 'unknown',
      detail: 'zero checks reported — nothing verified this PR',
    };
  }
  const bad = checks.filter(
    check => check.bucket === 'fail' || check.bucket === 'cancel'
  );
  if (bad.length) {
    const names = bad.map(check => check.name || 'unnamed').join(', ');
    return { status: 'fail', detail: `${names} did not pass` };
  }
  const pending = checks.filter(check => check.bucket === 'pending');
  if (pending.length) {
    return {
      status: 'unknown',
      detail: `${pending.length} check(s) still running`,
    };
  }
  const passed = checks.filter(check => check.bucket === 'pass').length;
  const skipped = checks.length - passed;
  return {
    status: 'pass',
    detail: `${passed}/${checks.length} checks concluded success${
      skipped ? `, ${skipped} skipped` : ''
    }`,
  };
}

// ---------------------------------------------------------------------------
// Conditions. Each observes nothing; it reads what the caller already gathered
// and reports {status, evidence}. Order below is the order a reader meets them
// in the output, not a short-circuit chain — every condition is evaluated on
// every run so one pass yields the whole blocker list rather than one blocker
// per run across days.
// ---------------------------------------------------------------------------

/**
 * 0. INPUT INTEGRITY. Checked as a condition in its own right, because the
 *    failure this module exists to fix was an input nobody could supply being
 *    treated as satisfied. A missing input is not a neutral input.
 */
function checkInputIntegrity(state) {
  const missing = [];
  if (!state.diff || !Array.isArray(state.diff.productionFiles)) {
    missing.push('diff');
  }
  if (!state.ci || !CI_STATUSES.has(state.ci.status)) {
    missing.push('ci');
  }
  if (!state.cooldown || !COOLDOWN_STATUSES.has(state.cooldown.status)) {
    missing.push('cooldown');
  }
  if (!DECLARED_CLASSES.has(state.declaredClass)) {
    missing.push('declaredClass');
  }
  return missing.length
    ? {
        status: 'unknown',
        evidence: `unverifiable-input: ${missing.join(', ')}`,
      }
    : { status: 'pass', evidence: 'all inputs present and within range' };
}

/**
 * 1. CI. The load-bearing condition. These repos are private on the free tier,
 *    so branch protection 403s and `gh pr merge --auto` merges instantly with
 *    the same success message it gives when it genuinely waited. The checks
 *    themselves do exist and do run — alate has nine — so this reads the
 *    result rather than re-running anything (standards/workflows.md → "Local
 *    gates stay light — the runner is the authoritative gate").
 */
function checkCi(state) {
  const observed = state.ci || {};
  if (observed.status === 'pass') {
    return {
      status: 'pass',
      evidence: observed.detail || 'all checks concluded success',
    };
  }
  if (observed.status === 'fail') {
    return {
      status: 'fail',
      evidence: observed.detail || 'a check did not succeed',
    };
  }
  return {
    status: 'unknown',
    evidence: observed.detail || 'check state could not be read',
  };
}

/**
 * 2. COOLDOWN. A revert is direct evidence this gate already got THIS code
 *    wrong once, so nothing may argue past it. Derived from git history rather
 *    than a ledger: a ledger has to be written and the writer kept forgetting,
 *    whereas the revert IS the write.
 */
function checkCooldown(state) {
  const observed = state.cooldown || {};
  if (observed.status === 'clear') {
    return {
      status: 'pass',
      evidence: observed.detail || 'no revert touching these paths',
    };
  }
  if (observed.status === 'active') {
    return {
      status: 'fail',
      evidence: observed.detail || 'a revert touched these paths',
    };
  }
  return {
    status: 'unknown',
    evidence: observed.detail || 'revert history could not be read',
  };
}

/** 3. DEPENDENCIES. Not reviewable from a diff; security-sweep owns that lane. */
function checkDependencies(state) {
  const diff = state.diff;
  if (!diff) {
    return { status: 'unknown', evidence: 'no diff observed' };
  }
  const touched = [];
  if (diff.manifestChanged) {
    touched.push('manifest');
  }
  if (diff.lockfileChanged) {
    touched.push('lockfile');
  }
  return touched.length
    ? {
        status: 'fail',
        evidence: `${touched.join(
          ' + '
        )} changed — dependency changes belong to security-sweep`,
      }
    : { status: 'pass', evidence: 'no manifest or lockfile change' };
}

/** 4. SINGLE PRODUCTION FILE. Tests and docs alongside are fine, and named as ignored. */
function checkSingleProductionFile(state) {
  const diff = state.diff;
  if (!diff || !Array.isArray(diff.productionFiles)) {
    return { status: 'unknown', evidence: 'no file list observed' };
  }
  const count = diff.productionFiles.length;
  const ignored = `${(diff.testFiles || []).length} test, ${
    (diff.docFiles || []).length
  } doc ignored`;
  return count === 1
    ? { status: 'pass', evidence: `1 production file (${ignored})` }
    : {
        status: 'fail',
        evidence: `${count} production files, need exactly 1 (${ignored})`,
      };
}

/**
 * 5. DECLARATION vs DIFF SHAPE — a one-way ratchet.
 *
 *    This can only ever REJECT a `guard` declaration. It never rescues a
 *    `rewrite`, and no diff shape argues a declared rewrite back into 4a.
 *
 *    Say what it does precisely: it checks that the diff shape is CONSISTENT
 *    WITH the declaration. It does not verify that the fix is a guard clause —
 *    that is a semantic judgement and nothing here can make it. The value is
 *    that a false `guard` claim becomes expensive, and every failure mode of
 *    this check routes to 4b, so a miscalibrated threshold costs a human
 *    glance and never an unreviewed merge.
 *
 *    Thresholds are calibrated against the only two real crash-monitor fixes
 *    in the system's history, both of which must pass: alate #536 (+3/-0, one
 *    file) and alate #643 (+12/-2 in the production file). Counts are
 *    production-only, so a large test file never fails the shape check.
 *    Tighten these when a bad merge gives a documented reason to — the way
 *    every other threshold in this repo earned its number — not before.
 */
function checkDeclarationAgainstShape(state) {
  if (!DECLARED_CLASSES.has(state.declaredClass)) {
    return { status: 'unknown', evidence: 'no declaration to check against' };
  }
  if (state.declaredClass === 'rewrite') {
    return {
      status: 'fail',
      evidence: 'declared a rewrite — behavioural changes go to a human',
    };
  }
  const diff = state.diff || {};
  const added = Number(diff.linesAdded);
  const removed = Number(diff.linesRemoved);
  if (!Number.isFinite(added) || !Number.isFinite(removed)) {
    return {
      status: 'unknown',
      evidence: 'production line counts could not be read',
    };
  }
  const inconsistent = 'not consistent with the "guard" declaration';
  if (removed > MAX_LINES_REMOVED) {
    return {
      status: 'fail',
      evidence: `linesRemoved=${removed}, max ${MAX_LINES_REMOVED} — ${inconsistent}`,
    };
  }
  if (added > MAX_LINES_ADDED) {
    return {
      status: 'fail',
      evidence: `linesAdded=${added}, max ${MAX_LINES_ADDED} — ${inconsistent}`,
    };
  }
  return {
    status: 'pass',
    evidence: `+${added}/-${removed} in production, consistent with the "guard" declaration`,
  };
}

const CONDITIONS = [
  { name: 'input-integrity', evaluate: checkInputIntegrity },
  { name: 'ci-green', evaluate: checkCi },
  { name: 'cooldown', evaluate: checkCooldown },
  { name: 'dependencies', evaluate: checkDependencies },
  { name: 'single-production-file', evaluate: checkSingleProductionFile },
  { name: 'declare-vs-shape', evaluate: checkDeclarationAgainstShape },
];

/**
 * @param {object} state — everything the caller observed; see the CONDITIONS.
 * @returns {{route: '4a'|'4b', reasons: string[], checks: Array<{name: string,
 *           status: 'pass'|'fail'|'unknown', evidence: string}>}}
 */
function routeFix(state) {
  const observed = state || {};
  const checks = CONDITIONS.map(condition => ({
    name: condition.name,
    ...condition.evaluate(observed),
  }));
  const reasons = checks
    .filter(check => check.status !== 'pass')
    .map(check => `${check.name}: ${check.evidence}`);
  return { route: reasons.length === 0 ? '4a' : '4b', reasons, checks };
}

module.exports = {
  routeFix,
  summariseChecks,
  classifyFiles,
  detectDependencyChanges,
  isRevertOfAutoFix,
  CONDITIONS,
  MAX_LINES_ADDED,
  MAX_LINES_REMOVED,
};
