// plan / apply / rewrite / rollback (RFD 004 §5). Every side effect comes in
// through an argument — `gh` (lib/github), `git` (a function over args),
// `ledger`, `pacer`, `fs`, `log` — so the whole flow is testable offline and
// `cli.js` is only argument parsing plus wiring.

const nodeFs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseBacklog } = require('./parse');
const { classifyEntries } = require('./classify');
const R = require('./render');
const { versionAtLeast, MIN_GH } = require('./github');
const { canonicalFor, AREA } = require('../../labels/lib/labels');

const MIGRATED_LABEL = 'migrated-from-backlog';
const ACTIONABLE = new Set(['create', 'link']);

function requireGh(gh) {
  const v = gh.version();
  if (!v || !versionAtLeast(v)) {
    throw new Error(
      `gh ${MIN_GH.join('.')}+ required (found ${
        v ? v.join('.') : 'none'
      }) — --parent and the issue-type fields arrived in 2.94`
    );
  }
}

function fetchRemote(gh, repos) {
  const remote = {};
  for (const r of repos) {
    remote[r] = {
      issues: gh.listIssues(r),
      prs: gh.listPrs(r),
      labels: gh.listLabels(r),
    };
  }
  return remote;
}

/**
 * Parse + classify + dedupe. Writes nothing anywhere; the caller decides
 * whether to save plan.json.
 */
function plan({
  repo,
  text,
  sourceSha,
  sourceRef,
  blob,
  gh = null,
  overrides = {},
  briefs = [],
  date,
}) {
  const parsed = parseBacklog(text);
  const offline = classifyEntries(parsed, { repo, sourceSha, overrides });
  let remote = null;
  if (gh) {
    requireGh(gh);
    const repos = [...new Set([repo, ...offline.map(r => r.targetRepo)])];
    remote = fetchRemote(gh, repos);
  }
  const rows = remote
    ? classifyEntries(parsed, { repo, sourceSha, overrides, remote })
    : offline;

  const briefIndex = briefs.map(p => ({
    path: p,
    referencedBy: rows.filter(r => r.briefs.includes(p)).map(r => r.key),
  }));

  const doc = {
    version: 1,
    repo,
    sourceSha,
    sourceRef,
    blob,
    generatedAt: date,
    online: Boolean(remote),
    style: parsed.style,
    briefs: briefIndex,
    rows,
  };
  const orphanBriefs = briefIndex
    .filter(b => !b.referencedBy.length)
    .map(b => b.path);
  const table = [
    R.renderTable(rows),
    '',
    R.renderTotals(rows),
    orphanBriefs.length
      ? `Briefs no entry links to: ${orphanBriefs.join(', ')}`
      : null,
    remote
      ? null
      : 'Offline plan: no dedupe against existing issues — link verdicts need an online plan.',
  ]
    .filter(x => x !== null)
    .join('\n');
  return { plan: doc, table };
}

function labelsFor(row) {
  return [
    ...new Set(
      [row.priority, row.type, row.area, ...row.labels, MIGRATED_LABEL].filter(
        Boolean
      )
    ),
  ];
}

/** `### <heading>` block inside a row's text, up to the next same-or-higher heading. */
function splitBlock(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => {
    const m = l.match(/^(#{2,4})\s+(.*)$/);
    return m && m[2].trim().startsWith(heading);
  });
  if (start < 0) {
    return null;
  }
  const level = lines[start].match(/^#+/)[0].length;
  let end = start + 1;
  while (end < lines.length) {
    const m = lines[end].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      break;
    }
    end++;
  }
  return lines.slice(start, end).join('\n');
}

/**
 * Create / link, paced and checkpointed. Refuses when the source moved since
 * `plan`, when a label is missing (issue creation would silently drop it —
 * run labels/bootstrap.js first), or when gh is too old.
 */
async function apply({
  plan: doc,
  gh,
  git,
  ledger,
  pacer,
  max = Infinity,
  date,
  dryRun = false,
  log = () => {},
}) {
  requireGh(gh);
  if (git) {
    const now = git(['rev-parse', `${doc.sourceRef}:BACKLOG.md`]).trim();
    if (now !== doc.blob) {
      throw new Error(
        `BACKLOG.md at ${doc.sourceRef} changed since plan (${doc.blob.slice(
          0,
          8
        )} → ${now.slice(0, 8)}) — re-run plan`
      );
    }
  }
  const rows = doc.rows.filter(r => ACTIONABLE.has(r.verdict));
  const targets = [...new Set(rows.map(r => r.targetRepo))];

  const markerIndex = {};
  const labelFixes = [];
  for (const t of targets) {
    const have = new Set(gh.listLabels(t).map(l => l.name));
    const need = new Set(
      rows.filter(r => r.targetRepo === t).flatMap(labelsFor)
    );
    let missing = [...need].filter(n => !have.has(n));

    // A cross-repo target (loom's alate entry) was never bootstrapped for
    // this run, and the pilot created its provenance + type labels by hand.
    // Create the canonical, non-area ones here, with the canonical colour
    // and description; area and anything non-canonical still refuse.
    if (t !== doc.repo) {
      const short = t.includes('/') ? t.split('/')[1] : t;
      const areas = new Set((AREA[short] || []).map(l => l.name));
      const canon = new Map(canonicalFor(t).map(l => [l.name, l]));
      const fixable = missing.filter(n => canon.has(n) && !areas.has(n));
      labelFixes.push(...fixable.map(n => [t, canon.get(n)]));
      missing = missing.filter(n => !fixable.includes(n));
    }
    if (missing.length) {
      throw new Error(
        `${t} lacks label(s) ${missing.join(
          ', '
        )} — run tools/labels/bootstrap.js --repo ${t} first (a missing label is silently dropped)`
      );
    }
    for (const i of gh.listIssues(t)) {
      for (const k of R.markerKeys(i.body)) {
        markerIndex[`${t}:${k}`] = i.number;
      }
    }
  }

  const summary = {
    labelsCreated: [],
    created: 0,
    linked: 0,
    alreadyMigrated: 0,
    ledger: 0,
    stoppedAtMax: false,
    planned: [],
  };
  const base = row => ({
    key: row.key,
    title: row.title,
    verdict: row.verdict,
    sourceLines: `${row.startLine}-${row.endLine}`,
    sourceSha: doc.sourceSha,
    sourceRepo: doc.repo,
    repo: row.targetRepo,
    briefs: row.briefs,
  });

  // A dry run makes no writes, so it counts the ones it would make — that
  // is what lets `--dry-run --max N` show exactly what a real run would do.
  let dryWrites = 0;
  for (const [t, l] of labelFixes) {
    if (dryRun) {
      dryWrites++;
      summary.planned.push(`label ${t}: create ${l.name}`);
      continue;
    }
    await pacer.write(() => gh.createLabel(t, l));
    summary.labelsCreated.push(`${t}:${l.name}`);
    log(`label ${t}: created ${l.name}`);
  }
  const atMax = () => (dryRun ? dryWrites : pacer.writes) >= max;

  async function linkRow(row) {
    const n = row.linkTo;
    const current = gh.viewIssue(row.targetRepo, n);
    const have = new Set((current.labels || []).map(l => l.name));

    // Never give an issue a second P label: one it already carries is the
    // owner's call and wins over the BACKLOG section's priority.
    const hasP = [...have].some(l => /^P[0-3]$/.test(l));
    const add = [hasP ? null : row.priority, MIGRATED_LABEL].filter(
      l => l && !have.has(l)
    );
    const seen = [
      current.body,
      ...(current.comments || []).map(c => c.body),
    ].some(b => R.markerKeys(b).includes(row.key));
    if (dryRun) {
      dryWrites += (add.length ? 1 : 0) + (seen ? 0 : 1);
      summary.planned.push(
        `link ${row.targetRepo}#${n}: +[${add.join(', ')}]${
          seen ? '' : ' + comment'
        }`
      );
      return;
    }
    if (add.length) {
      await pacer.write(() => gh.addLabels(row.targetRepo, n, add));
    }
    if (!seen) {
      await pacer.write(() =>
        gh.comment(row.targetRepo, n, R.renderBody(row, { date }))
      );
    }
    ledger.upsert({
      ...base(row),
      issue: n,
      url: issueUrl(row.targetRepo, n),
      action: 'linked',
      addedLabels: add,
    });
    summary.linked++;
  }

  /** The parent issue number, or null in a dry run. */
  async function parentFor(row, labels) {
    const done = ledger.get(row.key);
    if (done && done.issue) {
      summary.ledger++;
      return done.issue;
    }
    const existing = markerIndex[`${row.targetRepo}:${row.key}`];
    if (existing) {
      summary.alreadyMigrated++;
      if (!dryRun) {
        ledger.upsert({
          ...base(row),
          issue: existing,
          url: issueUrl(row.targetRepo, existing),
          action: 'already-migrated',
        });
      }
      return existing;
    }
    if (dryRun) {
      dryWrites++;
      summary.planned.push(
        `create ${row.targetRepo}: ${row.title} [${labels.join(', ')}]`
      );
      return null;
    }
    const body = R.renderBody(row, { date });
    const made = await pacer.write(() =>
      gh.createIssue(row.targetRepo, { title: row.title, body, labels })
    );
    ledger.upsert({
      ...base(row),
      issue: made.number,
      url: made.url,
      action: 'created',
      labels,
    });
    summary.created++;
    log(`create ${row.targetRepo}#${made.number}: ${row.title}`);
    return made.number;
  }

  for (const row of rows) {
    if (atMax()) {
      summary.stoppedAtMax = true;
      break;
    }
    if (row.verdict === 'link') {
      if (ledger.get(row.key)) {
        summary.ledger++;
      } else {
        await linkRow(row);
      }
      continue;
    }

    const labels = labelsFor(row);
    const parent = await parentFor(row, labels);

    // Children resume on their own keys: a stop between the parent and its
    // children (budget, rate limit, crash) must not strand the rest, even
    // though the parent is already in the ledger.
    for (const heading of row.split || []) {
      const block = splitBlock(row.text, heading);
      if (!block) {
        throw new Error(`split heading "${heading}" not found in ${row.key}`);
      }
      const subKey = crypto
        .createHash('sha1')
        .update(`${row.key}/${heading}`)
        .digest('hex')
        .slice(0, 12);
      if (ledger.get(subKey) || markerIndex[`${row.targetRepo}:${subKey}`]) {
        continue;
      }
      if (atMax()) {
        summary.stoppedAtMax = true;
        break;
      }
      const subTitle = R.renderTitle(
        block.split('\n')[0].replace(/^#+\s+/, '')
      );
      if (dryRun) {
        dryWrites++;
        summary.planned.push(`  sub-issue ${row.targetRepo}: ${subTitle}`);
        continue;
      }
      const sub = { ...row, key: subKey, text: block };
      const child = await pacer.write(() =>
        gh.createIssue(row.targetRepo, {
          title: subTitle,
          body: R.renderBody(sub, { date }),
          labels,
          parent,
        })
      );
      ledger.upsert({
        ...base(sub),
        title: subTitle,
        issue: child.number,
        url: child.url,
        action: 'created',
        parent,
        labels,
      });
      summary.created++;
    }
    if (summary.stoppedAtMax) {
      break;
    }
  }
  return summary;
}

const issueUrl = (repo, n) =>
  `https://github.com/${R.OWNER}/${repo}/issues/${n}`;

/**
 * Undo `apply` from the ledger: created issues are CLOSED as not planned with
 * a comment, never deleted; linked issues lose only the labels we added.
 */
async function rollback({
  ledger,
  gh,
  pacer,
  dryRun = false,
  max = Infinity,
  log = () => {},
}) {
  const out = { closed: 0, unlinked: 0, planned: [] };
  const recs = ledger.records.filter(
    r => !r.rolledBack && (r.action === 'created' || r.action === 'linked')
  );

  // Children first, so a parent never closes over open sub-issues.
  recs.sort((a, b) => Number(Boolean(b.parent)) - Number(Boolean(a.parent)));
  for (const r of recs) {
    if (pacer.writes >= max) {
      break;
    }
    if (r.action === 'created') {
      if (dryRun) {
        out.planned.push(`close ${r.repo}#${r.issue} not planned`);
        continue;
      }
      await pacer.write(() =>
        gh.closeIssue(r.repo, r.issue, {
          reason: 'not planned',
          comment: `Rolled back by backlog-migrate (RFD 004 §7): closed, not deleted. Source: ${R.permalink(
            r.sourceRepo,
            r.sourceSha
          )}`,
        })
      );
      await pacer.write(() =>
        gh.removeLabels(r.repo, r.issue, [MIGRATED_LABEL])
      );
      out.closed++;
    } else {
      if (dryRun) {
        out.planned.push(
          `unlink ${r.repo}#${r.issue} −[${(r.addedLabels || []).join(', ')}]`
        );
        continue;
      }
      if ((r.addedLabels || []).length) {
        await pacer.write(() =>
          gh.removeLabels(r.repo, r.issue, r.addedLabels)
        );
      }
      out.unlinked++;
    }
    ledger.upsert({ key: r.key, rolledBack: true });
    log(`rolled back ${r.repo}#${r.issue}`);
  }
  return out;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.expo', 'dist', 'build']);
function walkMd(dir, fs, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.claude')) {
      continue;
    }
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      walkMd(p, fs, out);
    } else if (name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

// Non-markdown files that talk about BACKLOG in comments or echo lines: CI
// workflows and git hooks (loom's ops-watchdog.yml and .husky/pre-commit were
// found by hand in the pilot). Reported only: a comment rewrite needs the
// issue number a human picks.
function walkCode(dir, fs) {
  const out = [];
  const wf = path.join(dir, '.github', 'workflows');
  if (fs.existsSync(wf)) {
    for (const name of fs.readdirSync(wf)) {
      if (/\.ya?ml$/.test(name)) {
        out.push(path.join(wf, name));
      }
    }
  }
  const husky = path.join(dir, '.husky');
  if (fs.existsSync(husky)) {
    for (const name of fs.readdirSync(husky)) {
      const p = path.join(husky, name);
      if (name !== '_' && !fs.statSync(p).isDirectory()) {
        out.push(p);
      }
    }
  }
  return out;
}

const FREEZE_GUARD =
  'grep -q \'backlog-retired\' BACKLOG.md && [ "$(grep -cv \'^\\s*$\' BACKLOG.md)" -le 1 ] || { echo "::error::BACKLOG.md is retired — file an issue (wi new) instead"; exit 1; }';

/**
 * Insert the freeze guard as a step right after the first
 * `actions/checkout` step of a workflow, at that step's indentation. Returns
 * null when there is no checkout step to anchor on, and the text unchanged
 * when a guard is already there.
 *
 * FREEZE_GUARD contains `'^\s*$'`, and `$'` in a String#replace replacement
 * STRING means "the text after the match": a string replacer silently pastes
 * the rest of the file into the step. Always a function replacer here.
 */
function insertFreezeGuard(yaml) {
  if (/backlog-retired/.test(yaml)) {
    return yaml;
  }
  const re = /^([ \t]*)- uses: actions\/checkout@[^\n]*\n(?:\1 {2}[^\n]*\n)*/m;
  if (!re.test(yaml)) {
    return null;
  }
  return yaml.replace(re, (m, indent) =>
    [
      m.replace(/\n$/, ''),
      `${indent}# RFD 004 §5.7 freeze guard: BACKLOG.md is a one-line pointer to the`,
      `${indent}# issue list. A PR that adds an entry fails here, with the fix in the`,
      `${indent}# message, instead of merging into a dead file.`,
      `${indent}- name: BACKLOG.md is retired`,
      `${indent}  run: ${FREEZE_GUARD}`,
      '',
    ].join('\n')
  );
}

/**
 * Local-only (§5.7): pointer file, docs/backlog → docs/briefs with a
 * Tracking header, and docs-link rewrites. It touches no GitHub state and
 * makes no commit — the migration PR carries the result.
 */
function rewrite({
  repo,
  dir,
  ledger,
  plan: doc = null,
  date = new Date().toISOString().slice(0, 10),
  digestUrl = null,
  guardWorkflow = null,
  fs = nodeFs,
}) {
  // Rolled-back records point at issues closed as not planned — never retire
  // BACKLOG.md or write a Tracking header against those.
  const recs = ledger.records.filter(r => r.issue && !r.rolledBack);
  const shas = [...new Set(recs.map(r => r.sourceSha))];
  if (shas.length !== 1) {
    throw new Error(
      `ledger holds ${shas.length} source SHAs (${shas.join(
        ', '
      )}) — expected exactly one`
    );
  }
  if (doc) {
    const missing = doc.rows.filter(
      r => ACTIONABLE.has(r.verdict) && !ledger.get(r.key)
    );
    if (missing.length) {
      throw new Error(
        `${missing.length} create/link row(s) are not in the ledger yet — finish apply first`
      );
    }
  }
  const report = {
    pointer: false,
    moved: [],
    untracked: [],
    rewritten: [],
    mentions: [],
    codeMentions: [],
    digest: null,
    guard: null,
    freezeGuard: FREEZE_GUARD,
  };

  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), R.pointerFile(repo, shas[0]));
  report.pointer = true;

  const from = path.join(dir, 'docs', 'backlog');
  if (fs.existsSync(from)) {
    const to = path.join(dir, 'docs', 'briefs');
    if (!fs.existsSync(to)) {
      fs.mkdirSync(to, { recursive: true });
    }
    for (const name of fs.readdirSync(from).filter(n => n.endsWith('.md'))) {
      const rel = `docs/backlog/${name}`;
      const owner = recs.find(r => (r.briefs || []).includes(rel) && !r.parent);
      let text = fs.readFileSync(path.join(from, name), 'utf8');
      if (owner) {
        const tracking = `**Tracking:** ${owner.repo}#${owner.issue}`;
        const lines = text.split('\n');
        const at = /^#\s/.test(lines[0]) ? 1 : 0;
        lines.splice(at, 0, ...(at ? ['', tracking] : [tracking, '']));
        text = lines.join('\n');
      } else {
        report.untracked.push(rel);
      }
      fs.writeFileSync(path.join(to, name), text);
      fs.unlinkSync(path.join(from, name));
      report.moved.push(`${rel} → docs/briefs/${name}`);
    }
    if (!fs.readdirSync(from).length) {
      fs.rmdirSync(from);
    }
  }

  // Historical narrative (regression logs, archives) describes the past and
  // keeps its old paths on purpose.
  for (const file of walkMd(dir, fs)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    if (/regression_log|archive/i.test(rel)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const next = text.replace(/docs\/backlog\//g, 'docs/briefs/');
    if (next !== text) {
      fs.writeFileSync(file, next);
      report.rewritten.push(rel);
    }
    if (rel === 'BACKLOG.md') {
      continue;
    }
    next.split('\n').forEach((line, i) => {
      if (/BACKLOG(\.md)?\b/.test(line)) {
        report.mentions.push(`${rel}:${i + 1}`);
      }
    });
  }
  for (const file of walkCode(dir, fs)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/BACKLOG(\.md)?\b/.test(line)) {
          report.codeMentions.push(`${rel}:${i + 1}`);
        }
      });
  }

  // §4.6 / Q2: the digest is the roadmap Artifact. The old file keeps its
  // history and gets a pointer on top, once. Prepended by concatenation, not
  // String#replace, so nothing in the URL or text is read as a `$` pattern.
  const digest = path.join(dir, 'WEEKLY_DIGEST.md');
  if (fs.existsSync(digest)) {
    const text = fs.readFileSync(digest, 'utf8');
    if (R.DIGEST_RETIRED_RE.test(text)) {
      report.digest = 'already retired';
    } else {
      fs.writeFileSync(digest, `${R.digestPointer(date, digestUrl)}\n${text}`);
      report.digest = digestUrl ? 'pointer added' : 'pointer added (no URL)';
    }
  }

  if (guardWorkflow) {
    const wf = path.join(dir, guardWorkflow);
    const text = fs.readFileSync(wf, 'utf8');
    const next = insertFreezeGuard(text);
    if (next === null) {
      report.guard = `no actions/checkout step in ${guardWorkflow}: add the guard step by hand`;
    } else if (next === text) {
      report.guard = 'already present';
    } else {
      fs.writeFileSync(wf, next);
      report.guard = `inserted in ${guardWorkflow}`;
    }
  }
  return report;
}

module.exports = {
  insertFreezeGuard,
  plan,
  apply,
  rollback,
  rewrite,
  labelsFor,
  splitBlock,
  requireGh,
  MIGRATED_LABEL,
  FREEZE_GUARD,
};
