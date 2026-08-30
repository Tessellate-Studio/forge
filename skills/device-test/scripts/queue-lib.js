// Shared fetch/parse core for the device-test queue — used by both the
// on-demand status-board CLI (dtq / device-test-status) and the SessionStart
// hook (hooks/device-test-status.mjs). No chalk/commander here so the hook
// can pull it in without a TTY-formatting dependency.
//
// Parses the fixed comment format from standards/workflows.md → "Device-test
// queue" — keep both in sync if that format changes.

const { execFile } = require('child_process');
const { promisify } = require('util');

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
  const titleMatch = body.match(/^###\s*(.+)$/m);
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
  if (statusText === 'OPEN') {
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
    const out = await gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--label',
      'device-test-queue',
      '--state',
      'open',
      '--json',
      'number,url',
    ]);
    const issues = JSON.parse(out || '[]');
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
    return { ...repoDef, issueNumber, issueUrl, items };
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
  checkGhReady,
  parseComment,
  fetchRepoQueue,
  collect,
  daysSince,
};
