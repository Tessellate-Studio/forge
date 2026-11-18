#!/usr/bin/env node

// labels/bootstrap.js --repo <name|owner/name> [--dry-run] [--write-json <path>]
//
// Creates the canonical label set (lib/labels.js) in one repo, and aligns the
// name, colour and description of any that already exist. Labels match by KEY
// (RFD 005), so turning the emoji switch on renames `bug` to `🐛 bug` IN PLACE
// and every issue keeps it. Idempotent: a second run makes zero writes.
//
// It deletes a label in exactly two cases, both logged:
// - a duplicate with the same key (a bare `bug` revived beside `🐛 bug` by a
//   writer that sent the old name): its items move to the canonical label
//   first, then the duplicate goes (RFD 005 §4);
// - a label the owner retired BY NAME in lib/labels.js RETIRED, with
//   `--prune` only. Deleting a label strips it from every item it was on, so
//   nothing is retired by a guess.
// The legacy critical/high/medium/low labels are only reported (RFD 004 Q4).
//
// --write-json <path> writes the repo's key → live-name map, the file app
// repos read in CI (they cannot require forge).

const fs = require('fs');
const { Pacer } = require('../backlog-migrate/lib/github');
const { makeLabelGithub } = require('./lib/github-labels');
const {
  canonicalFor,
  planLabels,
  retiredFor,
  labelKey,
  resolveLabel,
} = require('./lib/labels');

async function bootstrap({
  repo,
  gh,
  pacer,
  dryRun = false,
  create = true,
  prune = false,
  log = () => {},
  canonical = canonicalFor(repo),
}) {
  const existing = gh.listLabels(repo);
  const plan = planLabels(existing, canonical);

  // --no-create: a repo outside the label set (tessellate-pages) gets its
  // existing labels renamed and its retired ones pruned, and nothing added.
  if (!create) {
    if (plan.create.length) {
      log(
        `not creating (--no-create): ${plan.create.map(l => l.name).join(', ')}`
      );
    }
    plan.create = [];
  }
  const retire = prune ? planRetire(existing, canonical, retiredFor(repo)) : [];
  const would = dryRun ? 'would ' : '';
  const fmt = l => `${l.name} #${l.color} "${l.description}"`;

  for (const l of plan.create) {
    log(`${would}create ${fmt(l)}`);
  }
  for (const l of plan.edit) {
    log(
      `${would}edit ${l.from.name} #${l.from.color} "${
        l.from.description
      }" → ${fmt(l)}`
    );
  }
  for (const m of plan.merge) {
    log(
      `${would}merge duplicate "${m.from}" into "${m.into}", then delete "${m.from}"`
    );
  }
  for (const name of retire) {
    log(`${would}delete retired label "${name}"`);
  }
  if (plan.legacy.length) {
    log(
      `legacy priority labels present (not touched — Q4 relabels, then deletes by hand): ${plan.legacy.join(
        ', '
      )}`
    );
  }

  if (!dryRun) {
    for (const l of plan.create) {
      await pacer.write(() => gh.createLabel(repo, l));
    }
    for (const l of plan.edit) {
      await pacer.write(() =>
        gh.editLabel(repo, { ...l, name: l.from.name, newName: l.name })
      );
    }
    for (const m of plan.merge) {
      const items = gh.labelledItems(repo, m.from);
      for (const n of items) {
        await pacer.write(() => gh.addLabelTo(repo, n, m.into));
        await pacer.write(() => gh.removeLabelFrom(repo, n, m.from));
      }

      // Only once nothing wears it any more.
      if (gh.labelledItems(repo, m.from).length === 0) {
        await pacer.write(() => gh.deleteLabel(repo, m.from));
        log(`merged ${items.length} item(s) from "${m.from}" into "${m.into}"`);
      } else {
        log(`"${m.from}" still on items after the move — NOT deleted; re-run`);
      }
    }
    for (const name of retire) {
      // The owner retired labels that were on NOTHING. Re-check at delete
      // time: a label that has been applied since is kept, not stripped.
      const on = gh.labelledItems(repo, name).length;
      if (on > 0) {
        log(`kept retired "${name}": it is on ${on} item(s) now — review it`);
        continue;
      }
      await pacer.write(() => gh.deleteLabel(repo, name));
    }
  }
  log(
    `${repo}: create ${plan.create.length} · edit ${plan.edit.length} · merge ${
      plan.merge.length
    } · retire ${retire.length} · ok ${plan.ok.length}${
      dryRun ? ' (dry run — nothing written)' : ''
    }`
  );
  return { ...plan, retire };
}

/** Retired names that exist in the repo and are NOT canonical (a retired
 *  entry can never take out a label the registry still wants). */
function planRetire(existing, canonical, retired) {
  const keep = new Set(canonical.map(l => l.key.toLowerCase()));
  const wanted = new Set(retired.map(n => n.toLowerCase()));
  return existing
    .map(l => l.name)
    .filter(n => wanted.has(n.toLowerCase()))
    .filter(n => !keep.has(labelKey(n).toLowerCase()));
}

/** key → live name for every canonical label, read from the repo itself. */
function liveMap(existing, canonical) {
  const out = {};
  for (const want of canonical) {
    out[want.key] = resolveLabel(want.key, existing) || want.name;
  }
  return out;
}

function arg(argv, flag) {
  const at = argv.indexOf(flag);
  const v = at >= 0 ? argv[at + 1] : null;
  return v && !v.startsWith('--') ? v : null;
}

async function main(argv) {
  const repo = arg(argv, '--repo');
  if (!repo) {
    console.error(
      'usage: node tools/labels/bootstrap.js --repo <name|owner/name> [--dry-run] [--prune] [--no-create] [--write-json <path>]'
    );
    return 2;
  }
  const gh = makeLabelGithub();
  await bootstrap({
    repo,
    gh,
    pacer: new Pacer({ minIntervalMs: 1000 }),
    dryRun: argv.includes('--dry-run'),
    prune: argv.includes('--prune'),
    create: !argv.includes('--no-create'),
    log: s => console.log(s),
  });
  const jsonPath = arg(argv, '--write-json');
  if (jsonPath) {
    const map = liveMap(gh.listLabels(repo), canonicalFor(repo));
    fs.writeFileSync(jsonPath, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`wrote ${Object.keys(map).length} labels to ${jsonPath}`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    e => {
      console.error(`bootstrap: ${e.message}`);
      process.exit(1);
    }
  );
}

module.exports = { bootstrap, main, planRetire, liveMap };
