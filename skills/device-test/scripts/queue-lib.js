// Shared fetch/parse core for the device-test queue — used by both the
// on-demand status-board CLI (dtq / device-test-status) and the SessionStart
// hook (hooks/device-test-status.mjs). No chalk/commander here so the hook
// can pull it in without a TTY-formatting dependency.
//
// Parses the fixed comment format from standards/workflows.md → "Device-test
// queue" — keep both in sync if that format changes.

const path = require('path');

const {
  CLAIM_MARKER,
  isNotice,
  parseClaim,
  activeClaim,
  DEVICES,
} = require('./claim-lib');

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

/** The `**Status:**` field regex — one definition, three callers. */
const STATUS_FIELD = /\*\*Status:\*\*\s*(.+?)\s*$/m;

/**
 * Find the `**Status:**` field, ignoring any mention of it inside code.
 *
 * Located on a code-masked copy (see maskCode) but captured from the
 * original, so a Status value that legitimately contains a backticked
 * fragment — `🔧 needs build — needs the `v1.2.2` tag build` — keeps it.
 */
function findStatus(text) {
  const located = STATUS_FIELD.exec(maskCode(text));
  return located ? text.slice(located.index).match(STATUS_FIELD) : null;
}

/** Where the `**Status:**` field starts, or -1 — same masking, same reason. */
function statusIndex(text) {
  const located = STATUS_FIELD.exec(maskCode(text));
  return located ? located.index : -1;
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

/**
 * The heading glyph per state — what the queue issue looks like when you
 * scroll it in a browser, which is the one view the board never gave anyone.
 * OPEN splits by WHO is needed: an agent can run it (🤖) or a person must
 * (🙋). The `**Status:**` line stays the source of truth; the glyph mirrors
 * it, and `headingDrift` below marks any comment where the two disagree so
 * the drain restamps it.
 */
const GLYPHS = {
  [STATUS.OPEN]: '🤖',
  OPEN_HUMAN: '🙋',
  [STATUS.NEEDS_BUILD]: '🔧',
  [STATUS.DONE]: '⚪',
  [STATUS.FAILED]: '🔴',
};

const ITEM_GLYPHS = Object.values(GLYPHS);

/**
 * A heading that OPENS with an item glyph is declaring itself an item, even
 * when nothing else in the comment parses. That declaration is the strongest
 * signal the format has, so it outranks every shape heuristic below — the
 * alternative is an item with a typo'd Status quietly leaving the board.
 */
const ITEM_GLYPH_OPENER = new RegExp(`^\\s*(?:${ITEM_GLYPHS.join('|')})`);

/** Every `### <item glyph>` heading in a body — one per test, or a problem. */
const ITEM_HEADING = new RegExp(`^###\\s*(?:${ITEM_GLYPHS.join('|')})`, 'gm');

/**
 * How many tests this ONE comment is carrying.
 *
 * The format is one comment per test (standards/workflows.md → "Notes go on
 * the item, under a rule"), and everything downstream assumes it: the title
 * is the comment's first heading, the Status is its first Status line, and
 * `notes` is whatever sits below the first rule after that. Stack two tests
 * in one comment and the second is not a second row — it is filed as a NOTE
 * on the first. Real shape, alate#562 comment 5589887980: a correction plus
 * `budget-column-739` plus `gender-unisex-739`. The board showed one row,
 * titled after the correction; the second test had no row at all, so nothing
 * could run it, close it, or notice it was missing.
 *
 * Counted over a code-masked copy so a note QUOTING a heading — the same
 * trap findStatus already sidesteps — is not mistaken for a second test.
 */
function itemHeadingCount(body) {
  const masked = maskCode(body);
  ITEM_HEADING.lastIndex = 0;
  return (masked.match(ITEM_HEADING) || []).length;
}

/**
 * The state a `**Status:**` value names, or null when it names none of them.
 *
 * The standard defines exactly four (standards/workflows.md → "Device-test
 * queue"): `OPEN`, `✅ done`, `❌ failed`, `🔧 needs build`. Anything else —
 * `CLOSED`, `🅿️ PARKED`, or a sentence of prose that merely opens with
 * `**Status:**` — names no state, and that distinction does two jobs: on a
 * test-shaped comment it is real drift a human has to resolve, and on a
 * comment with no test shape at all it is the tell that the line is
 * commentary rather than a queue item.
 */
function statusState(statusText) {
  if (/^OPEN\b/.test(statusText)) {
    return STATUS.OPEN;
  }
  if (statusText.startsWith('✅')) {
    return STATUS.DONE;
  }
  if (statusText.startsWith('❌')) {
    return STATUS.FAILED;
  }
  if (statusText.startsWith('🔧')) {
    return STATUS.NEEDS_BUILD;
  }
  return null;
}

/** The glyph an item's heading SHOULD carry, given its parsed state. */
function expectedGlyph(item) {
  if (item.state === STATUS.OPEN) {
    return item.needsHuman ? GLYPHS.OPEN_HUMAN : GLYPHS[STATUS.OPEN];
  }
  return GLYPHS[item.state] || null;
}

/**
 * Split an item comment into its FIELDS and its NOTES.
 *
 * Notes (drain observations, corrections, "why this is still blocked") are
 * appended to the item they belong to, each under a `---` rule — one comment
 * per test, its whole history in reading order, instead of a separate
 * "note for the item above" comment that stops making sense the moment
 * another item is enqueued between them.
 *
 * Fields are read only from above the boundary. A note routinely quotes the
 * item it discusses ("Expect is that the notify-me button does not appear"),
 * and every field regex here is body-wide and last-match-wins — so without
 * the split a note quoting `**Status:** OPEN` silently reopened a closed item.
 *
 * The boundary is the first rule AFTER the Status line, not the first rule in
 * the body. Items enqueued before this template routinely carry a rule
 * mid-body (the `---` above a "Generated by Claude Code" footer) with Status
 * appended below it; splitting on the first rule threw their Status away and
 * turned two live alate items into "malformed" — an invisible item, the one
 * failure this parser must never have. No Status line at all means no
 * boundary: the whole body stays fields, and the unparseable path is reached
 * exactly as before.
 */
function splitNotes(body) {
  const after = statusIndex(body);
  if (after === -1) {
    return { fields: body, notes: [] };
  }
  const rule = /^[ \t]*---[ \t]*$/gm;
  rule.lastIndex = after;
  const boundary = rule.exec(body);
  if (!boundary) {
    return { fields: body, notes: [] };
  }
  return {
    fields: body.slice(0, boundary.index),
    notes: body
      .slice(boundary.index + boundary[0].length)
      .split(/^[ \t]*---[ \t]*$/m)
      .map(n => n.trim())
      .filter(Boolean),
  };
}

function parseComment(comment) {
  const body = comment.body || '';

  // Device claims live on the same issue but are not tests. Without this
  // they land in the UNPARSEABLE bucket and read as malformed items.
  if (CLAIM_MARKER.test(body)) {
    return null;
  }

  // Bot notices post to this issue too — the OTA-publish record written by
  // eas-update.yml is the common one. They carry a `###` heading and no
  // Status, so without this they pile into the UNPARSEABLE bucket and the
  // board nags about "malformed items" that were never items. Six of nine
  // flagged comments on alate#562 were exactly this.
  if (isNotice(body)) {
    return null;
  }

  // Fields above the first `---`, notes below it. See splitNotes: a note
  // quoting the item it discusses must never be read as the item's own
  // fields.
  const { fields, notes } = splitNotes(body);

  // A title is `### Foo`, or a `**Foo**` opening the FIRST non-empty line —
  // the bold form predates the heading convention and some enqueues still
  // use it. First line only, deliberately: a bold run anywhere in the body
  // is ordinary prose (`**Why:** …`, `**Pre-req:** …`), and matching those
  // turned explanatory drain notes into phantom malformed items.
  const firstLine = fields.split('\n').find(l => l.trim() !== '') || '';
  const headingMatch = fields.match(/^###\s*(.+)$/m);

  // Some enqueued items arrive as ONE long line (fields joined with " — "
  // instead of newline bullets). Every field capture therefore stops at the
  // next bold **Field:** marker, not just at end-of-line — otherwise a
  // single-line item's "title" or "Needs runtime" swallows the whole body
  // and the board renders a word wall.
  const NEXT_FIELD = /\s*(?:[·—–|-]+\s*)?\*\*[A-Z][^*]*:\*\*[\s\S]*$/;
  const fieldValue = match =>
    match ? match[1].replace(NEXT_FIELD, '').trim() : null;

  const statusMatch = findStatus(fields);
  const statusText = statusMatch
    ? statusMatch[1].replace(NEXT_FIELD, '').trim()
    : null;
  const namedState = statusText === null ? null : statusState(statusText);

  // IS THIS COMMENT AN ATTEMPTED QUEUE ITEM AT ALL?
  //
  // A heading alone does not make one. The queue issue also carries drain
  // corrections and replies that are written like little documents — real
  // shape, alate#562 comment 5571959196: `### ⚠️ Correction to
  // <item> — it cannot be run on the dev store`, with a closing sentence
  // that opens `**Status:**` and then says, in prose, why another item is
  // blocked. Nothing in it is a test, but it has a heading and a
  // Status-shaped line, so the parser filed it as a malformed item and the
  // board asked a human to go look at it — every day, forever.
  //
  // Three signals say "item", any one of them is enough, and they are
  // exactly the ones standards/workflows.md already names:
  //   1. the heading opens with an item glyph (🤖 🙋 🔧 ⚪ 🔴) — a comment
  //      declaring itself an item is one, even if it parses no further;
  //   2. the body carries the SHAPE of a test — `**Steps:**` / `**Expect`;
  //   3. the Status line names one of the four defined states.
  // A comment with none of the three is commentary. Skipping it is the
  // documented behaviour ("notes and bot notices are left alone"), not a
  // new rule — the parser was simply reading "has a heading" as signal 2.
  const declaresItemGlyph = Boolean(
    headingMatch && ITEM_GLYPH_OPENER.test(headingMatch[1])
  );

  // The COLON is load-bearing. `**Expect` alone also matches the opening of
  // `**Expect correction for item 5572382793 — and why it FAILed…**`, a real
  // alate#562 comment (5575634751) that is a correction to another item and
  // contains no test at all. `Expected:` is the legacy spelling of the field
  // and stays accepted.
  const looksLikeTest = /\*\*Steps:\*\*|\*\*Expect(?:ed)?:\*\*/.test(fields);
  const isItem = declaresItemGlyph || looksLikeTest || namedState !== null;

  // A bold opener counts as a TITLE on the same evidence. Widening it from
  // "has Steps/Expect" to "is an item" is what finally reads alate#562
  // comment 5469277783 — a legacy item opening `**HUMAN: re-verify** — Tab
  // bar / Recent-card mis-tap fix`, closed `✅ done` by a drain but written
  // before Steps/Expect were fields, so the old rule refused it a title and
  // reported a CLOSED test as malformed.
  const boldTitleMatch =
    !headingMatch && isItem ? firstLine.match(/^\s*\*\*(.+?)\*\*/) : null;

  const titleMatch = headingMatch || boldTitleMatch;

  // Neither a title nor a Status field — this is plain commentary (a drain
  // note, a discussion reply), not an attempted queue item. Ignore it.
  if (!titleMatch && !statusMatch) {
    return null;
  }

  // Dressed like a document, but none of the three item signals — see above.
  if (!isItem) {
    return null;
  }

  // Has one but not the other — looks like it was meant to be an item but
  // the format drifted. Surface it rather than silently dropping it.
  if (!titleMatch || !statusMatch) {
    return {
      state: STATUS.UNPARSEABLE,

      // What is actually wrong, in the words of the repair that fixes it
      // (SKILL.md Step 0.3). "27 comments don't match the format" is a wall
      // a human learns to scroll past; "no **Status:** line" is one PATCH.
      unparseableReason: statusMatch
        ? 'no title — add a `### <glyph> <id> — <intent>` heading'
        : 'no `**Status:**` line — append one so it enters the queue',
      title: fields.split('\n')[0].slice(0, 80) || '(empty comment)',
      testId: null,
      glyph: null,
      headingDrift: true,
      notes,
      commentUrl: comment.html_url,
      createdAt: comment.created_at,
    };
  }

  // Prefix match, NOT equality — see statusState. An item shaped like a test
  // whose Status names no defined state (`CLOSED`, `🅿️ PARKED`) stays
  // UNPARSEABLE: the board genuinely cannot say where it stands, and that is
  // a human's call, not something to guess at.
  const state = namedState || STATUS.UNPARSEABLE;

  // The PR field can be a bare number, "none", or a markdown link
  // ([#601](url)) — pull the digits out rather than the raw token, since a
  // markdown link has no internal whitespace to stop a naive \S+ match on.
  const prFieldMatch = fields.match(
    /\*\*PR:\*\*\s*([^\n]+?)(?:\s*·\s*\*\*SHA|\s*$)/m
  );
  const prField = fieldValue(prFieldMatch) || '';
  const prNumMatch = /^none\b/i.test(prField) ? null : prField.match(/#(\d+)/);
  const pr = prNumMatch ? prNumMatch[1] : null;
  const deliveryMatch = fields.match(/\*\*Delivery:\*\*\s*(.+?)\s*$/m);
  const runtimeMatch = fields.match(/\*\*Needs runtime:\*\*\s*(.+?)\s*$/m);
  const stepsMatch = fields.match(
    /\*\*Steps:\*\*\s*([\s\S]+?)(?:\n- \*\*Expect|\n\n|\*\*Expect|$)/
  );

  // `<glyph> <test id> — <what the test intends to do>`. Every part is
  // optional so the hundreds of items enqueued before this template still
  // parse; what is missing shows up as headingDrift for the drain to stamp,
  // never as a dropped item.
  //
  // The id is read narrowly on purpose — 6+ digits, and an em/en dash after
  // it. GitHub comment ids are 10 digits, while a legacy heading that opens
  // with a number opens with a small one or a date ("2026-09-02 — drain
  // results"); a looser rule ate the "2026" as an id and left the title
  // reading "09-02 — drain results", which the restamp would then write back
  // as the item's intent.
  const rawTitle = fieldValue(titleMatch) || '';
  const headingParts = rawTitle.match(
    new RegExp(
      `^(?:(${ITEM_GLYPHS.join(
        '|'
      )})\\s*)?(?:(\\d{6,})\\s*[—–]\\s*)?([\\s\\S]+)$`
    )
  );
  const glyph = headingParts ? headingParts[1] || null : null;
  const testId = headingParts ? headingParts[2] || null : null;
  const title = headingParts ? headingParts[3].trim() : rawTitle;

  // Clipped: the reason is a nudge, not a transcript. A drifted Status runs
  // to a paragraph often enough that printing all of it buries every other
  // row — the same "nobody reads it" failure, differently caused.
  const shownStatus =
    statusText.length > 48 ? `${statusText.slice(0, 47)}…` : statusText;

  const item = {
    state,
    unparseableReason:
      namedState === null
        ? `\`**Status:** ${shownStatus}\` names no state ` +
          '(OPEN / ✅ done / ❌ failed / 🔧 needs build)'
        : null,
    title,
    testId,
    glyph,
    pr,
    delivery: fieldValue(deliveryMatch),
    needsRuntime: fieldValue(runtimeMatch),
    needsHuman: stepsMatch
      ? /HUMAN:/.test(stepsMatch[1])
      : /HUMAN:/.test(fields),
    statusText,
    notes,

    // >1 means this comment is hiding tests behind the one being reported —
    // see itemHeadingCount. Carried on the item rather than turned into
    // UNPARSEABLE on purpose: the FIRST test here is real, open and correctly
    // parsed, and dropping it off the board to complain about the second
    // would trade one invisible item for two.
    itemHeadings: itemHeadingCount(body),
    commentUrl: comment.html_url,
    createdAt: comment.created_at,
  };

  // The heading is a mirror of the Status line and of the comment's own id.
  // Drift means one of them was edited without the other — a ⚪ heading over
  // an OPEN item reads as finished to anyone scrolling the issue. The drain
  // restamps these (SKILL.md Step 0.3); it is never a reason to hide an item.
  item.headingDrift =
    glyph === null ||
    glyph !== expectedGlyph(item) ||
    testId === null ||
    testId !== String(comment.id);

  return item;
}

/**
 * One repo's queue, read from BOTH media for the length of the migration.
 *
 * The two halves are fetched independently and neither can take the other
 * down. That is not defensiveness for its own sake: the first version gated
 * the issue fetch behind finding the legacy queue issue, and badige — whose
 * legacy queue had already gone — showed an empty board while carrying a real
 * `device-test` issue. The same coupling would have blanked every board the
 * moment step 6 retires the legacy queues.
 *
 * A half that fails is NAMED, never silently dropped. Showing the surviving
 * half as if it were the whole queue is the one outcome worse than an error,
 * because a missing test looks exactly like a queue with nothing in it.
 */
async function fetchRepoQueue(repoDef) {
  const { repo } = repoDef;

  const issues = fetchLabelledIssues(repoDef).then(
    items => ({ items }),
    error => ({ items: [], error: error.message || String(error) })
  );

  const legacy = (async () => {
    // `gh api`, not `gh issue list --json`. The latter fails outright on
    // gh 2.98.0 ("invalid character '{' after object key") for every field
    // combination, which took the whole board down — the tool that is
    // supposed to answer "what is pending" printed only an error. The REST
    // endpoint returns the same data and is unaffected.
    const found = await gh([
      'api',
      `repos/${repo}/issues?labels=device-test-queue&state=open`,
    ]);

    // /issues also returns pull requests; they carry a `pull_request` key.
    const queues = parseGh(found, `${repo} legacy queue lookup`).filter(
      i => !i.pull_request
    );
    if (queues.length === 0) {
      // Retired or never created. Not an error — it is the END STATE of this
      // migration, and it must not read as a failure once every repo reaches
      // it.
      return { items: [], issueNumber: null, issueUrl: null };
    }
    const out = await gh([
      'api',
      `repos/${repo}/issues/${queues[0].number}/comments`,
      '--paginate',
    ]);
    return {
      items: parseGh(out, `${repo} queue comments`)
        .map(parseComment)
        .filter(Boolean),
      issueNumber: queues[0].number,
      issueUrl: queues[0].html_url,
    };
  })().then(
    result => result,
    error => ({
      items: [],
      issueNumber: null,
      issueUrl: null,
      error: error.message || String(error),
    })
  );

  const [fromIssues, fromComments] = await Promise.all([issues, legacy]);

  // Both halves unreadable means we know nothing about this repo — that is a
  // genuine error. One half down is a partial, reported as such.
  if (fromIssues.error && fromComments.error) {
    return { ...repoDef, error: fromIssues.error };
  }

  const partial = fromIssues.error
    ? `device-test issues unreadable (${fromIssues.error})`
    : fromComments.error
    ? `legacy queue unreadable (${fromComments.error})`
    : null;

  // No `claim` here any more. The device lock moved out of the app queues to
  // one issue per handset in litmus (RFD-003 §3), because the device is not
  // any one app's: a lock read off alate's queue was invisible to a drain
  // working mood-layer's, and every queue reported the phone free while a
  // fourth held it. `fetchDeviceClaims` answers it once, globally.
  return {
    ...repoDef,
    issueNumber: fromComments.issueNumber,
    issueUrl: fromComments.issueUrl,
    items: [...fromIssues.items, ...fromComments.items],
    issueCount: fromIssues.items.length,
    legacyCount: fromComments.items.length,
    partial,
  };
}

/**
 * Every `device-test` issue in one repo, open and closed.
 *
 * The REST issues endpoint with `labels=`, NOT the search API that RFD-003 §1
 * sketched. Search is indexed asynchronously, so an issue created seconds ago
 * is routinely missing from its results — and "enqueue a test, then read the
 * board" is the single most common thing anyone does here. A queue that can
 * fail to list what you just put in it is worse than a slow one. The REST
 * endpoint filters server-side on the label with no index in the path.
 *
 * `state=all` because a closed test is still the record of a pass, and `dtq
 * --all` shows them.
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

/**
 * Who holds each physical device right now, across every app.
 *
 * One fetch per device issue in litmus, not one per app queue — the lock is
 * global, so asking each queue separately was both wasteful and wrong: four
 * repos could each report the phone free while a drain on a fifth held it.
 *
 * A device whose issue cannot be read comes back with `error` rather than a
 * null claim. "Free" and "I could not tell" must never render the same way:
 * the whole point of the lock is that a session about to drive the handset
 * can distinguish them, and an unreadable lock is a reason to stop, not to
 * proceed.
 */
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
  GLYPHS,
  ITEM_GLYPHS,
  expectedGlyph,
  statusState,
  itemHeadingCount,
  splitNotes,

  // Re-exported so callers get the whole queue surface from one require.
  ...require('./claim-lib'),
  checkGhReady,
  parseComment,
  fetchRepoQueue,
  fetchDeviceClaims,
  collect,
  daysSince,
};
