#!/usr/bin/env node

// wip / forge-wip — who is working on what, across every Tessellate repo.
//
// Default (no subcommand) is a READ-ONLY board, same shape as `dtq`: every
// issue and PR carrying the `claimed` label, who holds it, which worktree the
// code is in, which session to resume, and how long it has been quiet.
//
// The write subcommands are the ones a session runs on itself:
//   wip claim <repo#n>    — post a claim + label the item (picking work up)
//   wip touch <repo#n>    — rewrite the heartbeat (at each commit/push/phase)
//   wip release <repo#n>  — flip to RELEASED, drop the label, minimize
//
// The claim format and its lifecycle live in standards/workflows.md →
// "Work claims"; the parser is tools/work-claim/lib/claim.js.

const { Command } = require('commander');
const chalk = require('chalk');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const {
  CLAIM_LABEL,
  CLAIM_LABEL_COLOR,
  CLAIM_LABEL_DESC,
  STALE_MINUTES,
  slugRepo,
  repoList,
  identity,
  claimBody,
  parseClaim,
  activeClaim,
  touchBody,
  releaseBody,
  gh,
  checkGhReady,
  collect,
  leakedItems,
  failedRepos,
  mapWithLimit,
  claimDetails,
} = require('./lib/claim');
const { stripCode, NOT_WAITING, clip, humanIdle } = require('./lib/protocol');

/**
 * Every "is this claim mine?" test compares session ids. Outside Claude Code
 * there is no CLAUDE_CODE_SESSION_ID, so `identity()` reports `unknown` — and
 * two such callers would read as the SAME session, letting one silently
 * heartbeat or release the other's claim. Releasing someone else's claim is
 * the one thing the standard forbids outright, so an unidentifiable caller has
 * to say which claim it means rather than matching by identity.
 */
function isMine(claim, me) {
  return (
    Boolean(claim.sessionId) &&
    me.sessionId !== 'unknown' &&
    claim.sessionId === me.sessionId
  );
}

function refuseAnonymous(action) {
  console.error(
    chalk.red(
      `No CLAUDE_CODE_SESSION_ID in this environment, so ${action} cannot tell ` +
        "your claim from another session's."
    )
  );
  console.error(
    chalk.gray(
      'Set CLAUDE_CODE_SESSION_ID, or act on the comment directly on GitHub. ' +
        '`wip release --all` releases every live claim on an item, deliberately.'
    )
  );
  process.exit(2);
}

/** The same five lines opened board, scan and sweep. */
async function requireGh() {
  const ready = await checkGhReady();
  if (!ready.ok) {
    console.error(chalk.red(ready.message));
    process.exit(1);
  }
}

/** `alate#42`, `alate 42`, or a full GitHub URL — all name one item. */
function parseTarget(target) {
  const url = target.match(
    /github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/
  );
  if (url) {
    return { repo: url[1], number: Number(url[2]) };
  }
  const short = target.match(/^([^#\s]+)[#\s]+(\d+)$/);
  if (short) {
    return { repo: slugRepo(short[1]), number: Number(short[2]) };
  }
  throw new Error(
    `Cannot read "${target}" as an item. Use alate#42, "alate 42", or the issue/PR URL.`
  );
}

async function currentBranch() {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8' }
    );
    const name = stdout.trim();
    return name === 'HEAD' ? null : name;
  } catch {
    return null;
  }
}

async function findClaimComments(repo, number) {
  // per_page=100, not GitHub's default 30 — a long thread otherwise costs
  // three times the round trips.
  const out = await gh([
    'api',
    `repos/${repo}/issues/${number}/comments?per_page=100`,
    '--paginate',
  ]);
  return JSON.parse(out || '[]')
    .map(c => ({ raw: c, claim: parseClaim(c) }))
    .filter(c => c.claim);
}

/**
 * The issues/PRs this item is bound to, so a claim is not a dead end.
 *
 * Two sources, because they catch different things: closing keywords in the
 * body name the ticket a PR implements, and GitHub's own cross-reference
 * timeline catches the follow-up nobody wrote a keyword for. alate #696
 * merged while #707 carried the same work forward, and only the timeline
 * knew they were related.
 *
 * Best-effort: a claim with no Related line is still a claim, so every
 * failure here degrades to an empty list rather than blocking the claim.
 */
async function relatedRefs(repo, number) {
  const refs = new Set();
  try {
    const out = await gh([
      'api',
      `repos/${repo}/issues/${number}`,
      '--jq',
      '.body // ""',
    ]);

    // stripCode first: a body that DOCUMENTS this syntax contains this
    // syntax, and the scanner would read the documentation as data.
    const closing = stripCode(out).match(
      /\b(?:fixes|closes|resolves)\s+#(\d+)/gi
    );
    (closing || []).forEach(m => refs.add(`closes #${m.match(/\d+/)[0]}`));
  } catch {
    /* body unreadable — the timeline may still have something */
  }
  try {
    const out = await gh([
      'api',
      `repos/${repo}/issues/${number}/timeline?per_page=100`,
      '--paginate',
      '--jq',
      '[.[] | select(.event=="cross-referenced") | .source.issue.number] | unique | .[]',
    ]);
    out
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean)
      .forEach(n => {
        if (![...refs].some(r => r.endsWith(`#${n}`))) {
          refs.add(`#${n}`);
        }
      });
  } catch {
    /* no timeline access — a claim without Related is still useful */
  }

  // Verify every ref resolves IN THIS REPO before writing it down. Issue
  // numbers are repo-scoped, so a number lifted from prose about another
  // repo points at something unrelated here, or at nothing — and a Related
  // line that goes nowhere is worse than none, because it is followed.
  const candidates = [...refs].slice(0, 6);
  const verified = [];
  for (const ref of candidates) {
    const num = (ref.match(/#(\d+)/) || [])[1];
    if (!num) {
      continue;
    }
    try {
      await gh(['api', `repos/${repo}/issues/${num}`, '--jq', '.number']);
      verified.push(ref);
    } catch {
      /* no such item here — drop it rather than link a dead end */
    }
  }
  return verified;
}

/** Create the label if the repo has never had one. Idempotent — an existing
 *  label makes `gh label create` fail, which is not an error here. */
function addLabel(repo, number) {
  return gh([
    'api',
    `repos/${repo}/issues/${number}/labels`,
    '-f',
    `labels[]=${CLAIM_LABEL}`,
  ]);
}

/** True when the label attached; false on any failure. */
async function tryLabel(repo, number) {
  try {
    await addLabel(repo, number);
    return true;
  } catch {
    return false;
  }
}

async function ensureLabel(repo) {
  try {
    await gh([
      'label',
      'create',
      CLAIM_LABEL,
      '--repo',
      repo,
      '--color',
      CLAIM_LABEL_COLOR,
      '--description',
      CLAIM_LABEL_DESC,
    ]);
  } catch {
    /* already exists — the only outcome we care about is that it is there */
  }
}

// ---------------------------------------------------------------- board ----

function renderRepo(result) {
  const lines = [];
  const header = chalk.bold(result.key);

  if (result.error) {
    lines.push(`${header}  ${chalk.red(`error: ${result.error}`)}`);
    return lines;
  }

  const claimed = result.items.filter(i => i.claim);
  const abandoned = result.items.filter(
    i => !i.claim && i.claims.some(c => c.held)
  );

  if (claimed.length === 0 && abandoned.length === 0) {
    return lines; // nothing in flight here — say nothing, same as dtq
  }

  lines.push(`${header}  ${chalk.gray(`${claimed.length} in flight`)}`);

  claimed.forEach(item => {
    const c = item.claim;
    const kind = item.isPr ? chalk.magenta('PR ') : chalk.cyan('ISS');

    // Idle is reported in the largest honest unit, and QUIET is not a
    // warning — multi-day work is normal, so only real silence is yellow.
    const tint = c.quiet ? chalk.yellow : chalk.gray;
    const idleText = tint(`${humanIdle(c.idleMinutes)} idle`);
    lines.push(
      `  ${kind} ${chalk.bold(`#${item.number}`)} ${clip(item.title, 46)}`
    );
    lines.push(
      `      ${chalk.green(c.heldBy)}  ${idleText}${
        c.waitingOnHuman ? chalk.yellow(`  ⏸ ${clip(c.waitingOn, 40)}`) : ''
      }`
    );
    claimDetails(c).forEach(([label, value, width]) => {
      lines.push(`      ${chalk.gray(label + clip(value, width))}`);
    });
    lines.push(`      ${chalk.gray(item.url)}`);
  });

  abandoned.forEach(item => {
    lines.push(
      `  ${chalk.gray('---')} ${chalk.bold(`#${item.number}`)} ${clip(
        item.title,
        46
      )}  ${chalk.yellow(
        `stale claim (>${STALE_MINUTES}m silent) — free to take over`
      )}`
    );
    lines.push(`      ${chalk.gray(item.url)}`);
  });

  return lines;
}

async function board(opts) {
  await requireGh();

  const results = await collect(opts.repo);
  const out = [];
  results.forEach(r => out.push(...renderRepo(r)));

  if (out.length === 0) {
    console.log(
      chalk.gray('Nothing claimed — no session is on a tracked item.')
    );
    return;
  }

  console.log('');
  console.log(chalk.bold('🚧 Work in flight'));
  console.log('');
  console.log(out.join('\n'));
  console.log('');
  console.log(
    chalk.gray(
      `A claim goes stale only after ${Math.round(
        STALE_MINUTES / (24 * 60)
      )} days of silence — ` +
        'quiet is not abandoned. Claims parked on a human never expire.'
    )
  );

  // The board is read-only, so it REPORTS the leak rather than fixing it —
  // but it must report it, because a `claimed` label whose claim has died is
  // the one state that actively misleads the person this tool is for.
  const leaked = leakedItems(results);
  if (leaked.length) {
    console.log(
      chalk.yellow(
        `${leaked.length} item(s) still labelled claimed with no live claim — ` +
          'run `wip sweep` to clear them.'
      )
    );
  }
  console.log('');
}

// ----------------------------------------------------------------- scan ----

/**
 * The other half of the board: items that LOOK actively worked and carry no
 * claim. The board can only ever show what has been claimed, so on its own it
 * makes unclaimed work look like no work — reported 2026-09-07, "I find quite
 * a few issues being actively worked on but no claimed label".
 *
 * Deliberately REPORTS rather than claims. Recent activity is evidence that
 * something moved, not that a session is sitting on it right now; auto-
 * claiming on that signal would refill the board with the fiction the narrow
 * retrofit was careful to avoid.
 */
async function scan(opts) {
  await requireGh();

  const days = Number(opts.days || 3);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const repos = repoList().filter(
    r => !opts.repo || r.key === opts.repo || r.repo === slugRepo(opts.repo)
  );

  const rows = [];

  // Parallel, and filtered server-side. The loop was sequential across six
  // repos and pulled 50 full issue objects each only to discard most of
  // them client-side; `since` is the same cutoff, applied by GitHub.
  await mapWithLimit(repos, 5, async r => {
    try {
      const out = await gh([
        'api',
        `repos/${r.repo}/issues?state=open&sort=updated&direction=desc` +
          `&since=${since.toISOString()}&per_page=50`,
      ]);
      JSON.parse(out || '[]')
        .filter(i => !(i.labels || []).some(l => l.name === CLAIM_LABEL))
        .filter(
          i =>
            opts.all ||
            !(
              i.user &&
              (i.user.type === 'Bot' || /dependabot/i.test(i.user.login))
            )
        )
        .forEach(i => {
          rows.push({
            key: r.key,
            number: i.number,
            title: i.title,
            isPr: Boolean(i.pull_request),
            updatedAt: i.updated_at,
            url: i.html_url,
          });
        });
    } catch (error) {
      console.error(chalk.red(`${r.key}: ${error.message}`));
    }
  });

  if (rows.length === 0) {
    console.log(
      chalk.gray(`Nothing unclaimed has moved in the last ${days} day(s).`)
    );
    return;
  }

  console.log('');
  console.log(
    chalk.bold(`Moved in the last ${days} day(s), with no claim on them`)
  );
  console.log('');
  rows
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .forEach(row => {
      const kind = row.isPr ? chalk.magenta('PR ') : chalk.cyan('ISS');
      console.log(
        `  ${kind} ${chalk.bold(`${row.key}#${row.number}`)} ${clip(
          row.title,
          44
        )}`
      );
      console.log(
        `      ${chalk.gray(
          `updated ${row.updatedAt.slice(0, 10)}  ${row.url}`
        )}`
      );
    });
  console.log('');
  console.log(
    chalk.gray(
      'Claim the ones a session is actually on: wip claim <repo>#<n>. ' +
        'Recent activity is not proof anyone is holding it.'
    )
  );
  console.log('');
}

// ---------------------------------------------------------------- sweep ----

/**
 * Drop the `claimed` label from every item whose claims are all released or
 * stale.
 *
 * WHY THIS EXISTS. `wip release` is the only thing that removes the label, and
 * it needs a session to still be alive to run it. A crashed session cannot
 * release its own claim — so the label outlives it, and GitHub's issue list
 * goes on saying someone is working an item that nobody is. That is worse than
 * no label at all: it misleads exactly the person the feature is for. The
 * 90-minute staleness rule already tells the BOARD to ignore such a claim;
 * this is what tells GITHUB.
 *
 * It never touches a live claim, never touches an item whose comments could
 * not be fetched (an unknown item is not a leaked one), and never edits a
 * comment body — the claim stays as the record of who held it and when they
 * went quiet.
 */
async function sweep(opts) {
  await requireGh();

  // state: 'all' — the leak that matters most sits on a MERGED PR, which
  // is closed, and the default open-only query cannot see it.
  const results = await collect(opts.repo, { state: 'all' });
  const leaked = leakedItems(results);

  // A repo that failed to fetch is NOT a clean repo. Reporting "nothing to
  // sweep" for one we could not read is how a tool says it is clean when it
  // means it never looked — mood-layer#112 sat merged-and-labelled through a
  // sweep that announced everything was fine.
  const failed = failedRepos(results);
  failed.forEach(f => {
    console.error(chalk.red(`${f.key}: could not check — ${f.error}`));
  });

  if (leaked.length === 0) {
    console.log(
      failed.length
        ? chalk.yellow(
            `No leaks in the ${
              results.length - failed.length
            } repo(s) checked; ` +
              `${failed.length} could not be read (above). Re-run to cover them.`
          )
        : chalk.gray('Nothing to sweep — every claimed item has a live claim.')
    );
    return;
  }

  for (const item of leaked) {
    const held = item.claims.filter(c => c.held);
    const last = held[held.length - 1];
    const why = item.closed
      ? `${
          item.isPr ? 'PR merged/closed' : 'issue closed'
        } with the claim still held`
      : last
      ? `last holder ${last.heldBy} went silent ${
          last.idleMinutes ?? '?'
        } min ago`
      : 'claim released, label left behind';

    if (opts.dryRun) {
      console.log(
        chalk.gray(`would sweep ${item.key}#${item.number} — ${why}`)
      );
      continue;
    }
    try {
      await gh([
        'api',
        '--method',
        'DELETE',
        `repos/${item.repo}/issues/${item.number}/labels/${CLAIM_LABEL}`,
      ]);
      console.log(chalk.green(`swept ${item.key}#${item.number} — ${why}`));
    } catch (error) {
      console.error(
        chalk.red(
          `could not sweep ${item.key}#${item.number}: ${error.message}`
        )
      );
    }
  }
}

// --------------------------------------------------------------- writes ----

async function claim(target, opts) {
  const { repo, number } = parseTarget(target);
  const existing = await findClaimComments(repo, number);
  const live = activeClaim(existing.map(e => e.claim));
  const me = identity({ branch: opts.branch || (await currentBranch()) });

  // `--worktree none` for a branch that exists only on origin: better an
  // explicit "none" than a path that is not on this branch.
  if (opts.worktree) {
    // NOT_WAITING is the one place "this value means nothing" is spelled.
    // A local copy here silently accepted `--worktree nothing` as a literal
    // path while rejecting `--worktree none`.
    me.worktree = NOT_WAITING.test(opts.worktree) ? null : opts.worktree;
  }

  if (live && !isMine(live, me) && !opts.force) {
    console.error(
      chalk.yellow(
        `${repo}#${number} is already claimed by ${live.heldBy} ` +
          `(last touch ${live.idleMinutes}m ago${
            live.waitingOnHuman ? `, waiting on ${live.waitingOn}` : ''
          }).`
      )
    );
    if (live.sessionId) {
      console.error(chalk.gray(`Resume it: claude --resume ${live.sessionId}`));
    }
    if (live.worktree) {
      console.error(chalk.gray(`Worktree:  ${live.worktree}`));
    }
    console.error(
      chalk.gray('Take it over anyway with --force (say so in your claim).')
    );
    process.exit(2);
  }

  // Already ours — refresh the heartbeat instead of stacking a second claim.
  const mine = existing.find(e => e.claim.held && isMine(e.claim, me));
  if (mine) {
    await touch(target, opts);
    return;
  }

  const body = claimBody({
    ...me,
    at: new Date().toISOString(),
    docs: opts.doc || [],
    related: opts.related || (await relatedRefs(repo, number)),
    waitingOn: opts.waitingOn,
  });

  await gh([
    'api',
    `repos/${repo}/issues/${number}/comments`,
    '-f',
    `body=${body}`,
  ]);

  // The comment is the claim; the label is only what makes the board
  // listable in one request. A repo where labelling fails (no write access
  // to labels, a fork PR) must still end up with a posted claim — losing the
  // claim over a cosmetic index would be the worse failure — but the caller
  // has to hear that `wip` will not show it.
  //
  // Add first, create only on failure: the label exists after the first
  // claim in a repo, so `gh label create` was a guaranteed-wasted subprocess
  // on every claim after that one.
  // Add first, create only on failure: the label exists after the first
  // claim in a repo, so `gh label create` was a guaranteed-wasted subprocess
  // on every claim after that one.
  const labelled = await tryLabel(repo, number);
  if (!labelled) {
    await ensureLabel(repo);
    const retried = await tryLabel(repo, number);
    if (!retried) {
      console.error(
        chalk.yellow(
          `Claim posted, but the "${CLAIM_LABEL}" label would not attach to ` +
            `${repo}#${number}. The board will not list it until it does.`
        )
      );
    }
  }

  console.log(chalk.green(`🚧 Claimed ${repo}#${number} as ${me.heldBy}.`));
  if (live && opts.force) {
    console.log(
      chalk.yellow(`Took over a claim held by ${live.heldBy} — tell them.`)
    );
  }
}

async function touch(target, opts) {
  const { repo, number } = parseTarget(target);

  // No currentBranch() here: touch rewrites a heartbeat on a claim that
  // already names its branch, so the git spawn would be pure waste — and this
  // is the hottest path in the tool, run at every commit and push.
  const me = identity();
  if (me.sessionId === 'unknown') {
    refuseAnonymous('touch'); // before the fetch — it would be thrown away
  }
  const existing = await findClaimComments(repo, number);
  const mine = existing.filter(e => e.claim.held && isMine(e.claim, me));

  if (mine.length === 0) {
    console.error(
      chalk.yellow(
        `No live claim of yours on ${repo}#${number} — run \`wip claim\` first.`
      )
    );
    process.exit(2);
  }

  const at = new Date().toISOString();
  await Promise.all(
    mine.map(e =>
      gh([
        'api',
        '--method',
        'PATCH',
        `repos/${repo}/issues/comments/${e.raw.id}`,
        '-f',
        `body=${touchBody(e.raw.body, {
          lastTouch: at,
          waitingOn: opts.waitingOn,
          docs: opts.doc || [],
        })}`,
      ])
    )
  );
  console.log(chalk.gray(`Heartbeat refreshed on ${repo}#${number}.`));
}

async function release(target, opts) {
  const { repo, number } = parseTarget(target);
  const me = identity(); // same as touch: the branch is not read here
  if (!opts.all && me.sessionId === 'unknown') {
    refuseAnonymous('release'); // before the fetch
  }
  const existing = await findClaimComments(repo, number);
  const mine = existing.filter(
    e => e.claim.held && (opts.all || isMine(e.claim, me))
  );

  if (mine.length === 0) {
    console.log(
      chalk.gray(`Nothing of yours to release on ${repo}#${number}.`)
    );
    return;
  }

  for (const e of mine) {
    await gh([
      'api',
      '--method',
      'PATCH',
      `repos/${repo}/issues/comments/${e.raw.id}`,
      '-f',
      `body=${releaseBody(e.raw.body)}`,
    ]);

    // Collapse it out of the thread — a released claim is noise, and only a
    // live 🚧 should be worth scrolling past. Same call the device-test drain
    // uses to minimize a done item.
    try {
      await gh([
        'api',
        'graphql',
        '-f',
        'query=mutation($id:ID!){minimizeComment(input:{subjectId:$id,classifier:RESOLVED}){clientMutationId}}',
        '-f',
        `id=${e.raw.node_id}`,
      ]);
    } catch {
      /* minimizing is cosmetic; RELEASED in the body is the source of truth */
    }
  }

  // Only drop the label once no live claim is left — another session may
  // legitimately still be on the same item. Derived from what we already
  // fetched: re-reading every comment to learn "which of these did I just
  // release" is a full paginated round trip for an answer we hold.
  const remaining = existing.filter(e => e.claim.held && !mine.includes(e));
  if (remaining.length === 0) {
    try {
      await gh([
        'api',
        '--method',
        'DELETE',
        `repos/${repo}/issues/${number}/labels/${CLAIM_LABEL}`,
      ]);
    } catch {
      /* label already gone */
    }
  }

  console.log(chalk.green(`Released ${repo}#${number}.`));
}

// ------------------------------------------------------------------ cli ----

const program = new Command();

program
  .name('wip')
  .description('Who is working on what — work claims across Tessellate repos')
  .version('1.0.0');

program
  .command('board', { isDefault: true })
  .description('Show every claimed issue/PR (read-only)')
  .option(
    '-r, --repo <key>',
    `limit to one repo (${repoList()
      .map(r => r.key)
      .join(', ')})`
  )
  .action(opts => board(opts).catch(fail));

program
  .command('sweep')
  .description(
    'Drop the label from items whose claim went stale — the backstop for a crashed session'
  )
  .option('-r, --repo <key>', 'limit to one repo')
  .option('-n, --dry-run', 'list what would be swept, change nothing')
  .action(opts => sweep(opts).catch(fail));

program
  .command('scan')
  .description(
    'Items that moved recently with no claim on them — what the board cannot show'
  )
  .option('-r, --repo <key>', 'limit to one repo')
  .option('-d, --days <n>', 'how far back counts as active (default 3)')
  .option('-a, --all', 'include bot-authored items')
  .action(opts => scan(opts).catch(fail));

program
  .command('claim <target>')
  .description('Claim an issue/PR — post the claim comment and label it')
  .option(
    '-d, --doc <path...>',
    'planning doc / RFD this work is built against'
  )
  .option('-b, --branch <name>', 'branch (defaults to the current one)')
  .option(
    '-w, --waiting-on <what>',
    'park it immediately, e.g. "human — needs the phone"'
  )
  .option(
    '-R, --related <ref...>',
    'issues/PRs to link (default: discovered from the body + cross-references)'
  )
  .option(
    '-W, --worktree <path>',
    'worktree path, or "none" for a branch that only exists on origin'
  )
  .option('-f, --force', 'take over a live claim held by another session')
  .action((target, opts) => claim(target, opts).catch(fail));

program
  .command('touch <target>')
  .description(
    'Refresh the heartbeat on your claim (run at each commit/push/phase)'
  )
  .option(
    '-d, --doc <path...>',
    'add a planning doc / RFD link (merged, never replaced)'
  )
  .option(
    '-w, --waiting-on <what>',
    'park the claim on a human, or "—" to unpark'
  )
  .action((target, opts) => touch(target, opts).catch(fail));

program
  .command('release <target>')
  .description('Release your claim — RELEASED, unlabelled, minimized')
  .option('-a, --all', "release every live claim, not just this session's")
  .action((target, opts) => release(target, opts).catch(fail));

function fail(error) {
  console.error(chalk.red(error.message || String(error)));
  process.exit(1);
}

program.parse();
