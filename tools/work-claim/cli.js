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
} = require('./lib/claim');

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

function clip(text, max) {
  if (!text) {
    return text;
  }
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
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

/** Create the label if the repo has never had one. Idempotent — an existing
 *  label makes `gh label create` fail, which is not an error here. */
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
    const idle = c.idleMinutes === null ? '?' : c.idleMinutes;
    const idleText =
      idle !== '?' && idle >= STALE_MINUTES / 2
        ? chalk.yellow(`${idle}m idle`)
        : chalk.gray(`${idle}m idle`);
    lines.push(
      `  ${kind} ${chalk.bold(`#${item.number}`)} ${clip(item.title, 46)}`
    );
    lines.push(
      `      ${chalk.green(c.heldBy)}  ${idleText}${
        c.waitingOnHuman ? chalk.yellow(`  ⏸ ${clip(c.waitingOn, 40)}`) : ''
      }`
    );
    if (c.worktree) {
      lines.push(`      ${chalk.gray(clip(c.worktree, 72))}`);
    }
    if (c.sessionId) {
      lines.push(
        `      ${chalk.gray(`resume: claude --resume ${c.sessionId}`)}`
      );
    }
    if (c.docs) {
      lines.push(`      ${chalk.gray(`docs: ${clip(c.docs, 66)}`)}`);
    }
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
  const ready = await checkGhReady();
  if (!ready.ok) {
    console.error(chalk.red(ready.message));
    process.exit(1);
  }

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
      `A claim goes stale after ${STALE_MINUTES} min of silence. ` +
        'Claims parked on a human never expire.'
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
  const ready = await checkGhReady();
  if (!ready.ok) {
    console.error(chalk.red(ready.message));
    process.exit(1);
  }

  // state: 'all' — the leak that matters most sits on a MERGED PR, which
  // is closed, and the default open-only query cannot see it.
  const leaked = leakedItems(await collect(opts.repo, { state: 'all' }));
  if (leaked.length === 0) {
    console.log(
      chalk.gray('Nothing to sweep — every claimed item has a live claim.')
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
    waitingOn: opts.waitingOn,
  });

  await ensureLabel(repo);
  await gh([
    'api',
    `repos/${repo}/issues/${number}/comments`,
    '-f',
    `body=${body}`,
  ]);

  // The comment is the claim; the label is only what makes the board listable
  // in one request. A repo where labelling fails (no write access to labels, a
  // fork PR) must still end up with a posted claim — losing the claim over a
  // cosmetic index would be the worse failure — but the caller has to hear that
  // `wip` will not show it.
  try {
    await gh([
      'api',
      `repos/${repo}/issues/${number}/labels`,
      '-f',
      `labels[]=${CLAIM_LABEL}`,
    ]);
  } catch (error) {
    console.error(
      chalk.yellow(
        `Claim posted, but adding the "${CLAIM_LABEL}" label to ${repo}#${number} failed: ` +
          `${error.message}. The board will not list it until the label is added.`
      )
    );
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
  .option('-f, --force', 'take over a live claim held by another session')
  .action((target, opts) => claim(target, opts).catch(fail));

program
  .command('touch <target>')
  .description(
    'Refresh the heartbeat on your claim (run at each commit/push/phase)'
  )
  .option('-b, --branch <name>', 'branch (defaults to the current one)')
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
  .option('-b, --branch <name>', 'branch (defaults to the current one)')
  .option('-a, --all', "release every live claim, not just this session's")
  .action((target, opts) => release(target, opts).catch(fail));

function fail(error) {
  console.error(chalk.red(error.message || String(error)));
  process.exit(1);
}

program.parse();
