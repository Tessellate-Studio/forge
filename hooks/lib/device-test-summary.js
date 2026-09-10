// What the SessionStart hook says about the device-test queue.
//
// WHY THIS IS ITS OWN FILE (forge#135). The executable cannot be unit tested,
// and the one test that ran it checked "exits 0 and emits nothing or a valid
// envelope" — which silence satisfies. So when RFD-003 step 6 (#133) dropped
// `issueNumber` from the queue result, the hook's `!r.issueNumber` guard
// skipped every repo and it said nothing over 22 open tests, with the suite
// green. The decision between speaking and staying quiet lives here, where it
// can be tested against the real result shape.
//
// Two things are not silence-worthy, and both used to be silent:
//   - a repo whose queue could not be read — "nothing pending" and "could not
//     find out" are opposite instructions (the `? UNREADABLE` rule, #128);
//   - a fetch that ran out of time — same reason, one level up.

'use strict';

const path = require('path');

const { STATUS } = require(path.join(
  __dirname,
  '..',
  '..',
  'skills',
  'device-test',
  'scripts',
  'queue-lib.js'
));

/** The states that are still somebody's work. Closed tests never nag. */
const PENDING = [
  [STATUS.OPEN, 'open'],
  [STATUS.FAILED, 'failed'],
  [STATUS.NEEDS_BUILD, 'needs-build'],
  [STATUS.PARKED, 'parked'],
];

function queueUrl(repo) {
  return `https://github.com/${repo}/issues?q=is%3Aopen+label%3Adevice-test`;
}

/** Counts per pending state, plus how many open tests need a person. */
function countRepo(items) {
  const counts = {};
  PENDING.forEach(([state, label]) => {
    counts[label] = items.filter(i => i.state === state).length;
  });
  counts.human = items.filter(
    i => i.state === STATUS.OPEN && i.needsHuman
  ).length;
  return counts;
}

function describeCounts(counts) {
  return PENDING.map(([, label]) => label)
    .filter(label => counts[label])
    .map(label =>
      label === 'open' && counts.human
        ? `${counts.open} open (${counts.human} needs-human)`
        : `${counts[label]} ${label}`
    )
    .join(', ');
}

/**
 * @param {Array<{key: string, repo: string, items?: object[], error?: string}>} results
 *   what queue-lib's collect() resolves to
 * @returns {{systemMessage: string, context: string} | null} null = stay quiet
 */
function summariseQueue(results) {
  const totals = { open: 0, human: 0, failed: 0, 'needs-build': 0, parked: 0 };
  const lines = [];
  const unreadable = [];

  (results || []).forEach(r => {
    if (r.error || !Array.isArray(r.items)) {
      unreadable.push(r.key);
      return;
    }
    const counts = countRepo(r.items);
    Object.keys(totals).forEach(k => {
      totals[k] += counts[k];
    });
    const described = describeCounts(counts);
    if (described) {
      lines.push(`- ${r.key}: ${described} — ${queueUrl(r.repo)}`);
    }
  });

  if (lines.length === 0 && unreadable.length === 0) {
    return null; // every queue read, nothing pending — a valid, quiet result
  }

  const parts = [];
  if (lines.length) {
    parts.push(describeCounts(totals));
  }
  if (unreadable.length) {
    parts.push(`could not read ${unreadable.join(', ')}`);
  }

  const context = [
    lines.length
      ? `The device-test queue has pending tests:\n${lines.join('\n')}`
      : '',
    unreadable.length
      ? `Could not read the queue for: ${unreadable.join(', ')}. ` +
        'That is not the same as nothing pending — do not report those repos as clear.'
      : '',
    "This is informational only — don't act on it unless the user asks. " +
      'Run `dtq` for the live board, or /forge:device-test to drain it.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    systemMessage: `device-test queue: ${parts.join('; ')} — run \`dtq\``,
    context,
  };
}

/** The fetch did not finish. Say so; silence would read as an empty queue. */
function unreadableNotice(reason) {
  return {
    systemMessage: `device-test queue: could not be read (${reason}) — run \`dtq\``,
    context:
      `The device-test queue could not be read at session start (${reason}). ` +
      'That is not the same as nothing pending — do not report the queue as clear. ' +
      'Run `dtq` for the live board if it matters to the task.',
  };
}

module.exports = { summariseQueue, unreadableNotice };
