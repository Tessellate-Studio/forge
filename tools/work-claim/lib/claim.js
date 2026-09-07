// Work claim — the 🚧 variant of the claim protocol, plus the GitHub plumbing
// the board and CLI need.
//
// WHY THIS EXISTS. Every session commits under the same GitHub account, so the
// byline never says who is on a thing. Sessions run in isolated worktrees they
// cannot see into from each other, and the planning docs a session is working
// from (an RFD, an ADR, a pitch) live in a branch nobody else has checked out.
// The result, reported 2026-09-07: agents repeatedly picking up work another
// agent already had in flight, with no way to find the session that held it.
//
// The claim is a comment on the issue/PR itself — where anyone already looks —
// and the item carries the `claimed` label so the whole board can be listed
// without crawling every comment in the org.
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
// The MECHANISM — heading, fields, HELD/RELEASED, heartbeat, staleness,
// resolution — lives in ./protocol.js and is shared with the 🔒 device claim.
// This file declares only what makes the work claim different.
//
// Keep in sync with standards/workflows.md → "Work claims".

const { execFile } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const {
  NOT_WAITING,
  field,
  setField,
  minutesSince,
  createClaimProtocol,
} = require('./protocol');

const execFileAsync = promisify(execFile);

/**
 * How long a claim may go completely silent before it reads as abandoned.
 *
 * SEVEN DAYS, and the first version got this badly wrong at 90 minutes by
 * copying the device claim without re-deriving it. The two locks have
 * OPPOSITE economics:
 *
 *   - The device lock guards a SCARCE resource. Exactly one session can hold
 *     the handset, and someone is actively blocked waiting for it, so a short
 *     window is worth the risk of cutting a live holder off.
 *   - A work claim guards NOTHING. Nobody is blocked waiting for it to
 *     expire — a session that wants the item reads the claim and decides.
 *     Expiring early buys no throughput at all, and costs the exact
 *     collision the claim exists to prevent.
 *
 * And real work is not continuous. Reported 2026-09-07: "I sometimes work on
 * an issue for 2 days or more. It's not necessary that the issue is
 * continuously worked on." A 90-minute window called that abandoned before
 * lunch. Idle is not abandoned; only silence measured in DAYS is evidence
 * that nobody is coming back.
 */
const STALE_MINUTES = 7 * 24 * 60;

/** Idle past this and the board says so, without treating it as abandoned —
 *  the honest middle between "working" and "gone". */
const QUIET_MINUTES = 8 * 60;

/** The label that makes the board listable in one API call per repo, and
 *  makes ownership visible in GitHub's own issue list without opening
 *  anything. Applied when a claim is posted, removed when it is released —
 *  and swept off by `wip sweep` once the last claim goes stale, because a
 *  session that crashed cannot remove its own label, and a `claimed` label
 *  left standing on abandoned work misleads exactly the person this feature
 *  is for. */
const CLAIM_LABEL = 'claimed';

const CLAIM_LABEL_COLOR = 'D93F0B';
const CLAIM_LABEL_DESC =
  'A Claude session is actively working this — see the 🚧 Work claim comment';

const OWNER = 'Tessellate-Studio';

/** Repos a board sweep covers. Wider than the device-test scope (which is
 *  mobile-app-only) because work claims are not about a phone. Override with
 *  FORGE_CLAIM_REPOS as a comma-separated list of keys or owner/name pairs. */
const REPOS = ['alate', 'mood-layer', 'badige', 'loom', 'forge', 'litmus'];

/**
 * The 🚧 variant. Its three extra fields ARE the point of the claim — they are
 * what another agent cannot derive: which session to resume, where the
 * in-flight code physically is, and what it is being built against.
 *
 * createClaimProtocol registers 🚧 as a notice glyph, so a work claim posted
 * on a device-test queue issue is skipped by that parser instead of filed as a
 * malformed item — with no hand-edit of another module, which is how the first
 * version of this had to do it.
 */
const PROTOCOL = createClaimProtocol({
  heading: 'Work claim',
  glyph: '🚧',
  staleMinutes: STALE_MINUTES,
  startedField: 'Started at',
  fields: [
    {
      name: 'Session',
      from: 'sessionRaw',
      render: o => {
        const host = o.host || 'unknown host';

        // A retrofitted claim — reconstructed from a worktree found on
        // disk — knows WHERE the work is but not WHICH session holds it.
        // Printing a resume command that cannot work would be worse than
        // saying so: the next agent would run it and get nothing.
        if (!o.sessionId || o.sessionId === 'unknown') {
          return `session not identified — reconstructed from the live worktree on ${host}`;
        }
        return `\`claude --resume ${o.sessionId}\` on ${host}`;
      },
    },
    {
      name: 'Worktree',
      from: 'worktreeRaw',
      render: o => `\`${o.worktree}\` (branch \`${o.branch || 'detached'}\`)`,
    },
    {
      // The issue a PR implements, or the PRs that carry an issue. Without
      // it a claim is a dead end: alate #696 merged while #707 continued the
      // same work, and nothing on either named the other.
      name: 'Related',
      from: 'relatedRaw',
      render: o => {
        const rel = (o.related || []).filter(Boolean);
        return rel.length ? rel.join(', ') : '—';
      },
    },
    {
      name: 'Docs',
      from: 'docsRaw',
      render: o => {
        const docs = (o.docs || []).filter(Boolean);
        return docs.length ? docs.join(', ') : '—';
      },
    },
  ],
  footer: ({ staleMinutes }) => [
    '_Written by forge (`wip claim`). Another session picking this up: resume the',
    'session above rather than starting over, and read the linked docs first. The',
    'claim ends when its holder closes it — `wip release` flips **Claim:** to',
    `RELEASED and drops the label. Only ${staleMinutes} min of total silence reads`,
    'as abandoned; a claim **Waiting on:** a human never expires._',
  ],
});

const CLAIM_MARKER = PROTOCOL.MARKER;

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

  // A short, human-readable holder name. The branch is the most legible
  // handle another agent has ("who is on feat/x?"); the session-id tail
  // disambiguates two sessions on one branch.
  const tail = sessionId === 'unknown' ? host : sessionId.slice(0, 8);
  const heldBy = branch ? `${branch} (${tail})` : `session ${tail}`;
  return { heldBy, sessionId, host, worktree: cwd, branch };
}

const claimBody = PROTOCOL.render;

/**
 * Parse, then split the two composite fields into the parts callers use. The
 * protocol hands back raw field text; which half of "`claude --resume X` on
 * HOST" is the session id is a fact about THIS variant, not about claims.
 */
function parseClaim(comment) {
  const parsed = PROTOCOL.parse(comment);
  if (!parsed) {
    return null;
  }

  const sessionRaw = parsed.sessionRaw || '';
  parsed.sessionId =
    (sessionRaw.match(/--resume\s+`?([^\s`]+)`?/) || [])[1] || null;
  parsed.host = (sessionRaw.match(/\son\s+(.+?)\s*$/) || [])[1] || null;

  const worktreeRaw = parsed.worktreeRaw || '';
  parsed.branch =
    (worktreeRaw.match(/branch\s+`?([^`)]+)`?\)?\s*$/) || [])[1] || null;
  parsed.worktree =
    worktreeRaw
      .replace(/\s*\(branch[^)]*\)\s*$/, '')
      .replace(/`/g, '')
      .trim() || null;

  const docsRaw = parsed.docsRaw || '—';
  parsed.docs = NOT_WAITING.test(docsRaw) ? '' : docsRaw;

  const relatedRaw = parsed.relatedRaw || '—';
  parsed.related = NOT_WAITING.test(relatedRaw) ? '' : relatedRaw;
  return parsed;
}

const activeClaim = PROTOCOL.active;
const releaseBody = PROTOCOL.release;

/**
 * Heartbeat, plus the one edit the shared protocol has no opinion on: docs
 * arrive AFTER the claim in the common case — a session claims the issue, then
 * /forge:plan writes the RFD it will build against. Merging rather than
 * replacing means a later touch cannot silently drop a link an earlier one
 * added.
 */
function touchBody(body, opts = {}) {
  const out = PROTOCOL.touch(body, opts);
  const adding = (opts.docs || []).filter(Boolean);
  if (!adding.length) {
    return out;
  }
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
  return setField(out, 'Docs', merged.join(', '), 'Waiting on');
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
 * Does this item carry a `claimed` label that nothing live justifies?
 *
 * OPEN item  — leaked ONLY when every claim is released, or silence has run
 *   past the (now seven-day) window. An open item that is merely quiet is
 *   NOT swept: work spread over days is normal, and stripping the label
 *   mid-job recreates the collision this exists to prevent.
 * CLOSED item — leaked when ANY claim is still HELD. The work is over, so a
 *   held claim there is one nobody closed; but a claim its holder RELEASED is
 *   the system working, and reporting that as a leak teaches the reader to
 *   ignore the sweep.
 */
function isLeaked(item, claims, active) {
  return item.closed ? (claims || []).some(c => c.held) : !active;
}

/**
 * Treat ACTIVITY ON THE ITEM as a heartbeat.
 *
 * `wip touch` is a thing a session has to remember, and the sessions most
 * likely to forget it are the long-running ones this window exists to
 * protect. But GitHub already knows when an item last moved — a push, a
 * commit on the PR, a comment, a review — and any of those is better
 * evidence that someone is on it than a heartbeat nobody ran.
 *
 * So a claim is as fresh as the LATER of its own `Last touch` and the
 * item's `updated_at`. This is what lets a claim survive a two-day piece of
 * work with a night in the middle: the branch moved yesterday, so the claim
 * is alive today, whether or not anyone remembered to touch it.
 */
function withItemActivity(claims, updatedAt) {
  const itemIdle = minutesSince(updatedAt);
  if (itemIdle === null) {
    return claims;
  }
  return claims.map(claim => {
    const idleMinutes =
      claim.idleMinutes === null
        ? itemIdle
        : Math.min(claim.idleMinutes, itemIdle);
    return {
      ...claim,
      idleMinutes,
      liveness: idleMinutes === itemIdle ? 'item activity' : 'heartbeat',
      stale: claim.waitingOnHuman ? false : idleMinutes > STALE_MINUTES,
      quiet: idleMinutes > QUIET_MINUTES,
    };
  });
}

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

/**
 * Every claimed item in one repo. The `claimed` label is what makes this one
 * request instead of a crawl: without it the only way to find claims is to
 * read the comments of every open issue and PR in the org.
 *
 * `leaked` is the sweep's input: the label is on the item, but nothing live
 * holds it. Two ways that happens, and the second was invisible until a real
 * merge exposed it on 2026-09-07:
 *
 *   1. every claim on an OPEN item has gone stale — the holder crashed and
 *      could not release its own claim;
 *   2. the item is CLOSED. Merging a PR does not release its claim, and a
 *      session that ends with the merge never gets to. Nothing legitimately
 *      holds a claim on finished work, so any claim there is leaked by
 *      definition — no staleness window needed.
 *
 * Case 2 is the COMMON one, and the original sweep could not see it at all:
 * the label query was `state=open`, so a merged PR kept its `claimed` label
 * forever while the board reported nothing wrong. `state` is a parameter now
 * — the board asks for open items (in-flight work is what it shows), the
 * sweep asks for all of them.
 */
async function fetchRepoClaims(repoDef, opts = {}) {
  const { repo } = repoDef;
  const state = opts.state || 'open';
  let items;
  try {
    const out = await gh([
      'api',
      `repos/${repo}/issues?labels=${CLAIM_LABEL}&state=${state}&per_page=100`,
      '--paginate',
    ]);

    // /issues returns pull requests too — both can be claimed, so both stay.
    items = JSON.parse(out || '[]').map(i => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      isPr: Boolean(i.pull_request),
      closed: i.state === 'closed',

      // GitHub already tracks when this item last moved; that is a better
      // liveness signal than a heartbeat somebody has to remember.
      updatedAt: i.updated_at,

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
        const claims = withItemActivity(
          JSON.parse(out || '[]')
            .map(parseClaim)
            .filter(Boolean),
          item.updatedAt
        );
        const claim = activeClaim(claims);

        // A closed item with any claim on it is leaked regardless of
        // staleness: the work is over, so nothing is legitimately held.
        const leaked = isLeaked(item, claims, claim);
        return { ...item, claim, claims, leaked };
      } catch (error) {
        // Unknown, NOT leaked — sweeping on a failed fetch would strip the
        // label off live work, which is the one thing the sweep must never do.
        return {
          ...item,
          claim: null,
          claims: [],
          leaked: false,
          error: error.message,
        };
      }
    }
  );

  return { ...repoDef, items: withClaims };
}

/**
 * @param {string} [repoFilter] one repo key, or all of them
 * @param {object} [opts] `state`: 'open' (default, what the board shows) or
 *   'all' (what the sweep must see — a leak on a merged PR is still a leak)
 */
async function collect(repoFilter, opts = {}, env = process.env) {
  const all = repoList(env);
  const targets = repoFilter
    ? all.filter(r => r.key === repoFilter || r.repo === slugRepo(repoFilter))
    : all;
  if (targets.length === 0) {
    throw new Error(
      `Unknown repo "${repoFilter}". Known: ${all.map(r => r.key).join(', ')}`
    );
  }
  return Promise.all(targets.map(r => fetchRepoClaims(r, opts)));
}

/** Every item whose label outlived its claim, flattened across repos. */
function leakedItems(results) {
  const out = [];
  (results || []).forEach(r => {
    if (r.error) {
      return;
    }
    (r.items || []).forEach(item => {
      if (item.leaked) {
        out.push({ ...item, repo: r.repo, key: r.key });
      }
    });
  });
  return out;
}

module.exports = {
  STALE_MINUTES,
  QUIET_MINUTES,
  withItemActivity,
  PROTOCOL,
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
  isLeaked,
  leakedItems,
};
