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
// proxy and it does NOT track blast radius: a one-line change to a sync guard
// is more dangerous than a three-file rename, and the count cannot tell them
// apart. The old "no path exclusions" policy was justified by a cooldown that
// had never once fired. Decided 2026-09-10 (forge#87): sync, persistence and
// migration paths route to a human whatever else they pass — condition 7,
// narrow on purpose and with incident provenance. Auth, payment and deletion
// were considered and left out for want of an incident. Do not read a 4a as
// "this change was low risk".
//
// WHICH CONDITIONS APPLY depends on --source (forge#86): security-sweep and
// roadmap-pulse used to merge on their own prose criteria. They now come
// through here too, with the conditions that cannot describe their changes
// skipped — visibly — rather than the whole gate.

'use strict';

/** Condition 5's thresholds. See checkDeclarationAgainstShape for provenance. */
const MAX_LINES_REMOVED = 2;
const MAX_LINES_ADDED = 20;

const DECLARED_CLASSES = new Set(['guard', 'rewrite']);
const CI_STATUSES = new Set(['pass', 'fail', 'unknown']);
const COOLDOWN_STATUSES = new Set(['clear', 'active', 'unknown']);
const DEVICE_STATUSES = new Set(['clear', 'pending', 'unknown']);

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

/**
 * Which conditions an automation is judged on (forge#86).
 *
 * Every source gets every condition unless it is named here, and an unknown
 * source gets the full set — a typo in `--source` must never buy a lighter
 * gate. A skipped condition still prints, as `skipped` with its reason, so a
 * reader sees what was NOT checked instead of inferring a pass from absence.
 *
 * - security-sweep: its automatic lane is a lockfile-only `npm audit fix`, so
 *   the one-production-file count and the guard/rewrite declaration say
 *   nothing about it. `dependencies` does not disappear for it — it inverts
 *   (checkDependencies).
 * - roadmap-pulse: an auto-built P0 feature spans files by design, and the
 *   declaration ratchet was calibrated on one-line crash fixes. CI, cooldown,
 *   dependencies, device tests and data-integrity paths all still apply.
 */
const SOURCE_PROFILES = {
  'security-sweep': {
    skip: ['single-production-file', 'declare-vs-shape'],
    why: 'a dependency patch is lockfile changes, not one guarded file',
  },
  'roadmap-pulse': {
    skip: ['single-production-file', 'declare-vs-shape'],
    why: 'an auto-built feature spans files by design',
  },
};

function skippedFor(source, conditionName) {
  const profile = SOURCE_PROFILES[source];
  return profile && profile.skip.includes(conditionName) ? profile : null;
}

/**
 * Condition 7's words (forge#87). Deliberately narrow, and each has a reason:
 * alate's two silent-data-loss reports (#596, #606) trace to sync — alate#669,
 * `mobile/src/services/syncService.ts` and `useAuthSync.ts` — whose failure
 * mode is data quietly never leaving the phone; persistence is the other half
 * of that same path; migrations rewrite stored data in place. Add a word when
 * an incident earns it, the way every threshold in this module was earned.
 */
const DATA_INTEGRITY_WORDS = new Set([
  'sync',
  'synced',
  'syncing',
  'persist',
  'persisted',
  'persistence',
  'storage',
  'migrate',
  'migration',
  'migrations',
]);

/**
 * Whole words of a path, split on separators and camelCase, lowercased — so
 * `useAuthSync.ts` yields `sync` and `asyncUtils.ts` yields `async`, not `sync`.
 */
function pathWords(rawPath) {
  return normalise(rawPath)
    .split(/[/._-]+/)
    .flatMap(part => part.split(/(?=[A-Z])/))
    .map(word => word.toLowerCase())
    .filter(Boolean);
}

function isDataIntegrityPath(rawPath) {
  return pathWords(rawPath).some(word => DATA_INTEGRITY_WORDS.has(word));
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
  if (
    !state.deviceVerification ||
    !DEVICE_STATUSES.has(state.deviceVerification.status)
  ) {
    missing.push('deviceVerification');
  }
  if (
    !skippedFor(state.source, 'declare-vs-shape') &&
    !DECLARED_CLASSES.has(state.declaredClass)
  ) {
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

/**
 * security-sweep's side of condition 3: pass only when EVERY production file
 * is a lockfile. Its automatic lane is `npm audit fix` with `package.json`
 * untouched (skills/security-sweep Step 2a — a changed manifest is a direct
 * dependency bump and goes to a human). Merely skipping condition 3 would let
 * anything run under `--source security-sweep` through with app code in it.
 * Why a manifest bump is not "safe": alate#203 (`puppeteer-core`), reverted for
 * an ERR_REQUIRE_ESM that took /api/ai to 500.
 */
function checkLockfileOnly(diff) {
  const files = diff.productionFiles || [];
  if (files.length === 0) {
    return {
      status: 'unknown',
      evidence: 'no production files — nothing a dependency patch would change',
    };
  }
  const other = files.filter(
    file => !LOCKFILES.has(normalise(file).split('/').pop().toLowerCase())
  );
  return other.length === 0
    ? {
        status: 'pass',
        evidence: `lockfile-only (${files.length}) — security-sweep's lane`,
      }
    : {
        status: 'fail',
        evidence: `security-sweep auto-merges lockfiles only; also changed: ${other
          .slice(0, 3)
          .join(', ')}`,
      };
}

/**
 * 3. DEPENDENCIES. Not reviewable from a diff; security-sweep owns that lane —
 *    and for security-sweep itself the rule inverts (checkLockfileOnly).
 */
function checkDependencies(state) {
  const diff = state.diff;
  if (!diff) {
    return { status: 'unknown', evidence: 'no diff observed' };
  }
  if (state.source === 'security-sweep') {
    return checkLockfileOnly(diff);
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

/**
 * 6. DEVICE VERIFICATION (forge#104). An open device test naming this PR in
 *    `**Verifies:**` means nobody has seen the change work on a phone yet.
 *    An unattended merge is the worst place to ship that silently, so it goes
 *    to a human — unless the PR already carries `device-unverified`, a choice
 *    someone made on purpose and left visible on the PR. The observation and
 *    its rules live in skills/device-test/scripts/verification.js, shared with
 *    the merge-gate hook, so the two routes cannot disagree about a PR.
 */
function checkDeviceVerification(state) {
  const observed = state.deviceVerification || {};
  if (observed.status === 'clear') {
    return {
      status: 'pass',
      evidence: observed.detail || 'no open device test verifies this PR',
    };
  }
  if (observed.status === 'pending') {
    return {
      status: 'fail',
      evidence: observed.detail || 'an open device test verifies this PR',
    };
  }
  return {
    status: 'unknown',
    evidence: observed.detail || 'device tests could not be read',
  };
}

/**
 * 7. DATA-INTEGRITY PATHS (forge#87). A change to sync, persistence or
 *    migration code goes to a human, whatever else it passes. The file count
 *    cannot see that a one-line sync change outranks a three-file rename; this
 *    can, for the one class with incidents behind it (DATA_INTEGRITY_WORDS).
 */
function checkDataIntegrityPath(state) {
  const diff = state.diff;
  if (!diff || !Array.isArray(diff.productionFiles)) {
    return { status: 'unknown', evidence: 'no file list observed' };
  }
  const hits = diff.productionFiles.filter(isDataIntegrityPath);
  return hits.length
    ? {
        status: 'fail',
        evidence: `${hits
          .slice(0, 3)
          .join(', ')} — sync/persistence/migration changes go to a human`,
      }
    : { status: 'pass', evidence: 'no sync, persistence or migration path' };
}

const CONDITIONS = [
  { name: 'input-integrity', evaluate: checkInputIntegrity },
  { name: 'ci-green', evaluate: checkCi },
  { name: 'cooldown', evaluate: checkCooldown },
  { name: 'dependencies', evaluate: checkDependencies },
  { name: 'single-production-file', evaluate: checkSingleProductionFile },
  { name: 'declare-vs-shape', evaluate: checkDeclarationAgainstShape },
  { name: 'device-verified', evaluate: checkDeviceVerification },
  { name: 'data-integrity-path', evaluate: checkDataIntegrityPath },
];

/**
 * @param {object} state — everything the caller observed; see the CONDITIONS.
 * @returns {{route: '4a'|'4b', reasons: string[], checks: Array<{name: string,
 *           status: 'pass'|'fail'|'unknown', evidence: string}>}}
 */
function routeFix(state) {
  const observed = state || {};
  const checks = CONDITIONS.map(condition => {
    const skipped = skippedFor(observed.source, condition.name);
    return skipped
      ? {
          name: condition.name,
          status: 'skipped',
          evidence: `not applied to ${observed.source} — ${skipped.why} (forge#86)`,
        }
      : { name: condition.name, ...condition.evaluate(observed) };
  });
  const reasons = checks
    .filter(check => check.status !== 'pass' && check.status !== 'skipped')
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
  SOURCE_PROFILES,
  isDataIntegrityPath,
  MAX_LINES_ADDED,
  MAX_LINES_REMOVED,
};
