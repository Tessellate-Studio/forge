// Whether a PR may merge while a device test that verifies it is still open.
//
// WHY (forge#104). alate#670 merged and shipped as a production OTA while its
// own queue entry said none of its four behaviours had been verified on any
// device or simulator. Every sift swipe on that screen hard-crashed the app
// for the next four days (alate#701). "Verified on device" was a sentence a PR
// wrote about itself, and nothing compared it with the queue. Under RFD-003 a
// test is an issue whose body says `**Verifies:** #<pr>`, so the comparison
// is now a lookup.
//
// THE RULE: a PR that an OPEN device test verifies does not merge unless the
// PR carries `device-unverified`. The label is the point, not a loophole.
// Shipping before a device pass is often right — an OTA-delivered change can
// only be tested once it ships — so the choice stays available. It just stops
// being silent, and the label stays on the PR as the record.
//
// WHAT THIS DOES NOT CATCH, so nobody reads more into it: a UI PR that never
// enqueued a test. The gate keys on the Verifies edge, and no test means no
// edge. Telling "this is a UI change" from a diff needs a per-repo path list
// with no incident evidence behind it yet — forge#87's objection to invented
// keyword lists applies. The enqueue rule in standards/workflows.md still
// covers that half.
//
// deviceVerification() decides and is pure. fetchVerification() is the one
// network read, shared by hooks/merge-gate.mjs and tools/safe-merge.

'use strict';

const path = require('path');

const { REPOS, LABELS, itemFromIssue, parseGh } = require('./queue-lib');

const { gh } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tools',
  'work-claim',
  'lib',
  'claim.js'
));

const UNVERIFIED_LABEL = 'device-unverified';

/** The device-test queue a repo belongs to, or null when it has none. */
function trackedRepo(slug) {
  const want = String(slug || '').toLowerCase();
  return REPOS.find(r => r.repo.toLowerCase() === want) || null;
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

/**
 * @param {object} input
 * @param {{key: string, repo: string} | null} input.repoDef  from trackedRepo
 * @param {string|number} input.pr
 * @param {string[]} [input.prLabels]  label names on the PR
 * @param {object[]} [input.issues]    REST issues labelled device-test
 * @param {string} [input.error]       why the read failed, when it did
 * @returns {{status: 'clear'|'pending'|'unknown', detail: string, tests: string[]}}
 */
function deviceVerification({ repoDef, pr, prLabels, issues, error }) {
  if (!repoDef) {
    return {
      status: 'clear',
      detail: 'repo has no device-test queue',
      tests: [],
    };
  }

  // Unknown is not clear. Reading nothing and reporting "no open tests" is
  // the exact shape of the board bug that printed `nothing pending` over 17
  // open tests (queue-lib parseGh).
  if (error || !Array.isArray(issues) || !Array.isArray(prLabels)) {
    return {
      status: 'unknown',
      detail: `device tests could not be read${error ? `: ${error}` : ''}`,
      tests: [],
    };
  }

  const number = String(pr).replace(/^#/, '');
  const tests = issues
    .filter(i => !i.pull_request && i.state !== 'closed')
    .map(i => itemFromIssue(i, repoDef.key))
    .filter(item => item.pr === number)
    .map(item => item.testId);

  if (tests.length === 0) {
    return {
      status: 'clear',
      detail: `no open device test verifies #${number}`,
      tests,
    };
  }

  const labels = prLabels.map(l => String(l).toLowerCase());
  if (labels.includes(UNVERIFIED_LABEL)) {
    return {
      status: 'clear',
      detail: `#${number} is labelled ${UNVERIFIED_LABEL} — merging with ${tests.join(
        ', '
      )} still open`,
      tests,
    };
  }

  return {
    status: 'pending',
    detail: `${tests.join(', ')} ${plural(
      tests.length,
      'verifies',
      'verify'
    )} #${number} and ${plural(tests.length, 'is', 'are')} still open`,
    tests,
  };
}

/**
 * Read what deviceVerification needs. Never throws: a failed read comes back
 * as `unknown`, which both callers refuse to treat as clear.
 */
async function fetchVerification(repoSlug, pr) {
  const repoDef = trackedRepo(repoSlug);
  if (!repoDef) {
    return deviceVerification({ repoDef, pr });
  }
  try {
    const [issuesOut, labelsOut] = await Promise.all([
      gh([
        'api',
        `repos/${repoDef.repo}/issues?labels=${LABELS.ITEM}&state=open&per_page=100`,
        '--paginate',
      ]),
      gh([
        'api',
        `repos/${repoDef.repo}/issues/${pr}`,
        '--jq',
        '[.labels[].name]',
      ]),
    ]);
    return deviceVerification({
      repoDef,
      pr,
      issues: parseGh(issuesOut, `${repoDef.repo} open device tests`),
      prLabels: parseGh(labelsOut, `${repoDef.repo}#${pr} labels`),
    });
  } catch (err) {
    return deviceVerification({
      repoDef,
      pr,
      error: String((err && err.message) || err).slice(0, 160),
    });
  }
}

module.exports = {
  UNVERIFIED_LABEL,
  trackedRepo,
  deviceVerification,
  fetchVerification,
};
