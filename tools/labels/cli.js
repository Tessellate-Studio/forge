#!/usr/bin/env node

// forge-label <key> [--repo <name|owner/name>]
//
// Prints a label's CURRENT name, so a hand-typed command never sends a stale
// one (RFD 005): `gh issue list -l "$(forge-label P1)"`. With --repo it reads
// the repo's live labels; without, it prints the registry's display name.
// Exit 1 when the repo has no label for the key: an empty -l would list
// everything, and a wrong name would silently list nothing.

const { execFileSync } = require('child_process');
const { displayName, resolveLabel } = require('./lib/labels');

function main(
  argv,
  { run = execFileSync, out = console.log, err = console.error } = {}
) {
  const at = argv.indexOf('--repo');
  const key = argv.find(
    (a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1)
  );
  const repo = at >= 0 ? argv[at + 1] : null;
  if (!key || (at >= 0 && !repo)) {
    err('usage: forge-label <key> [--repo <name|owner/name>]');
    return 2;
  }
  if (!repo) {
    out(displayName(key));
    return 0;
  }
  const slug = repo.includes('/') ? repo : `Tessellate-Studio/${repo}`;
  const live = JSON.parse(
    run('gh', ['label', 'list', '-R', slug, '-L', '500', '--json', 'name'], {
      encoding: 'utf8',
    })
  );
  const name = resolveLabel(key, live);
  if (!name) {
    err(`${slug} has no label for "${key}"`);
    return 1;
  }
  out(name);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main };
