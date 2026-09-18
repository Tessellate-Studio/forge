#!/usr/bin/env node

// forge-issue-forms <sync|check> [--dest <repo root>]
//
//   sync   copy forge's templates/issue-forms/*.yml into <dest>/.github/ISSUE_TEMPLATE/
//   check  exit 1 when any canonical form is missing or differs from forge's
//
// `check` runs inside the reusable code-inspection workflow when a caller
// sets `check_issue_forms: true` (RFD 004 §3).

const path = require('path');
const { check, sync, TARGET } = require('./lib/forms');

const SHOWN = TARGET.split(path.sep).join('/');

function main(argv) {
  const [cmd] = argv;
  const at = argv.indexOf('--dest');
  const dest = path.resolve(at >= 0 ? argv[at + 1] : '.');
  if (cmd === 'sync') {
    const written = sync(dest);
    console.log(
      written.length
        ? `wrote ${written.join(', ')} to ${SHOWN}`
        : 'issue forms already in sync'
    );
    return 0;
  }
  if (cmd === 'check') {
    const r = check(dest);
    for (const f of r.missing) {
      console.log(
        `::error::${SHOWN}/${f} is missing — run forge-issue-forms sync`
      );
    }
    for (const f of r.drifted) {
      console.log(
        `::error::${SHOWN}/${f} differs from forge's canonical copy — edit it in forge, then run forge-issue-forms sync`
      );
    }
    if (r.extra.length) {
      console.log(
        `note: repo-specific forms left alone: ${r.extra.join(', ')}`
      );
    }
    console.log(
      r.pass
        ? `issue forms match forge (${r.ok.length})`
        : 'issue forms drifted from forge'
    );
    return r.pass ? 0 : 1;
  }
  console.error('usage: forge-issue-forms <sync|check> [--dest <repo root>]');
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main };
