#!/usr/bin/env node

// device-test-status / dtq — read-only status board for the device-test queue.
//
// Replaces the "ask an agent to poll every thread" habit: this fetches the
// same data the /forge:device-test drain skill fetches (gh issue + comments
// per app repo), parses the fixed comment format from
// standards/workflows.md → "Device-test queue", and renders it as a table.
// Never writes anything — status edits and minimizing stay the drain skill's
// job (skills/device-test/SKILL.md). A quiet, no-color version of this same
// data also runs at session start — see hooks/device-test-status.mjs.

const { Command } = require('commander');
const chalk = require('chalk');
const {
  STATUS,
  checkGhReady,
  collect,
  daysSince,
  describeClaim,
  fetchDeviceClaims,
  REPOS,
} = require('./queue-lib');
const { clip } = require('../../../tools/work-claim/lib/protocol.js');
const { enqueue } = require('./enqueue');

// clip lives in the shared claim protocol module: this copy and the `wip`
// board's had already drifted — one coerced with String(), this one called
// .replace directly and threw on a non-string title.

function statusIcon(item) {
  switch (item.state) {
    case STATUS.OPEN:
      return item.needsHuman
        ? chalk.yellow('🙋 OPEN ')
        : chalk.cyan('🤖 OPEN ');
    case STATUS.FAILED:
      return chalk.red('✖ FAILED');
    case STATUS.DONE:
      return chalk.green('✓ DONE ');
    case STATUS.NEEDS_BUILD:
      return chalk.blue('🔧 BUILD ');
    case STATUS.PARKED:
      return chalk.gray('🅿️ PARKED');
    case STATUS.WITHDRAWN:
      return chalk.gray('⊘ WITHDRAWN');
    default:
      return chalk.magenta('? UNPARSED');
  }
}

function renderRepo(result, opts) {
  const lines = [];
  const header = chalk.bold(result.key);

  if (result.error) {
    lines.push(`${header}  ${chalk.red(`error: ${result.error}`)}`);
    return lines;
  }

  // Keyed on items, never on a queue issue: there is no queue issue any more
  // (RFD-003), and a guard that read one skipped every repo in the
  // SessionStart hook without a word (forge#135).
  if (result.items.length === 0) {
    lines.push(`${header}  ${chalk.gray('nothing pending')}`);
    return lines;
  }

  const open = result.items.filter(i => i.state === STATUS.OPEN);
  const failed = result.items.filter(i => i.state === STATUS.FAILED);
  const done = result.items.filter(i => i.state === STATUS.DONE);
  const needsBuild = result.items.filter(i => i.state === STATUS.NEEDS_BUILD);

  // Parked is OPEN work that the daily drain skips by decision — it must be
  // counted and listed, not filtered out. Leaving it uncounted made a parked
  // test invisible on the board, which is the exact failure this medium was
  // chosen to end. Withdrawn is closed and shows only under --all, next to
  // done, but is never added to the done count: nothing was verified.
  const parked = result.items.filter(i => i.state === STATUS.PARKED);
  const withdrawn = result.items.filter(i => i.state === STATUS.WITHDRAWN);
  const needsHuman = open.filter(i => i.needsHuman).length;

  const counts = [
    `${open.length} open`,
    `${failed.length} failed`,
    `${needsHuman} needs-human`,
    `${needsBuild.length} needs-build`,
    parked.length ? `${parked.length} parked` : null,
    `${done.length} done`,
    withdrawn.length ? `${withdrawn.length} withdrawn` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  lines.push(
    `${header}  ${chalk.gray(counts)}  ${chalk.dim(
      `https://github.com/${result.repo}/issues?q=is%3Aopen+label%3Adevice-test`
    )}`
  );

  // Half the queue unreadable is NOT an empty queue. Name which half, so the
  // counts above read as partial rather than as the whole truth.
  if (result.partial) {
    lines.push(chalk.red(`  ⚠ partial — ${result.partial}`));
  }

  // The device line used to sit here, once per repo. It moved to the foot of
  // the board (renderDevices): the lock is one per handset, not one per app,
  // so printing it inside each repo's block said the same thing up to four
  // times and implied a per-app lock that never existed.

  // A stacked body means a test that IS NOT ON THIS BOARD. Its own row is
  // printed normally below — the warning is about the ones underneath it.
  const stacked = result.items.filter(i => i.itemHeadings > 1);
  if (stacked.length > 0) {
    const hidden = stacked.reduce((n, i) => n + i.itemHeadings - 1, 0);
    lines.push(
      chalk.magenta(
        `  ⚠ ${hidden} test(s) are stacked inside another test's issue and have no row here — split them:`
      )
    );
    stacked.forEach(i =>
      lines.push(
        `    ${chalk.dim(i.commentUrl)}${chalk.dim(
          `  — ${i.itemHeadings} tests in one issue body; the queue is one issue per test`
        )}`
      )
    );
  }

  const visible = opts.all
    ? [...open, ...failed, ...needsBuild, ...parked, ...done, ...withdrawn]
    : [...open, ...failed, ...needsBuild, ...parked];
  if (visible.length === 0) {
    lines.push(chalk.gray('  (queue empty)'));
  }

  visible
    .sort(a => (a.state === STATUS.FAILED ? -1 : 1))
    .forEach(item => {
      const age = daysSince(item.createdAt);
      const ageStr = age === null ? '' : chalk.dim(` (${age}d)`);
      const pr = item.pr ? chalk.dim(`PR #${item.pr}`) : '';

      // Why a failed or build-blocked test is sitting there lives in its
      // issue's comments now, not in a Status line the list endpoint returns,
      // so every row shows the delivery pair and the label carries the rest.
      const extra = clip(
        [item.delivery, item.needsRuntime && `needs ${item.needsRuntime}`]
          .filter(Boolean)
          .join(' · '),
        60
      );

      // The test id is the issue number (`alate#712`) — the thing you quote
      // back, and a live link anywhere.
      const id = item.testId
        ? chalk.dim(`${item.testId}`)
        : chalk.magenta('unstamped');
      const noteCount = item.notes && item.notes.length;
      const notes = noteCount
        ? chalk.dim(` +${noteCount} note${noteCount > 1 ? 's' : ''}`)
        : '';
      lines.push(
        `  ${statusIcon(item)}  ${id}  ${clip(
          item.title,
          72
        )}${ageStr}${notes}  ${pr}  ${chalk.dim(extra)}`
      );
    });

  return lines;
}

/**
 * Who holds each physical device — once for the whole board, not once per app.
 *
 * An UNREADABLE lock prints as unreadable, never as free. "Nobody is on the
 * phone" and "I could not find out" are opposite instructions to a session
 * about to drive it, and collapsing them is how you get the 2026-09-01
 * collision back with a clean conscience.
 */
function renderDevices(devices) {
  const lines = [chalk.bold('Devices')];
  (devices || []).forEach(({ device, claim, error }) => {
    const name = `${device.serial} (${device.label})`;
    if (error) {
      lines.push(
        `  ${chalk.red('? UNREADABLE')} ${name} — ${chalk.dim(
          clip(error, 60)
        )} ${chalk.red('· do not drive it until this reads')}`
      );
    } else if (claim) {
      lines.push(`  ${chalk.yellow(describeClaim(claim))}`);
    } else {
      lines.push(`  ${chalk.green('free')} ${chalk.dim(name)}`);
    }
  });
  return lines;
}

function render(results, opts, devices) {
  const out = [];
  out.push(chalk.bold(`Device Test Queue — ${new Date().toLocaleString()}`));
  out.push('');
  results.forEach(r => {
    out.push(...renderRepo(r, opts));
    out.push('');
  });
  if (devices) {
    out.push(...renderDevices(devices));
    out.push('');
  }

  const totals = results.reduce(
    (acc, r) => {
      // Same trap as renderRepo's guard: keyed on the LEGACY queue issue,
      // this dropped a repo's issue-based tests out of the totals the moment
      // its legacy queue went. Count anything that produced items.
      if (r.error || !r.items) {
        return acc;
      }
      r.items.forEach(i => {
        if (i.state === STATUS.OPEN) {
          acc.open += 1;
        }
        if (i.state === STATUS.FAILED) {
          acc.failed += 1;
        }
        if (i.state === STATUS.NEEDS_BUILD) {
          acc.needsBuild += 1;
        }
        if (i.state === STATUS.OPEN && i.needsHuman) {
          acc.needsHuman += 1;
        }
      });
      return acc;
    },
    { open: 0, failed: 0, needsHuman: 0, needsBuild: 0 }
  );

  out.push(chalk.gray('─'.repeat(60)));
  out.push(
    chalk.bold(
      `Totals: ${totals.open} open, ${totals.failed} failed, ${totals.needsHuman} needs-human, ${totals.needsBuild} needs-build across ${results.length} repos`
    )
  );
  if (!opts.all) {
    out.push(
      chalk.dim(
        'Run with --all to include done items, --watch to auto-refresh, --json for raw data.'
      )
    );
  }
  return out.join('\n');
}

/**
 * `dtq enqueue` — file a test as an issue, without hand-writing the body.
 *
 * Routed before commander rather than as a `program.command()`: the bare
 * `dtq` board is what everyone runs, and commander's subcommand mode changes
 * how a no-argument invocation behaves. Keeping the board's argv handling
 * untouched is worth one `if`.
 */
async function runEnqueue(argv) {
  const arg = name => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : argv[i + 1];
  };
  const many = name =>
    argv.reduce(
      (acc, a, i) => (a === `--${name}` ? [...acc, argv[i + 1]] : acc),
      []
    );

  const repoKey = arg('repo');
  const target = REPOS.find(r => r.key === repoKey || r.repo === repoKey);
  if (!target || !arg('intent')) {
    console.error(
      chalk.red(
        'usage: dtq enqueue --repo <alate|mood-layer|badige|loom> --intent "<what this proves>"\n' +
          '                   [--verifies <pr>] [--sha <sha>] [--delivery <how it reaches the device>]\n' +
          '                   [--needs-runtime <version>] [--why <why a device is needed>]\n' +
          '                   [--step "<one step>"]... [--expect "<one expectation>"]... [--dry-run]\n\n' +
          'Prefix a step with "HUMAN:" to mark it as needing a person — that is what labels the issue needs-human.'
      )
    );
    process.exit(1);
  }

  const result = await enqueue({
    repo: target.repo,
    intent: arg('intent'),
    dryRun: argv.includes('--dry-run'),
    fields: {
      verifies: arg('verifies'),
      sha: arg('sha'),
      delivery: arg('delivery'),
      needsRuntime: arg('needs-runtime'),
      why: arg('why'),
      steps: many('step'),
      expect: many('expect'),
    },
  });

  if (result.body) {
    console.log(chalk.bold(`would ${result.action}: ${result.title}`));
    console.log(chalk.dim(`labels: ${result.labels.join(', ')}`));
    if (result.existing) {
      console.log(
        chalk.yellow(
          `an open test already covers this intent — #${result.existing}; this would be appended as a comment`
        )
      );
    }
    console.log(`\n${result.body}`);
    return;
  }
  console.log(
    chalk.green(
      result.action === 'append'
        ? `appended to existing test ${target.key}#${result.number}`
        : `enqueued ${target.key}#${result.number}`
    )
  );
}

async function main() {
  if (process.argv[2] === 'enqueue') {
    const ready = await checkGhReady();
    if (!ready.ok) {
      console.error(chalk.red(ready.message));
      process.exit(1);
    }
    return runEnqueue(process.argv.slice(3));
  }

  const program = new Command();
  program
    .name('device-test-status')
    .description(
      'Read-only status board for the device-test queue (alate, mood-layer, badige, loom)'
    )
    .option(
      '-r, --repo <name>',
      'only show one repo (alate, mood-layer, badige, loom)'
    )
    .option('-a, --all', 'include done/resolved items', false)
    .option(
      '-w, --watch [seconds]',
      'auto-refresh every N seconds (default 60)'
    )
    .option(
      '-j, --json',
      'print raw parsed data as JSON instead of a table',
      false
    )
    .parse(process.argv);

  const opts = program.opts();

  const ready = await checkGhReady();
  if (!ready.ok) {
    console.error(chalk.red(ready.message));
    process.exit(1);
  }

  async function tick() {
    let results;
    let devices;
    try {
      // Both in flight together: the device lock lives in a different repo
      // from every queue, so serialising them would add a round trip to the
      // one line a session reads before touching the phone.
      [results, devices] = await Promise.all([
        collect(opts.repo),
        fetchDeviceClaims(),
      ]);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ repos: results, devices }, null, 2));
      return;
    }

    if (opts.watch) {
      process.stdout.write('\x1Bc'); // clear screen, keep scrollback intact
    }
    console.log(render(results, opts, devices));
  }

  await tick();

  if (opts.watch && !opts.json) {
    const seconds = Number.parseInt(opts.watch, 10) || 60;
    console.log(
      chalk.dim(`\nWatching — refreshing every ${seconds}s. Ctrl+C to stop.`)
    );
    setInterval(tick, seconds * 1000);
  }
}

main().catch(error => {
  console.error(chalk.red(error.stack || error.message || String(error)));
  process.exit(1);
});
