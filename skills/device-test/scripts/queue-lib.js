// Shared fetch/parse core for the device-test queue — used by both the
// on-demand status-board CLI (dtq / device-test-status) and the SessionStart
// hook (hooks/device-test-status.mjs). No chalk/commander here so the hook
// can pull it in without a TTY-formatting dependency.
//
// A test is one GitHub issue labelled `device-test`; state is the issue own
// open/closed plus its labels, never prose. Keep in sync with
// standards/workflows.md → "Device-test queue".

const path = require('path');

// CLAIM_MARKER and isNotice went with the comment parser: nothing here reads
// a queue comment any more, so nothing needs to tell a notice from an item.
const { parseClaim, activeClaim, DEVICES } = require('./claim-lib');

// gh() and checkGhReady() come from the work-claim lib rather than being
// declared again here. The copy that used to live in this file was
// character-identical EXCEPT that it never passed `timeout` — and this
// tree is exactly where that matters: hooks/device-test-status.mjs races
// collect() against a deadline, and Promise.race does not cancel the
// loser, so a slow fetch left gh children running after the hook exited.
// The reasoning was written down once, in the module that did not need it.
const { gh, checkGhReady, slugRepo } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tools',
  'work-claim',
  'lib',
  'claim.js'
));

// maskCode rides along on this same require: it is a markdown utility, not a
// claim concept, and the claim files are already its only other caller.
const { minutesSince, maskCode } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tools',
  'work-claim',
  'lib',
  'protocol.js'
));

/**
 * Parse a `gh api` response, refusing to read SILENCE as an empty list.
 *
 * `JSON.parse(out || '[]')` — which every fetch here used to do — turns a
 * call that returned nothing into a queue with nothing in it. On 2026-09-09,
 * with the GitHub API degraded, that printed `alate  nothing pending` while
 * alate held 17 open tests: no error, no warning, just a confident lie in the
 * one direction that matters. An empty queue and an unanswered question must
 * never render the same way — the same rule the device lock follows when it
 * prints `? UNREADABLE` rather than `free`.
 */
function parseGh(out, what) {
  if (!out || !out.trim()) {
    throw new Error(`empty response from gh (${what}) — treating as unknown`);
  }
  return JSON.parse(out);
}

// Scope table — keep in sync with skills/device-test/SKILL.md. The scope is
// deliberately NARROWER than the work-claim board (mobile apps only, because
// this queue is about a phone); the owner string is not, so it comes from
// slugRepo rather than being spelled out a fourth time.
const REPOS = [
  { key: 'alate', repo: slugRepo('alate') },
  { key: 'mood-layer', repo: slugRepo('mood-layer') },
  { key: 'badige', repo: slugRepo('badige') },

  // loom is a Shopify web surface, not a handset: its items are verified in a
  // browser (SKILL.md → "loom is in scope"). It still owns a device-test-queue
  // issue, so the board must count it or the queue accumulates unseen.
  { key: 'loom', repo: slugRepo('loom') },
];

const STATUS = {
  OPEN: 'open',
  DONE: 'done',
  FAILED: 'failed',
  NEEDS_BUILD: 'needs_build',

  // Open, but deliberately not drained — the user parked it. Distinct from
  // OPEN so the daily drain can skip it without a human re-deciding daily,
  // and distinct from DONE because nothing was verified.
  PARKED: 'parked',

  // Closed as not-planned: superseded, invalid, withdrawn. Distinct from DONE
  // because reporting it as done would claim a verification nobody performed.
  WITHDRAWN: 'withdrawn',

  UNPARSEABLE: 'unparseable',
};

/**
 * The labels that carry a test's situation (RFD-003 §1, forge#107).
 *
 * `device-test` says "this issue is a test"; the rest say what kind of
 * trouble it is in. GitHub's own open/closed state and close reason carry the
 * verdict, so nothing here is parsed out of prose — which is the entire point
 * of the medium change. Five parser repairs (#79, #80, #81, #102, #117) were
 * all the same defect: prose has no state, so state had to be simulated, and
 * a simulation drifts.
 */
const LABELS = {
  ITEM: 'device-test',
  NEEDS_HUMAN: 'needs-human',
  NEEDS_BUILD: 'needs-build',
  PARKED: 'parked',
  FAILED: 'failed',
};

const GLYPHS = {
  OPEN: '🤖',
  OPEN_HUMAN: '🙋',
  NEEDS_BUILD: '🔧',
  DONE: '⚪',
  FAILED: '🔴',
};

const ITEM_GLYPHS = Object.values(GLYPHS);

/** Every `### <item glyph>` heading in a body — one per test, or a problem. */
const ITEM_HEADING = new RegExp(`^###\\s*(?:${ITEM_GLYPHS.join('|')})`, 'gm');

/**
 * How many tests this ONE issue body is carrying.
 *
 * One issue per test. Stack two into one body and the second has no row on
 * any board, so nothing runs it, closes it, or notices it is missing — the
 * shape found on alate#562 comment 5589887980 (a correction plus two whole
 * tests), which survived the move to issues because a body can stack
 * headings exactly as a comment could (forge #117).
 *
 * Counted over a code-masked copy so a comment QUOTING a heading is not
 * mistaken for a second test.
 */
function itemHeadingCount(body) {
  const masked = maskCode(body);
  ITEM_HEADING.lastIndex = 0;
  return (masked.match(ITEM_HEADING) || []).length;
}

/**
 * One repo's queue: every issue labelled `device-test`.
 *
 * The comment parser that used to run alongside this is gone (RFD-003 step
 * 6). All four legacy queues were migrated and closed on 2026-09-10 — alate
 * 17 items, mood-layer 6, loom and badige nothing open — so reading comments
 * now would find only the ➡️ signposts pointing here.
 *
 * A repo whose issues cannot be read comes back with `error`, never with an
 * empty list: see parseGh. "Nothing pending" and "I could not tell" are
 * opposite instructions to whoever reads this board.
 */
/**
 * Every `device-test` issue in one repo, open and closed.
 *
 * The REST issues endpoint with `labels=`, NOT the search API RFD-003 §1
 * sketched. Search is indexed asynchronously, so an issue created seconds ago
 * is routinely missing from its results — and "enqueue a test, then read the
 * board" is the single most common thing anyone does here. A queue that can
 * fail to list what you just put in it is worse than a slow one.
 *
 * `state=all` because a closed test is still the record of a pass.
 */
async function fetchLabelledIssues(repoDef) {
  const out = await gh([
    'api',
    `repos/${repoDef.repo}/issues?labels=${LABELS.ITEM}&state=all&per_page=100`,
    '--paginate',
  ]);

  // /issues returns pull requests too; they carry a `pull_request` key. A PR
  // that happened to wear the label would otherwise render as a test.
  return parseGh(out, `${repoDef.repo} device-test issues`)
    .filter(i => !i.pull_request)
    .map(i => itemFromIssue(i, repoDef.key));
}

async function fetchRepoQueue(repoDef) {
  try {
    const items = await fetchLabelledIssues(repoDef);
    return { ...repoDef, items, issueCount: items.length };
  } catch (error) {
    return { ...repoDef, error: error.message || String(error) };
  }
}

async function fetchDeviceClaims() {
  return Promise.all(
    DEVICES.map(async device => {
      try {
        const out = await gh([
          'api',
          `repos/${device.repo}/issues/${device.issue}/comments`,
          '--paginate',
        ]);
        const comments = parseGh(out, `${device.repo}#${device.issue} claims`);
        const claims = comments.map(parseClaim).filter(Boolean);
        return { device, claim: activeClaim(claims), claims };
      } catch (error) {
        return { device, error: error.message || String(error) };
      }
    })
  );
}

/**
 * One queue item, read off a GitHub issue instead of a comment.
 *
 * Everything the old parser had to infer from prose is now either a label or
 * GitHub's own state, so this function has no regexes for state at all — only
 * for the three free-text body fields that genuinely are prose. Compare
 * `parseComment`, which needs ~120 lines to reach the same answer less
 * reliably.
 *
 * The return shape matches `parseComment`'s deliberately: `dtq`, the
 * SessionStart hook and the drain skill consume items without caring which
 * medium produced them, which is what lets the two run side by side through
 * the migration.
 */
function itemFromIssue(issue, repoKey) {
  const body = issue.body || '';
  const names = (issue.labels || []).map(l => (l.name || l).toLowerCase());
  const has = name => names.includes(name);
  const open = issue.state !== 'closed';

  let state;
  if (!open) {
    // `not_planned` is withdrawn; anything else — including a null reason on
    // issues closed before GitHub recorded one — is a pass. Defaulting the
    // other way would silently downgrade every historical pass to withdrawn.
    state =
      issue.state_reason === 'not_planned' ? STATUS.WITHDRAWN : STATUS.DONE;
  } else if (has(LABELS.FAILED)) {
    // A failed test stays OPEN and is re-checked by every later drain until a
    // fix makes it pass (RFD-003 §1). Closing on failure is how a bug stops
    // being looked at.
    state = STATUS.FAILED;
  } else if (has(LABELS.NEEDS_BUILD)) {
    state = STATUS.NEEDS_BUILD;
  } else if (has(LABELS.PARKED)) {
    state = STATUS.PARKED;
  } else {
    state = STATUS.OPEN;
  }

  const field = name => {
    const match = body.match(
      new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+?)(?=\\s*·\\s*\\*\\*|\\s*$)`, 'm')
    );
    return match ? match[1].trim() : null;
  };

  // `Verifies:` never `closes:` — a test must not be closed by the very PR it
  // exists to verify (RFD-003 §2).
  const verifies = field('Verifies');
  const prMatch = verifies && verifies.match(/#(\d+)/);

  return {
    state,
    open,

    // The id exists at creation and never changes — the thing a comment id
    // could not be, since a comment had to be posted before it had one.
    testId: `${repoKey}#${issue.number}`,

    // The `[device-test]` prefix is for skimming notification lists; it is
    // noise once you are already looking at the queue.
    title: (issue.title || '').replace(/^\s*\[device-test\]\s*/i, ''),
    pr: prMatch ? prMatch[1] : null,
    delivery: field('Delivery'),
    needsRuntime: field('Needs runtime'),
    needsHuman: has(LABELS.NEEDS_HUMAN),

    // An issue body can stack two `### <glyph>` headings exactly as a comment
    // could, so forge #117's detection moves here rather than dying with the
    // comment medium.
    itemHeadings: itemHeadingCount(body),

    // Nothing left to drift: there is no glyph mirroring a Status line,
    // because there is no Status line. Kept on the shape so the board's
    // existing drift counter reads zero rather than undefined.
    headingDrift: false,
    glyph: null,
    statusText: '',

    // Notes are ordinary issue comments now. They are NOT fetched here: the
    // list endpoint returns bodies only, and a per-issue comment fetch would
    // turn one request per repo into one per test. The drain fetches them for
    // the item it is actually running.
    notes: [],
    commentUrl: issue.html_url,
    createdAt: issue.created_at,
  };
}

async function collect(repoFilter) {
  const targets = repoFilter
    ? REPOS.filter(r => r.key === repoFilter || r.repo === repoFilter)
    : REPOS;
  if (targets.length === 0) {
    throw new Error(
      `Unknown repo "${repoFilter}". Known: ${REPOS.map(r => r.key).join(', ')}`
    );
  }
  return Promise.all(targets.map(fetchRepoQueue));
}

/**
 * Days since an ISO timestamp, or null when it cannot be read.
 *
 * Built on protocol.js `minutesSince` so the unreadable-timestamp policy is
 * decided in one place. The hand-rolled version returned NaN for a garbage
 * date where minutesSince returns null, and status-board renders
 * `age === null ? '' : …` — so a bad created_at printed `(NaNd)`.
 */
function daysSince(iso) {
  const minutes = minutesSince(iso);
  return minutes === null ? null : Math.floor(minutes / (60 * 24));
}

module.exports = {
  REPOS,
  STATUS,
  LABELS,
  itemFromIssue,

  // ITEM_GLYPHS outlives the comment format: `itemHeadingCount` still counts
  // `### <glyph>` headings, because an ISSUE BODY can stack two tests exactly
  // as a comment could (forge #117). Everything else the glyphs served —
  // expectedGlyph, headingDrift, the restamp pass — went with the Status line.
  ITEM_GLYPHS,
  itemHeadingCount,

  // Re-exported so callers get the whole queue surface from one require.
  ...require('./claim-lib'),
  checkGhReady,
  parseGh,
  fetchRepoQueue,
  fetchLabelledIssues,
  fetchDeviceClaims,
  collect,
  daysSince,
};
