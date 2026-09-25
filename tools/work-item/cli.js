#!/usr/bin/env node

// wi new --repo <r> --title <t> --priority P0|P1|P2|P3 --what <…> --why <…> --done-when <…>
//        [--type bug|feature|chore|refactor] [--area <a> — required in loom, alate] [--context <…>]
//        [--effort 0.5|1|2|3|5|10|20] [--reach 1|10|100|1000]
//        [--label <l>]… [--parent <n>] [--dry-run] [--force]
//
// Files one work item as a GitHub issue with exactly one P label. Lists open
// issues first and refuses a likely duplicate (exit 3) unless --force.
// --dry-run prints the title, labels and body and touches nothing.

const { makeGithub } = require('../backlog-migrate/lib/github');
const { wiNew, UsageError } = require('./lib/work-item');

function parseArgs(argv) {
  const opts = { label: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      throw new UsageError(`unexpected argument ${a}`);
    }
    const k = a.slice(2);
    const next = argv[i + 1];
    const v = next === undefined || next.startsWith('--') ? true : (i++, next);
    if (k === 'label') {
      opts.label.push(v);
    } else {
      opts[k] = v;
    }
  }
  return opts;
}

function main(
  argv,
  { gh = makeGithub(), out = console.log, err = console.error } = {}
) {
  const [cmd, ...rest] = argv;
  if (cmd !== 'new') {
    err(
      'usage: wi new --repo <r> --title <t> --priority P0..P3 --what … --why … --done-when … [--dry-run]'
    );
    return 2;
  }
  try {
    const opts = parseArgs(rest);
    const r = wiNew(opts, { gh, dryRun: Boolean(opts['dry-run']) });
    if (r.status === 'dry-run') {
      out(
        `repo:   ${r.issue.repo}\ntitle:  ${
          r.issue.title
        }\nlabels: ${r.issue.labels.join(', ')}\n\n${r.issue.body}`
      );
      return 0;
    }
    if (r.status === 'duplicate') {
      err(
        `likely duplicate of #${r.duplicate.number} "${r.duplicate.title}" — comment there instead, or pass --force`
      );
      return 3;
    }
    out(r.created.url);
    return 0;
  } catch (e) {
    err(`wi: ${e.message}`);
    return e instanceof UsageError ? 2 : 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, parseArgs };
