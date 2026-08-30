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
const { STATUS, checkGhReady, collect, daysSince } = require('./queue-lib');

// One board row per item, always. Comments are authored by many sessions and
// drift; whatever the parser hands over gets clamped so a malformed item can
// cost at most one truncated line, never a word wall.
function clip(text, max) {
  if (!text) {
    return text;
  }
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

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
  const unparsed = result.items.filter(i => i.state === STATUS.UNPARSEABLE);
  const needsHuman = open.filter(i => i.needsHuman).length;

  const counts = [
    `${open.length} open`,
    `${failed.length} failed`,
    `${needsHuman} needs-human`,
    `${done.length} done`,
  ].join(' · ');
  lines.push(`${header}  ${chalk.gray(counts)}  ${chalk.dim(result.issueUrl)}`);

  if (unparsed.length > 0) {
    lines.push(
      chalk.magenta(
        `  ⚠ ${unparsed.length} comment(s) don't match the queue format — check them:`
      )
    );
    unparsed.forEach(i => lines.push(`    ${chalk.dim(i.commentUrl)}`));
  }

  const visible = opts.all
    ? [...open, ...failed, ...done]
    : [...open, ...failed];
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
      // and show only up to the link.
      const extra =
        item.state === STATUS.FAILED
          ? chalk.red(
              clip(item.statusText.replace(/^❌\s*/, '').split(' — ')[0], 90)
            )
          : clip(
              [item.delivery, item.needsRuntime && `needs ${item.needsRuntime}`]
                .filter(Boolean)
                .join(' · '),
              60
            );
      lines.push(
        `  ${statusIcon(item)}  ${clip(
          item.title,
          80
        )}${ageStr}  ${pr}  ${chalk.dim(extra)}`
      );
    });

  return lines;
}

function render(results, opts) {
  const out = [];
  out.push(chalk.bold(`Device Test Queue — ${new Date().toLocaleString()}`));
  out.push('');
  results.forEach(r => {
    out.push(...renderRepo(r, opts));
    out.push('');
  });

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
        if (i.state === STATUS.OPEN && i.needsHuman) {
          acc.needsHuman += 1;
        }
      });
      return acc;
    },
    { open: 0, failed: 0, needsHuman: 0 }
  );

  out.push(chalk.gray('─'.repeat(60)));
  out.push(
    chalk.bold(
      `Totals: ${totals.open} open, ${totals.failed} failed, ${totals.needsHuman} needs-human across ${results.length} repos`
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
      'Read-only status board for the device-test queue (alate, mood-layer, badige)'
    )
    .option(
      '-r, --repo <name>',
      'only show one repo (alate, mood-layer, badige)'
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
    try {
      results = await collect(opts.repo);
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (opts.watch) {
      process.stdout.write('\x1Bc'); // clear screen, keep scrollback intact
    }
    console.log(render(results, opts));
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
