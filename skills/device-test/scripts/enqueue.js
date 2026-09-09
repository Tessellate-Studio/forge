// Enqueue a device test — the write half of the queue, as one GitHub issue.
//
// The template lives HERE, in forge, and not as a `.github/ISSUE_TEMPLATE`
// file in each app repo. ADR-003's zero-files constraint still holds (nothing
// about the queue may reach an app's package), and a template file per repo
// would be four copies drifting apart — the exact failure the single-home
// principle exists to stop. It also sidesteps GitHub's issue-template gap,
// where a template cannot apply labels reliably.
//
// Keep in sync with standards/workflows.md → "Device-test queue".

const path = require('path');

const { LABELS } = require('./queue-lib');

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

/**
 * A step that needs a person, marked the way the old format marked it.
 *
 * The `HUMAN:` PREFIX, not the word anywhere in the sentence — otherwise
 * "no human needed here, adb does it" would flip the label and park an
 * agent-runnable test on a person forever.
 */
const HUMAN_STEP = /^\s*HUMAN:/;

/**
 * The issue body for a new test.
 *
 * Two shapes matter and differ deliberately:
 *
 * - **Steps are a task list.** A drain ticks a box when it RUNS that step,
 *   pass or fail, so a step nobody reached stays unticked and reads as "not
 *   run" without anyone writing prose about it. That is forge#100's finding:
 *   a single ❌ on an item hid that steps 2-5 were never looked at, and one
 *   of them would have shown that every swipe on that screen crashed the app.
 * - **Expect stays a numbered list.** An expectation is JUDGED, not
 *   performed. Making it a checkbox invites ticking one that actually failed.
 *
 * There is no `**Status:**` line. The issue's own state is the status, which
 * is the whole reason this medium replaced comments.
 */
function renderTestBody(fields) {
  const {
    verifies,
    sha,
    delivery,
    needsRuntime,
    steps = [],
    expect = [],
    why,
  } = fields || {};

  const lines = [];

  // `Verifies:`, never `closes:` — a merged PR carrying a closing keyword
  // would close the very test that exists to check it (RFD-003 §2).
  if (verifies) {
    lines.push(`- **Verifies:** #${verifies}${sha ? ` (\`${sha}\`)` : ''}`);
  }

  const delivered = [
    delivery && `**Delivery:** ${delivery}`,
    needsRuntime && `**Needs runtime:** ${needsRuntime}`,
  ].filter(Boolean);
  if (delivered.length) {
    lines.push(`- ${delivered.join(' · ')}`);
  }
  if (why) {
    lines.push(`- **Why this item exists:** ${why}`);
  }

  lines.push('- **Steps:**');
  steps.forEach((step, i) => lines.push(`  - [ ] ${i + 1}. ${step}`));

  lines.push('- **Expect:**');
  expect.forEach((line, i) => lines.push(`  ${i + 1}. ${line}`));

  return lines.join('\n');
}

/** device-test always; needs-human when a step is prefixed `HUMAN:`. */
function labelsFor(fields) {
  const steps = (fields && fields.steps) || [];
  const labels = [LABELS.ITEM];
  if (steps.some(s => HUMAN_STEP.test(s))) {
    labels.push(LABELS.NEEDS_HUMAN);
  }
  return labels;
}

/** A title reduced to something two sessions would write identically. */
function intentSlug(intent) {
  return String(intent || '')
    .toLowerCase()
    .replace(/^\s*\[device-test\]\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Is this existing issue the same test someone is about to enqueue again? */
function matchesIntent(issue, intent) {
  return intentSlug((issue && issue.title) || '') === intentSlug(intent);
}

/**
 * Create the test, or append to the one that already covers it.
 *
 * Searching before creating is the Kubernetes dedup rule: the same failure
 * gets reported by several sessions, and a queue that accumulates four copies
 * of one test wastes a device sitting four times over. On a hit the new
 * detail becomes a comment on the existing issue instead.
 */
async function enqueue({ repo, intent, fields, dryRun }) {
  const body = renderTestBody(fields);
  const labels = labelsFor(fields);
  const title = `[device-test] ${intent}`;

  const found = await gh([
    'api',
    `repos/${repo}/issues?labels=${LABELS.ITEM}&state=open&per_page=100`,
    '--paginate',
  ]);
  const existing = JSON.parse(found || '[]')
    .filter(i => !i.pull_request)
    .find(i => matchesIntent(i, intent));

  if (dryRun) {
    return {
      action: existing ? 'append' : 'create',
      title,
      labels,
      body,
      existing: existing && existing.number,
    };
  }

  if (existing) {
    await gh([
      'api',
      `repos/${repo}/issues/${existing.number}/comments`,
      '-f',
      `body=${body}`,
    ]);
    return { action: 'append', number: existing.number };
  }

  const created = await gh([
    'api',
    `repos/${repo}/issues`,
    '-f',
    `title=${title}`,
    '-f',
    `body=${body}`,
    ...labels.flatMap(l => ['-f', `labels[]=${l}`]),
  ]);
  return { action: 'create', number: JSON.parse(created).number };
}

module.exports = {
  renderTestBody,
  labelsFor,
  intentSlug,
  matchesIntent,
  enqueue,
};
