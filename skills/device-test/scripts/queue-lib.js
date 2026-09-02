// Shared fetch/parse core for the device-test queue — used by both the
// on-demand status-board CLI (dtq / device-test-status) and the SessionStart
// hook (hooks/device-test-status.mjs). No chalk/commander here so the hook
// can pull it in without a TTY-formatting dependency.
//
// Parses the fixed comment format from standards/workflows.md → "Device-test
// queue" — keep both in sync if that format changes.

const { execFile } = require('child_process');
const { promisify } = require('util');

const {
  CLAIM_MARKER,
  NOTICE_MARKER,
  parseClaim,
  activeClaim,
} = require('./claim-lib');

const execFileAsync = promisify(execFile);

// Scope table — keep in sync with skills/device-test/SKILL.md.
const REPOS = [
  { key: 'alate', repo: 'Tessellate-Studio/alate' },
  { key: 'mood-layer', repo: 'Tessellate-Studio/mood-layer' },
  { key: 'badige', repo: 'Tessellate-Studio/badige' },
];

const STATUS = {
  OPEN: 'open',
  DONE: 'done',
  FAILED: 'failed',
  NEEDS_BUILD: 'needs_build',
  UNPARSEABLE: 'unparseable',
};

async function gh(args) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function checkGhReady() {
  try {
    await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf8' });
    return { ok: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        ok: false,
        message:
          'gh CLI not found. Install it from https://cli.github.com/ and run `gh auth login`.',
      };
    }
    return {
      ok: false,
      message: 'gh CLI is not authenticated. Run `gh auth login` first.',
    };
  }
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
  if (NOTICE_MARKER.test(body)) {
    return null;
  }

  // A title is `### Foo`, or a `**Foo**` opening the FIRST non-empty line —
  // the bold form predates the heading convention and some enqueues still
  // use it. First line only, deliberately: a bold run anywhere in the body
  // is ordinary prose (`**Why:** …`, `**Pre-req:** …`), and matching those
  // turned explanatory drain notes into phantom malformed items.
  const firstLine = body.split('\n').find(l => l.trim() !== '') || '';
  const headingMatch = body.match(/^###\s*(.+)$/m);

  // A bold opener only counts as a TITLE when the body also carries the
  // shape of a test — Steps or Expect. Plenty of legitimate commentary
  // opens bold ("**Correction to the two comments above**") and quotes
  // **PR:** / **Delivery:** while discussing someone else's item; treating
  // those as malformed items is the nagging this whole pass exists to stop.
  const looksLikeTest = /\*\*Steps:\*\*|\*\*Expect/.test(body);
  const boldTitleMatch =
    !headingMatch && looksLikeTest
      ? firstLine.match(/^\s*\*\*(.+?)\*\*/)
      : null;

  const titleMatch = headingMatch || boldTitleMatch;
  const statusMatch = body.match(/\*\*Status:\*\*\s*(.+?)\s*$/m);

  // Neither a title nor a Status field — this is plain commentary (a drain
  // note, a discussion reply), not an attempted queue item. Ignore it.
  if (!titleMatch && !statusMatch) {
    return null;
  }

  // Has one but not the other — looks like it was meant to be an item but
  // the format drifted. Surface it rather than silently dropping it.
  if (!titleMatch || !statusMatch) {
    return {
      state: STATUS.UNPARSEABLE,
      title: body.split('\n')[0].slice(0, 80) || '(empty comment)',
      commentUrl: comment.html_url,
      createdAt: comment.created_at,
    };
  }

  // Some enqueued items arrive as ONE long line (fields joined with " — "
  // instead of newline bullets). Every field capture therefore stops at the
  // next bold **Field:** marker, not just at end-of-line — otherwise a
  // single-line item's "title" or "Needs runtime" swallows the whole body
  // and the board renders a word wall.
  const NEXT_FIELD = /\s*(?:[·—–|-]+\s*)?\*\*[A-Z][^*]*:\*\*[\s\S]*$/;
  const fieldValue = match =>
    match ? match[1].replace(NEXT_FIELD, '').trim() : null;

  const statusText = statusMatch[1].replace(NEXT_FIELD, '').trim();
  let state = STATUS.UNPARSEABLE;

  // Prefix match, NOT equality. `**Status:** OPEN — routed to another agent`
  // is a perfectly ordinary thing for a session to write, and an equality
  // check turned it into UNPARSEABLE — so a still-open item vanished from the
  // board entirely rather than showing as open. Silently losing work is the
  // worst failure this parser can have; a trailing note must not cause it.
  if (/^OPEN\b/.test(statusText)) {
    state = STATUS.OPEN;
  } else if (statusText.startsWith('✅')) {
    state = STATUS.DONE;
  } else if (statusText.startsWith('❌')) {
    state = STATUS.FAILED;
  } else if (statusText.startsWith('🔧')) {
    state = STATUS.NEEDS_BUILD;
  }

  // The PR field can be a bare number, "none", or a markdown link
  // ([#601](url)) — pull the digits out rather than the raw token, since a
  // markdown link has no internal whitespace to stop a naive \S+ match on.
  const prFieldMatch = body.match(
    /\*\*PR:\*\*\s*([^\n]+?)(?:\s*·\s*\*\*SHA|\s*$)/m
  );
  const prField = fieldValue(prFieldMatch) || '';
  const prNumMatch = /^none\b/i.test(prField) ? null : prField.match(/#(\d+)/);
  const pr = prNumMatch ? prNumMatch[1] : null;
  const deliveryMatch = body.match(/\*\*Delivery:\*\*\s*(.+?)\s*$/m);
  const runtimeMatch = body.match(/\*\*Needs runtime:\*\*\s*(.+?)\s*$/m);
  const stepsMatch = body.match(
    /\*\*Steps:\*\*\s*([\s\S]+?)(?:\n- \*\*Expect|\n\n|\*\*Expect|$)/
  );

  return {
    state,
    title: fieldValue(titleMatch),
    pr,
    delivery: fieldValue(deliveryMatch),
    needsRuntime: fieldValue(runtimeMatch),
    needsHuman: stepsMatch ? /HUMAN:/.test(stepsMatch[1]) : /HUMAN:/.test(body),
    statusText,
    commentUrl: comment.html_url,
    createdAt: comment.created_at,
  };
}

async function fetchRepoQueue(repoDef) {
  const { repo } = repoDef;
  let issueNumber = null;
  let issueUrl = null;
  try {
    // `gh api`, not `gh issue list --json`. The latter fails outright on
    // gh 2.98.0 ("invalid character '{' after object key") for every field
    // combination, which took the whole board down — the tool that is
    // supposed to answer "what is pending" printed only an error. The REST
    // endpoint returns the same data and is unaffected.
    const out = await gh([
      'api',
      `repos/${repo}/issues?labels=device-test-queue&state=open`,
    ]);

    // /issues also returns pull requests; they carry a `pull_request` key.
    const issues = JSON.parse(out || '[]')
      .filter(i => !i.pull_request)
      .map(i => ({ number: i.number, url: i.html_url }));
    if (issues.length === 0) {
      return { ...repoDef, issueNumber: null, issueUrl: null, items: [] };
    }
    issueNumber = issues[0].number;
    issueUrl = issues[0].url;
  } catch (error) {
    return { ...repoDef, error: error.message || String(error) };
  }

  try {
    const out = await gh([
      'api',
      `repos/${repo}/issues/${issueNumber}/comments`,
      '--paginate',
    ]);
    const comments = JSON.parse(out || '[]');
    const items = comments.map(parseComment).filter(Boolean);
    const claims = comments.map(parseClaim).filter(Boolean);
    return {
      ...repoDef,
      issueNumber,
      issueUrl,
      items,

      // null when the device is free (never claimed, released, or stale).
      claim: activeClaim(claims),
    };
  } catch (error) {
    return {
      ...repoDef,
      issueNumber,
      issueUrl,
      error: error.message || String(error),
    };
  }
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

function daysSince(iso) {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

module.exports = {
  REPOS,
  STATUS,

  // Re-exported so callers get the whole queue surface from one require.
  ...require('./claim-lib'),
  checkGhReady,
  parseComment,
  fetchRepoQueue,
  collect,
  daysSince,
};
