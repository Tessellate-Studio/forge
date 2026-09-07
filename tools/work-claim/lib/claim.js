// Work claim — a soft lock announcing WHICH SESSION is working an issue or PR.
//
// WHY THIS EXISTS. Every session commits under the same GitHub account, so the
// byline never says who is on a thing. Sessions run in isolated worktrees they
// cannot see into from each other, and the planning docs a session is working
// from (an RFD, an ADR, a pitch) live in a branch nobody else has checked out.
// The result, reported 2026-09-07: agents repeatedly picking up work another
// agent already had in flight, with no way to find the session that held it.
//
// The device-test queue already solved the narrow version of this for one
// shared handset (`skills/device-test/scripts/claim-lib.js` — the 🔒 claim).
// This is the same lock generalised off that one pinned issue and onto ANY
// tracked item: the claim is a comment on the issue/PR itself, so it is where
// anyone already looks, and the item carries the `claimed` label so the whole
// board can be listed without crawling every comment in the org.
//
// It carries the three things another agent actually needs and cannot derive:
//   1. the SESSION — `claude --resume <id>`, so the work can be continued
//      rather than restarted;
//   2. the WORKTREE + branch — where the in-flight code physically is;
//   3. the DOCS — the RFD/ADR/pitch this work is being built against.
//
// It is advisory. Nothing stops a second session opening the same issue; the
// point is to remove the ambiguity, which is the part that actually failed.
//
// HOW A CLAIM ENDS. Like the device claim: the holder closes it (edit
// `**Claim:**` to RELEASED, drop the label, minimize the comment). The only
// automatic escape hatch is SILENCE, not elapsed time — a session rewrites
// `**Last touch:**` at each natural checkpoint (a commit, a push, a phase
// boundary) and a claim reads as abandoned only after STALE_MINUTES with no
// touch at all. A claim parked on a human never expires, because human steps
// legitimately take hours.
//
// Keep in sync with standards/workflows.md → "Work claims".

const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execFileAsync = promisify(execFile);

/** Longer than the device claim's 30 min: a build can legitimately think, run
 *  a suite, and wait on CI without touching GitHub once. Long enough to cover
 *  a full test + review cycle; short enough that a crashed session clears
 *  within a working session rather than blocking the item all day. */
const STALE_MINUTES = 90;

/** 🚧 is deliberately outside both the device-test item glyph set
 *  (🤖 🙋 🔧 ⚪ 🔴) and its notice set (📦 🔒), so a work claim posted on the
 *  device-test queue issue is skipped by that parser instead of counting as a
 *  malformed item. See claim-lib.js → NOTICE_MARKER. */
const CLAIM_MARKER = /^###\s*🚧\s*Work claim\b/m;

/** The label that makes the board listable in one API call per repo, and
 *  makes ownership visible in GitHub's own issue list without opening
 *  anything. Applied when a claim is posted, removed when it is released. */
const CLAIM_LABEL = 'claimed';

const CLAIM_LABEL_COLOR = 'D93F0B';
const CLAIM_LABEL_DESC =
  'A Claude session is actively working this — see the 🚧 Work claim comment';

const OWNER = 'Tessellate-Studio';

/** Repos a board sweep covers. Wider than the device-test scope (which is
 *  mobile-app-only) because work claims are not about a phone. Override with
 *  FORGE_CLAIM_REPOS as a comma-separated list of keys or owner/name pairs. */
const REPOS = ['alate', 'mood-layer', 'badige', 'loom', 'forge'];

/** Placeholders in **Waiting on:** that mean "parked on nothing". */
const NOT_WAITING = /^(?:—|–|-|none|nothing|n\/a)$/i;

function slugRepo(name) {
  return name.includes('/') ? name : `${OWNER}/${name}`;
}

function repoList(env = process.env) {
  const raw = (env.FORGE_CLAIM_REPOS || '').trim();
  const keys = raw
    ? raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : REPOS;
  return keys.map(key => ({ key: key.split('/').pop(), repo: slugRepo(key) }));
}

function field(body, name) {
  const pattern = new RegExp(
    `^\\s*[-*]?\\s*\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`,
    'm'
  );
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Who this session is, from the environment rather than from anything the
 * model has to remember. CLAUDE_CODE_SESSION_ID is set in every Claude Code
 * session and is exactly the id `claude --resume` takes, which is what makes
 * a claim actionable instead of merely informative.
 */
function identity(opts = {}) {
  const env = opts.env || process.env;
  const cwd = opts.cwd || process.cwd();
  const host = opts.host || os.hostname();
  const branch = opts.branch || null;
  const sessionId = env.CLAUDE_CODE_SESSION_ID || 'unknown';
  const worktree = cwd;

  // A short, human-readable holder name. The branch is the most legible
  // handle another agent has ("who is on feat/x?"); the session-id tail
  // disambiguates two sessions on one branch.
  const tail = sessionId === 'unknown' ? host : sessionId.slice(0, 8);
  const heldBy = branch ? `${branch} (${tail})` : `session ${tail}`;
  return { heldBy, sessionId, host, worktree, branch };
}

/**
 * Render a claim comment body.
 * Keep in sync with standards/workflows.md → "Work claims".
 */
function claimBody(opts) {
  const at = opts.at || new Date().toISOString();
  const docs = (opts.docs || []).filter(Boolean);
  const branch = opts.branch || 'detached';
  const session = `\`claude --resume ${opts.sessionId || 'unknown'}\` on ${
    opts.host || 'unknown host'
  }`;
  return [
    '### 🚧 Work claim',
    `- **Claimed by:** ${opts.heldBy}`,
    `- **Session:** ${session}`,
    `- **Worktree:** \`${opts.worktree}\` (branch \`${branch}\`)`,
    `- **Started at:** ${at}`,
    `- **Last touch:** ${opts.lastTouch || at}`,
    `- **Docs:** ${docs.length ? docs.join(', ') : '—'}`,
    `- **Waiting on:** ${opts.waitingOn || '—'}`,
    `- **Claim:** ${opts.held === false ? 'RELEASED' : 'HELD'}`,
    '',
    '_Written by forge (`wip claim`). Another session picking this up: resume the',
    'session above rather than starting over, and read the linked docs first. The',
    'claim ends when its holder closes it — `wip release` flips **Claim:** to',
    `RELEASED and drops the label. Only ${STALE_MINUTES} min of total silence reads`,
    'as abandoned; a claim **Waiting on:** a human never expires._',
  ].join('\n');
}

function parseClaim(comment) {
  const body = (comment && comment.body) || '';
  if (!CLAIM_MARKER.test(body)) {
    return null;
  }

  const waitingOn = field(body, 'Waiting on') || '—';
  const waitingOnHuman = !NOT_WAITING.test(waitingOn);
  const startedAt = field(body, 'Started at');

  // Claims written before the heartbeat existed carry only Started at; read
  // them against that so nothing already posted has to be rewritten.
  const lastTouch = field(body, 'Last touch') || startedAt;
  const held = /^HELD$/i.test(field(body, 'Claim') || 'HELD');

  const idleMinutes = lastTouch
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(lastTouch).getTime()) / 60_000)
      )
    : null;

  const sessionRaw = field(body, 'Session') || '';
  const sessionId =
    (sessionRaw.match(/--resume\s+`?([^\s`]+)`?/) || [])[1] || null;
  const host = (sessionRaw.match(/\son\s+(.+?)\s*$/) || [])[1] || null;

  const worktreeRaw = field(body, 'Worktree') || '';
  const branch =
    (worktreeRaw.match(/branch\s+`?([^`)]+)`?\)?\s*$/) || [])[1] || null;
  const worktree =
    worktreeRaw
      .replace(/\s*\(branch[^)]*\)\s*$/, '')
      .replace(/`/g, '')
      .trim() || null;

  const docsRaw = field(body, 'Docs') || '—';
  const docs = NOT_WAITING.test(docsRaw) ? '' : docsRaw;

  return {
    commentId: comment.id || null,
    commentUrl: comment.html_url || null,
    heldBy: field(body, 'Claimed by') || 'unknown session',
    sessionId,
    host,
    worktree,
    branch,
    docs,
    startedAt,
    lastTouch,
    idleMinutes,
    waitingOn,
    waitingOnHuman,
    held,

    // Silence is the only abandonment signal, and a claim parked on a human
    // never goes silent in the sense that matters — the human is the delay.
    stale:
      !waitingOnHuman && idleMinutes !== null && idleMinutes >= STALE_MINUTES,
  };
}

/** The one live claim on an item, or null when it is free. */
function activeClaim(claims) {
  const live = (claims || []).filter(c => c && c.held && !c.stale);
  if (live.length === 0) {
    return null;
  }
  return live.reduce((a, b) =>
    (b.commentId || 0) > (a.commentId || 0) ? b : a
  );
}

/** Rewrite the heartbeat (and optionally the park) in place, leaving every
 *  other field exactly as its holder wrote it. */
function touchBody(body, opts = {}) {
  const lastTouch = opts.lastTouch || new Date().toISOString();
  let out = body;
  if (/\*\*Last touch:\*\*/.test(out)) {
    out = out.replace(
      /^(\s*[-*]?\s*\*\*Last touch:\*\*).*$/m,
      `$1 ${lastTouch}`
    );
  } else {
    // A claim from before the heartbeat existed — add the line rather than
    // rewriting the comment, so nothing its holder wrote is lost.
    out = out.replace(
      /^(\s*[-*]?\s*\*\*Started at:\*\*.*)$/m,
      `$1\n- **Last touch:** ${lastTouch}`
    );
    if (!/\*\*Last touch:\*\*/.test(out)) {
      out = out.replace(
        /^(\s*[-*]?\s*\*\*Claim:\*\*.*)$/m,
        `- **Last touch:** ${lastTouch}\n$1`
      );
    }
  }
  if (opts.waitingOn) {
    out = out.replace(
      /^(\s*[-*]?\s*\*\*Waiting on:\*\*).*$/m,
      `$1 ${opts.waitingOn}`
    );
  }

  // Docs arrive AFTER the claim in the common case: a session claims the
  // issue, then /forge:plan writes the RFD it will build against. Merging
  // rather than replacing means a later touch cannot silently drop a link an
  // earlier one added.
  const adding = (opts.docs || []).filter(Boolean);
  if (adding.length) {
    const current = field(out, 'Docs') || '—';
    const kept = NOT_WAITING.test(current)
      ? []
      : current
          .split(',')
          .map(d => d.trim())
          .filter(Boolean);
    const merged = [...kept];
    adding.forEach(d => {
      if (!merged.includes(d)) {
        merged.push(d);
      }
    });
    const line = `- **Docs:** ${merged.join(', ')}`;
    out = /\*\*Docs:\*\*/.test(out)
      ? out.replace(
          /^(\s*[-*]?\s*\*\*Docs:\*\*).*$/m,
          `$1 ${merged.join(', ')}`
        )
      : out.replace(/^(\s*[-*]?\s*\*\*Waiting on:\*\*.*)$/m, `${line}\n$1`);
  }
  return out;
}

function releaseBody(body) {
  return body.replace(/^(\s*[-*]?\s*\*\*Claim:\*\*).*$/m, '$1 RELEASED');
}

/** One-line summary for the board / hook. Empty string when free. */
function describeClaim(claim) {
  if (!claim) {
    return '';
  }
  const idle = claim.idleMinutes === null ? '?' : claim.idleMinutes;
  const where = claim.branch ? ` on \`${claim.branch}\`` : '';
  const parked = claim.waitingOnHuman ? `, waiting on ${claim.waitingOn}` : '';
  return `🚧 claimed by ${claim.heldBy}${where} (last touch ${idle} min ago${parked})`;
}

/** Every gh call is bounded. Promise.race does NOT cancel the loser, so
 *  without this a timed-out board leaves gh children running after the caller
 *  has exited — on a SessionStart hook that is one orphan per slow start. */
const GH_TIMEOUT_MS = 10_000;

async function gh(args) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: GH_TIMEOUT_MS,
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

/**
 * Every claimed item in one repo. The `claimed` label is what makes this one
 * request instead of a crawl: without it the only way to find claims is to
 * read the comments of every open issue and PR in the org.
 */
const FETCH_CONCURRENCY = 5;

/** Promise.all with a ceiling on how many run at once. Order is preserved. */
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

async function fetchRepoClaims(repoDef) {
  const { repo } = repoDef;
  let items;
  try {
    const out = await gh([
      'api',
      `repos/${repo}/issues?labels=${CLAIM_LABEL}&state=open&per_page=100`,
      '--paginate',
    ]);

    // /issues returns pull requests too — both can be claimed, so both stay.
    items = JSON.parse(out || '[]').map(i => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      isPr: Boolean(i.pull_request),

      // per_page=100, not GitHub's default 30: the device-test queue issue
      // alate#562 alone carries hundreds of comments, and --paginate would
      // walk it 30 at a time.
      commentsUrl: `repos/${repo}/issues/${i.number}/comments?per_page=100`,
    }));
  } catch (error) {
    return { ...repoDef, error: error.message || String(error), items: [] };
  }

  // One gh subprocess per claimed item, so an unbounded Promise.all would
  // spawn as many processes as the org has claims — on session start, on
  // every machine. Cap the concurrency instead; the board is small, and the
  // cap is what keeps its worst case constant rather than proportional.
  const withClaims = await mapWithLimit(
    items,
    FETCH_CONCURRENCY,
    async item => {
      try {
        const out = await gh(['api', item.commentsUrl, '--paginate']);
        const claims = JSON.parse(out || '[]')
          .map(parseClaim)
          .filter(Boolean);
        return { ...item, claim: activeClaim(claims), claims };
      } catch (error) {
        return { ...item, claim: null, claims: [], error: error.message };
      }
    }
  );

  return { ...repoDef, items: withClaims };
}

async function collect(repoFilter, env = process.env) {
  const all = repoList(env);
  const targets = repoFilter
    ? all.filter(r => r.key === repoFilter || r.repo === slugRepo(repoFilter))
    : all;
  if (targets.length === 0) {
    throw new Error(
      `Unknown repo "${repoFilter}". Known: ${all.map(r => r.key).join(', ')}`
    );
  }
  return Promise.all(targets.map(fetchRepoClaims));
}

module.exports = {
  STALE_MINUTES,
  CLAIM_MARKER,
  CLAIM_LABEL,
  CLAIM_LABEL_COLOR,
  CLAIM_LABEL_DESC,
  REPOS,
  OWNER,
  slugRepo,
  repoList,
  identity,
  claimBody,
  parseClaim,
  activeClaim,
  touchBody,
  releaseBody,
  describeClaim,
  gh,
  mapWithLimit,
  checkGhReady,
  fetchRepoClaims,
  collect,
};
