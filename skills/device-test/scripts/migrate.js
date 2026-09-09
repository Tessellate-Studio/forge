// Migrate one legacy queue issue's comments into one issue per test.
//
// Runs ONCE per repo and is deleted afterwards (RFD-003 step 6) — it is the
// last thing that reads the comment format. Everything here is built around
// one requirement: nothing open may be lost, and every old reference must
// still resolve. Hence the dry run, the verification gate, and the signpost
// left on every comment it moves.

const path = require('path');

const {
  STATUS,
  LABELS,
  REPOS,
  parseComment,
  splitNotes,
} = require('./queue-lib');

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

/** Items whose history is over. They stay as comments — see planFor. */
const DONE_STATES = [STATUS.DONE, STATUS.WITHDRAWN];

/**
 * The labels a legacy item's parsed state implies.
 *
 * `parked` has no legacy equivalent — the old format expressed it as a Status
 * value the parser never defined (`🅿️ PARKED`), which is exactly why it read
 * as a violation. Those arrive here as UNPARSEABLE and are labelled `parked`
 * only if their Status text says so; otherwise a human decides.
 */
function labelsForItem(item) {
  const labels = [LABELS.ITEM];
  if (item.state === STATUS.NEEDS_BUILD) {
    labels.push(LABELS.NEEDS_BUILD);
  }
  if (item.state === STATUS.FAILED) {
    labels.push(LABELS.FAILED);
  }
  if (/🅿️|\bPARKED\b/i.test(item.statusText || '')) {
    labels.push(LABELS.PARKED);
  }
  if (item.needsHuman) {
    labels.push(LABELS.NEEDS_HUMAN);
  }
  return [...new Set(labels)];
}

/**
 * The new issue body: the item's own fields, minus the things the issue now
 * carries natively, plus a line saying where it came from.
 *
 * The provenance line is not decoration. Fix-session prompts already in
 * flight name comment ids, and `gh search issues "<id>"` finds the new issue
 * through this line — one of the two lookups that must keep working forever
 * (the other is the alias table left on the closed legacy issue).
 */
function bodyForItem(item, repo, comment) {
  const { fields } = splitNotes(comment.body || '');
  const withoutStatus = fields
    .split('\n')
    .filter(l => !/^\s*[-*]?\s*\*\*Status:\*\*/.test(l))
    .filter(l => !/^###\s/.test(l))
    .join('\n')
    .trim();

  const verifies = item.pr ? `- **Verifies:** #${item.pr}\n` : '';
  return (
    `_Migrated from [comment ${comment.id}](${comment.html_url}) on the legacy ` +
    `queue issue._\n\n${verifies}${withoutStatus}\n`
  );
}

/** What the migration WOULD do to one repo, computed without writing. */
async function planFor(repoKey) {
  const target = REPOS.find(r => r.key === repoKey || r.repo === repoKey);
  if (!target) {
    throw new Error(`Unknown repo "${repoKey}"`);
  }

  const found = await gh([
    'api',
    `repos/${target.repo}/issues?labels=device-test-queue&state=open`,
  ]);
  const queues = JSON.parse(found || '[]').filter(i => !i.pull_request);
  if (queues.length === 0) {
    return { repo: target, queue: null, moves: [], stays: [] };
  }

  const out = await gh([
    'api',
    `repos/${target.repo}/issues/${queues[0].number}/comments`,
    '--paginate',
  ]);
  const comments = JSON.parse(out || '[]');

  const moves = [];
  const stays = [];
  for (const comment of comments) {
    const item = parseComment(comment);
    if (!item) {
      continue;
    }
    if (DONE_STATES.includes(item.state)) {
      // Done items are history. Moving them would create 37 closed issues
      // whose only content is "this passed once", and the legacy issue stays
      // readable as the archive.
      stays.push({ comment, item });
      continue;
    }
    moves.push({
      comment,
      item,
      title: `[device-test] ${item.title}`,
      labels: labelsForItem(item),
      body: bodyForItem(item, target.repo, comment),
      notes: item.notes || [],
    });
  }
  return { repo: target, queue: queues[0], moves, stays };
}

/**
 * Perform the migration for one repo.
 *
 * The verification gate before closing the legacy issue is the difference
 * between "meant to lose nothing" and "cannot lose anything": the set of
 * comment ids actually migrated is compared against a FRESH re-parse of the
 * queue, and any mismatch aborts before the legacy issue is closed. A comment
 * added while the migration ran is the case this catches.
 */
async function migrate(repoKey, { dryRun = true } = {}) {
  const plan = await planFor(repoKey);
  if (!plan.queue) {
    return { ...plan, migrated: [], closed: false, note: 'no legacy queue' };
  }
  if (dryRun) {
    return { ...plan, migrated: [], closed: false };
  }

  const migrated = [];
  for (const move of plan.moves) {
    const created = JSON.parse(
      await gh([
        'api',
        `repos/${plan.repo.repo}/issues`,
        '-f',
        `title=${move.title}`,
        '-f',
        `body=${move.body}`,
        ...move.labels.flatMap(l => ['-f', `labels[]=${l}`]),
      ])
    );

    // Notes were the item's history; they become comments in reading order.
    for (const note of move.notes) {
      await gh([
        'api',
        `repos/${plan.repo.repo}/issues/${created.number}/comments`,
        '-f',
        `body=${note}`,
      ]);
    }

    // Signpost the old comment, and make it a NOTICE (➡️) so the legacy
    // parser skips it — otherwise every migrated test is counted twice until
    // the legacy queues are retired.
    const signposted =
      `### ➡️ Migrated → #${created.number}\n\n` +
      `_This test now lives at ${plan.repo.repo}#${created.number}. ` +
      `Left here so old references to comment ${move.comment.id} still ` +
      `resolve._\n\n---\n\n${move.comment.body}`;
    await gh([
      'api',
      `repos/${plan.repo.repo}/issues/comments/${move.comment.id}`,
      '-X',
      'PATCH',
      '-f',
      `body=${signposted}`,
    ]);

    migrated.push({ from: move.comment.id, to: created.number });
  }

  // THE GATE. Re-parse the queue fresh; every non-done item must now be a
  // migrated signpost. A comment posted while this ran shows up here.
  const after = await planFor(repoKey);
  const stillOpen = after.moves.filter(
    m => !migrated.some(x => x.from === m.comment.id)
  );
  if (stillOpen.length > 0) {
    return {
      ...plan,
      migrated,
      closed: false,
      aborted: `${stillOpen.length} item(s) appeared or failed to migrate — legacy issue left OPEN`,
      stillOpen: stillOpen.map(m => m.comment.id),
    };
  }

  const alias = [
    '### ➡️ This queue has moved',
    '',
    'Every open test here is now its own issue, labelled `device-test`.',
    'Closed items stay below as the archive.',
    '',
    '| was (comment) | is now |',
    '|---|---|',
    ...migrated.map(m => `| \`${m.from}\` | #${m.to} |`),
    '',
    `Decision: RFD-003 (forge#107). Find a migrated test from an old comment`,
    'id with `gh search issues "<id>"` — the provenance line is in each new body.',
  ].join('\n');

  await gh([
    'api',
    `repos/${plan.repo.repo}/issues/${plan.queue.number}/comments`,
    '-f',
    `body=${alias}`,
  ]);
  await gh([
    'api',
    `repos/${plan.repo.repo}/issues/${plan.queue.number}`,
    '-X',
    'PATCH',
    '-f',
    'state=closed',
  ]);

  return { ...plan, migrated, closed: true };
}

module.exports = { labelsForItem, bodyForItem, planFor, migrate };
