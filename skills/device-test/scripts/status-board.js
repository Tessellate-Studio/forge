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
} = require('./queue-lib');
const { clip } = require('../../../tools/work-claim/lib/protocol.js');

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

  if (!result.issueNumber) {
    lines.push(
      `${header}  ${chalk.gray('no queue issue found — nothing pending')}`
    );
    return lines;
  }

  const open = result.items.filter(i => i.state === STATUS.OPEN);
  const failed = result.items.filter(i => i.state === STATUS.FAILED);
  const done = result.items.filter(i => i.state === STATUS.DONE);
  const needsBuild = result.items.filter(i => i.state === STATUS.NEEDS_BUILD);
  const unparsed = result.items.filter(i => i.state === STATUS.UNPARSEABLE);
  const needsHuman = open.filter(i => i.needsHuman).length;

  const counts = [
    `${open.length} open`,
    `${failed.length} failed`,
    `${needsHuman} needs-human`,
    `${needsBuild.length} needs-build`,
    `${done.length} done`,
  ].join(' · ');
  lines.push(`${header}  ${chalk.gray(counts)}  ${chalk.dim(result.issueUrl)}`);

  // The device line used to sit here, once per repo. It moved to the foot of
  // the board (renderDevices): the lock is one per handset, not one per app,
  // so printing it inside each repo's block said the same thing up to four
  // times and implied a per-app lock that never existed.

  if (unparsed.length > 0) {
    lines.push(
      chalk.magenta(
        `  ⚠ ${unparsed.length} comment(s) don't match the queue format — check them:`
      )
    );

    // The URL alone made this a list to scroll past. The reason makes it a
    // list to act on — each line names the one edit that clears it.
    unparsed.forEach(i =>
      lines.push(
        `    ${chalk.dim(i.commentUrl)}${
          i.unparseableReason ? chalk.dim(`  — ${i.unparseableReason}`) : ''
        }`
      )
    );
  }

  // Drift is cosmetic on the board (the Status line still decides state) but
  // not on the issue page, where the heading glyph is the only thing a human
  // scrolling past actually reads. Report the count; the drain restamps them.
  // Louder than heading drift, and above it: drift is cosmetic, whereas a
  // stacked comment means a test that IS NOT ON THIS BOARD. Its own row is
  // printed normally below — the warning is about the ones underneath it.
  const stacked = result.items.filter(i => i.itemHeadings > 1);
  if (stacked.length > 0) {
    const hidden = stacked.reduce((n, i) => n + i.itemHeadings - 1, 0);
    lines.push(
      chalk.magenta(
        `  ⚠ ${hidden} test(s) are stacked inside another comment and have no row here — split them:`
      )
    );
    stacked.forEach(i =>
      lines.push(
        `    ${chalk.dim(i.commentUrl)}${chalk.dim(
          `  — ${i.itemHeadings} tests in one comment; the queue is one comment per test`
        )}`
      )
    );
  }

  const drifted = result.items.filter(
    i => i.state !== STATUS.UNPARSEABLE && i.headingDrift
  );
  if (drifted.length > 0) {
    lines.push(
      chalk.dim(
        `  ${drifted.length} heading(s) not stamped to match their Status — /forge:device-test restamps them`
      )
    );
  }

  const visible = opts.all
    ? [...open, ...failed, ...needsBuild, ...done]
    : [...open, ...failed, ...needsBuild];
  if (visible.length === 0 && unparsed.length === 0) {
    lines.push(chalk.gray('  (queue empty)'));
  }

  visible
    .sort(a => (a.state === STATUS.FAILED ? -1 : 1))
    .forEach(item => {
      const age = daysSince(item.createdAt);
      const ageStr = age === null ? '' : chalk.dim(` (${age}d)`);
      const pr = item.pr ? chalk.dim(`PR #${item.pr}`) : '';

      // Failed items' Status line is "failed (...) → <link> — <full writeup>";
      // the writeup duplicates the linked issue, so keep the board scannable
      // and show only up to the link. Needs-build items carry their "what's
      // needed" text right after the emoji — surface that instead of the
      // generic delivery/runtime pair, since that text IS the reason this
      // item is sitting out of the daily drain.
      const extra =
        item.state === STATUS.FAILED
          ? chalk.red(
              clip(item.statusText.replace(/^❌\s*/, '').split(' — ')[0], 90)
            )
          : item.state === STATUS.NEEDS_BUILD
          ? chalk.blue(clip(item.statusText.replace(/^🔧\s*/, ''), 90))
          : clip(
              [item.delivery, item.needsRuntime && `needs ${item.needsRuntime}`]
                .filter(Boolean)
                .join(' · '),
              60
            );

      // The test id is the comment id — the thing you quote back ("re-run
      // 5462960191") and the thing that anchors the comment URL, so the board
      // and the issue name the same test the same way.
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
      if (r.error || !r.issueNumber) {
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

async function main() {
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
