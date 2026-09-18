#!/usr/bin/env node

// backlog-migrate — move a repo's BACKLOG.md entries into GitHub issues
// (RFD 004 §5). Node standard library + the `gh` CLI only.
//
//   plan     --repo <r> [--dir <checkout>] [--source-sha <ref>] [--out plan.json] [--offline]
//            parse + classify + dedupe → plan.json + the review table. Writes nothing to GitHub.
//   apply    --repo <r> --plan plan.json [--max 25] [--dry-run]
//            creates / links, paced (≥3 s, ≤400/h), ledger flushed after every write.
//   rewrite  --repo <r> --map memory/backlog-migration.json [--plan plan.json]
//            local only: pointer BACKLOG.md, docs/backlog → docs/briefs, link rewrites,
//            WEEKLY_DIGEST.md pointer, BACKLOG mentions in docs + workflows + .husky
//            (reported), and with --guard <workflow> the freeze-guard step.
//   rollback --repo <r> --map memory/backlog-migration.json [--dry-run]
//            closes created issues as not planned. Never deletes.
//
// apply / rewrite / rollback refuse to run in a repo's main checkout: they
// write the ledger or the working tree, and other sessions share that
// checkout. Use a fresh worktree of the target repo (§5, §7).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeGithub, Pacer } = require('./lib/github');
const { Ledger } = require('./lib/ledger');
const commands = require('./lib/commands');

const USAGE = `usage: backlog-migrate <plan|apply|rewrite|rollback> --repo <name> [options]
  plan     [--dir .] [--source-sha origin/HEAD] [--out backlog-plan.<repo>.json] [--overrides f] [--offline]
  apply    --plan plan.json [--dir .] [--ledger memory/backlog-migration.json] [--max N] [--dry-run]
  rewrite  [--dir .] [--map memory/backlog-migration.json] [--plan plan.json]
           [--guard .github/workflows/ci.yml] [--digest-url <roadmap Artifact URL>]
  rollback [--dir .] [--map memory/backlog-migration.json] [--max N] [--dry-run]`;

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { _: cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) {
      throw new Error(`unexpected argument ${a}`);
    }
    const k = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[k] = true;
    } else {
      opts[k] = next;
      i++;
    }
  }
  return opts;
}

function gitIn(dir) {
  return args =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
}

function defaultRef(git) {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim();
  } catch {
    return 'origin/HEAD';
  }
}

function refuseMainCheckout(git, opts) {
  if (opts['allow-main-checkout']) {
    return;
  }
  const gitDir = path.resolve(git(['rev-parse', '--git-dir']).trim());
  const common = path.resolve(git(['rev-parse', '--git-common-dir']).trim());
  if (gitDir === common) {
    throw new Error(
      'this is a main checkout — other sessions share it. Run from a fresh worktree (git worktree add …), or pass --allow-main-checkout deliberately.'
    );
  }
}

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

/**
 * The roadmap Artifact URL for the WEEKLY_DIGEST.md pointer: `artifactUrl`
 * in `.roadmap-pulse-state.json`. That file is untracked, so a fresh worktree
 * lacks it; the main checkout (the parent of the common git dir) is read too.
 */
function digestUrlFor(dir, git) {
  const places = [dir];
  try {
    places.push(
      path.dirname(
        path.resolve(dir, git(['rev-parse', '--git-common-dir']).trim())
      )
    );
  } catch {
    // not a git checkout: the worktree's own copy is all there is
  }
  for (const p of places) {
    const f = path.join(p, '.roadmap-pulse-state.json');
    try {
      const url = readJson(f).artifactUrl;
      if (url) {
        return url;
      }
    } catch {
      // missing or unreadable: try the next place
    }
  }
  return null;
}
const today = () => new Date().toISOString().slice(0, 10);

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || opts._ === '--help') {
    console.log(USAGE);
    return 0;
  }
  if (!opts._ || !opts.repo) {
    console.error(USAGE);
    return 2;
  }
  const dir = path.resolve(opts.dir || '.');
  const git = gitIn(dir);
  const gh = makeGithub();
  const repo = String(opts.repo);

  if (opts._ === 'plan') {
    const ref = opts['source-sha'] || defaultRef(git);
    const text = git(['show', `${ref}:BACKLOG.md`]);
    const sourceSha = git(['rev-parse', '--short=7', ref]).trim();
    const blob = git(['rev-parse', `${ref}:BACKLOG.md`]).trim();
    let briefs = [];
    try {
      briefs = git(['ls-tree', '--name-only', ref, 'docs/backlog/'])
        .split('\n')
        .filter(p => p.endsWith('.md'));
    } catch {
      briefs = [];
    }
    const ovFile =
      opts.overrides || path.join(dir, 'memory', 'backlog-overrides.json');
    const overrides = fs.existsSync(ovFile) ? readJson(ovFile) : {};
    const { plan, table } = commands.plan({
      repo,
      text,
      sourceSha,
      sourceRef: ref,
      blob,
      gh: opts.offline ? null : gh,
      overrides,
      briefs,
      date: today(),
    });
    const out = path.resolve(opts.out || `backlog-plan.${repo}.json`);
    fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(table);
    console.log(`\nplan written to ${out} (source ${ref} @ ${sourceSha})`);
    return 0;
  }

  const max = opts.max ? Number(opts.max) : Infinity;
  const dryRun = Boolean(opts['dry-run']);
  const log = s => console.log(s);

  if (opts._ === 'apply') {
    if (!opts.plan) {
      throw new Error('apply needs --plan <plan.json>');
    }
    if (!dryRun) {
      refuseMainCheckout(git, opts);
    }
    const plan = readJson(opts.plan);
    if (plan.repo !== repo) {
      throw new Error(`plan is for ${plan.repo}, not ${repo}`);
    }
    if (!plan.online) {
      throw new Error(
        'refusing an offline plan — re-run plan without --offline so it dedupes'
      );
    }
    const ledger = new Ledger(
      path.resolve(dir, opts.ledger || 'memory/backlog-migration.json')
    );
    const s = await commands.apply({
      plan,
      gh,
      git,
      ledger,
      pacer: new Pacer(),
      max,
      date: today(),
      dryRun,
      log,
    });
    console.log(JSON.stringify(s, null, 2));
    return 0;
  }

  const map = path.resolve(dir, opts.map || 'memory/backlog-migration.json');
  if (opts._ === 'rewrite') {
    refuseMainCheckout(git, opts);
    const ledger = new Ledger(map);
    const plan = opts.plan ? readJson(opts.plan) : null;
    const r = commands.rewrite({
      repo,
      dir,
      ledger,
      plan,
      date: today(),
      digestUrl:
        typeof opts['digest-url'] === 'string'
          ? opts['digest-url']
          : digestUrlFor(dir, git),
      guardWorkflow: typeof opts.guard === 'string' ? opts.guard : null,
    });
    console.log(JSON.stringify(r, null, 2));
    console.log(
      `\nStill by hand in the same PR: each codeMentions / mentions line saying "tracked in BACKLOG …" → "tracked in <repo>#N"${
        r.guard && r.guard.startsWith('inserted')
          ? ''
          : ', and the freezeGuard step above in the PR gate (--guard <workflow>)'
      }.`
    );
    return 0;
  }

  if (opts._ === 'rollback') {
    if (!dryRun) {
      refuseMainCheckout(git, opts);
    }
    const ledger = new Ledger(map);
    const r = await commands.rollback({
      ledger,
      gh,
      pacer: new Pacer(),
      dryRun,
      max,
      log,
    });
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }

  console.error(USAGE);
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    e => {
      console.error(`backlog-migrate: ${e.message}`);
      process.exit(1);
    }
  );
}

module.exports = { main, parseArgs };
