#!/usr/bin/env node

// labels/bootstrap.js --repo <name|owner/name> [--dry-run]
//
// Creates the canonical label set (lib/labels.js) in one repo, and aligns the
// colour/description of any that already exist. Idempotent: a second run
// makes zero writes. It never deletes — the legacy critical/high/medium/low
// labels are only reported (RFD 004 Q4 retires them after a relabel pass).

const { makeGithub, Pacer } = require('../backlog-migrate/lib/github');
const { canonicalFor, planLabels } = require('./lib/labels');

async function bootstrap({ repo, gh, pacer, dryRun = false, log = () => {} }) {
  const plan = planLabels(gh.listLabels(repo), canonicalFor(repo));
  const fmt = l => `${l.name} #${l.color} "${l.description}"`;
  for (const l of plan.create) {
    log(`${dryRun ? 'would create' : 'create'} ${fmt(l)}`);
  }
  for (const l of plan.edit) {
    log(
      `${dryRun ? 'would edit' : 'edit'} ${l.from.name} #${l.from.color} "${
        l.from.description
      }" → ${fmt(l)}`
    );
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
  }
  log(
    `${repo}: create ${plan.create.length} · edit ${plan.edit.length} · ok ${
      plan.ok.length
    }${dryRun ? ' (dry run — nothing written)' : ''}`
  );
  return plan;
}

async function main(argv) {
  const repoAt = argv.indexOf('--repo');
  const repo = repoAt >= 0 ? argv[repoAt + 1] : null;
  if (!repo || repo.startsWith('--')) {
    console.error(
      'usage: node tools/labels/bootstrap.js --repo <name|owner/name> [--dry-run]'
    );
    return 2;
  }
  await bootstrap({
    repo,
    gh: makeGithub(),
    pacer: new Pacer({ minIntervalMs: 1000 }),
    dryRun: argv.includes('--dry-run'),
    log: s => console.log(s),
  });
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

module.exports = { bootstrap, main };
