// End-to-end over the loom fixture (the RFD's pilot repo) against an
// in-memory GitHub. Pins the pilot acceptance criteria that code can own:
// the right issues with the right P, a ledger that matches, and a re-run of
// apply that creates 0.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  plan,
  apply,
  rollback,
  rewrite,
  labelsFor,
  FREEZE_GUARD,
} = require('../lib/commands');
const { Ledger } = require('../lib/ledger');
const { FakeGitHub, instantPacer } = require('../test-support/fake-github');

const LOOM = fs.readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'loom.BACKLOG.md'),
  'utf8'
);
const ALL_LABELS = [
  'P0',
  'P1',
  'P2',
  'P3',
  'bug',
  'feature',
  'chore',
  'refactor',
  'needs-input',
  'migrated-from-backlog',
  'admin-ui',
  'api',
  'sdk',
  'extension',
  'supabase',
  'infra',
  'mobile',
  'backend',
  'scraper',
  'fit-engine',
].map(name => ({ name }));

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bm-'));
const fakeGh = extra =>
  new FakeGitHub({ labels: { loom: ALL_LABELS, alate: ALL_LABELS }, ...extra });
const git = blob => args => args[0] === 'rev-parse' ? `${blob}\n` : '';

function planFor(gh) {
  return plan({
    repo: 'loom',
    text: LOOM,
    sourceSha: 'ab17d1b',
    sourceRef: 'origin/main',
    blob: 'blob1',
    gh,
    date: '2026-09-19',
  }).plan;
}

describe('plan', () => {
  test('offline plan prints a table and says it did not dedupe', () => {
    const { plan: doc, table } = plan({
      repo: 'loom',
      text: LOOM,
      sourceSha: 'ab17d1b',
      date: 'd',
    });
    expect(doc.online).toBe(false);
    expect(table).toMatch(/Totals: create 9 · link 0/);
    expect(table).toMatch(/Offline plan/);
  });

  test('online plan lists the source AND every target repo, read-only', () => {
    const gh = fakeGh();
    const doc = planFor(gh);
    expect(doc.online).toBe(true);
    const listed = gh.calls.filter(c => c[0] === 'listIssues').map(c => c[1]);
    expect(listed.sort()).toEqual(['alate', 'loom']); // loom L41 targets alate
    expect(gh.writes).toBe(0);
  });

  test('refuses a gh older than 2.94', () => {
    expect(() => planFor(fakeGh({ version: [2, 90, 0] }))).toThrow(/2\.94/);
  });
});

describe('apply', () => {
  test('creates one issue per create row with labels in the create call, then a re-run creates 0', async () => {
    const gh = fakeGh();
    const doc = planFor(gh);
    const dir = tmp();
    const ledger = new Ledger(
      path.join(dir, 'memory', 'backlog-migration.json')
    );
    const s1 = await apply({
      plan: doc,
      gh,
      git: git('blob1'),
      ledger,
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s1.created).toBe(9);
    const loomIssues = gh.issues.loom.filter(i =>
      /backlog-migrate v1/.test(i.body)
    );
    const alateIssues = gh.issues.alate.filter(i =>
      /backlog-migrate v1/.test(i.body)
    );
    expect(loomIssues).toHaveLength(8);
    expect(alateIssues).toHaveLength(1); // the "(alate repo)" health-endpoint entry
    for (const i of [...loomIssues, ...alateIssues]) {
      const names = i.labels.map(l => l.name);
      expect(names.filter(n => /^P[0-3]$/.test(n))).toHaveLength(1);
      expect(names).toContain('migrated-from-backlog');
    }

    // The ledger matches what was created.
    const onDisk = JSON.parse(fs.readFileSync(ledger.file, 'utf8'));
    expect(onDisk).toHaveLength(9);
    expect(
      onDisk.every(r => r.issue && r.url && r.sourceSha === 'ab17d1b')
    ).toBe(true);

    // Re-run with the same ledger: nothing new.
    const before = gh.writes;
    const s2 = await apply({
      plan: doc,
      gh,
      git: git('blob1'),
      ledger,
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s2.created).toBe(0);
    expect(gh.writes).toBe(before);

    // Re-run with the ledger LOST: the marker index still finds all nine.
    const fresh = new Ledger(path.join(tmp(), 'l.json'));
    const s3 = await apply({
      plan: doc,
      gh,
      git: git('blob1'),
      ledger: fresh,
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s3.created).toBe(0);
    expect(s3.alreadyMigrated).toBe(9);
    expect(gh.writes).toBe(before);
  });

  test('a crash mid-run resumes exactly where it stopped', async () => {
    const gh = fakeGh({ failOnWrite: 4 });
    const doc = planFor(gh);
    const ledger = new Ledger(path.join(tmp(), 'l.json'));
    await expect(
      apply({
        plan: doc,
        gh,
        git: git('blob1'),
        ledger,
        pacer: instantPacer(),
        date: 'd',
      })
    ).rejects.toThrow('simulated crash');
    expect(new Ledger(ledger.file).records).toHaveLength(3);
    gh.failOnWrite = null;
    const s = await apply({
      plan: doc,
      gh,
      git: git('blob1'),
      ledger: new Ledger(ledger.file),
      pacer: instantPacer(),
      date: 'd',
    });

    // 3 done before the crash; the 4th create threw inside gh, so nothing was
    // filed for it and it is created now along with the remaining five.
    expect(s.ledger).toBe(3);
    expect(s.created).toBe(6);
    const created = [...gh.issues.loom, ...gh.issues.alate].filter(i =>
      /backlog-migrate/.test(i.body)
    );
    expect(created).toHaveLength(9);
  });

  test('--max caps writes per invocation', async () => {
    const gh = fakeGh();
    const s = await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger: new Ledger(path.join(tmp(), 'l.json')),
      pacer: instantPacer(),
      max: 2,
      date: 'd',
    });
    expect(s.created).toBe(2);
    expect(s.stoppedAtMax).toBe(true);
  });

  test('refuses when BACKLOG.md moved since plan', async () => {
    const gh = fakeGh();
    await expect(
      apply({
        plan: planFor(gh),
        gh,
        git: git('blob2'),
        ledger: new Ledger(path.join(tmp(), 'l.json')),
        pacer: instantPacer(),
        date: 'd',
      })
    ).rejects.toThrow(/changed since plan/);
    expect(gh.writes).toBe(0);
  });

  test('refuses when a label is missing, before writing anything', async () => {
    const gh = new FakeGitHub({
      labels: { loom: [{ name: 'P2' }], alate: ALL_LABELS },
    });
    await expect(
      apply({
        plan: planFor(gh),
        gh,
        git: git('blob1'),
        ledger: new Ledger(path.join(tmp(), 'l.json')),
        pacer: instantPacer(),
        date: 'd',
      })
    ).rejects.toThrow(/bootstrap/);
    expect(gh.writes).toBe(0);
  });

  test('dry run writes nothing, not even the ledger', async () => {
    const gh = fakeGh();
    const file = path.join(tmp(), 'l.json');
    const s = await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger: new Ledger(file),
      pacer: instantPacer(),
      date: 'd',
      dryRun: true,
    });
    expect(s.planned).toHaveLength(9);
    expect(gh.writes).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('link: labels + one marker comment, and a second run adds neither', async () => {
    const gh = fakeGh({
      issues: {
        loom: [
          {
            number: 55,
            title: 'Instrument admin with Sentry',
            body: '',
            state: 'OPEN',
            labels: [],
            comments: [],
          },
        ],
      },
    });
    const doc = planFor(gh);
    const r = doc.rows.find(x => x.startLine === 38);

    // Force the link (the fixture entry names no issue number).
    Object.assign(r, { verdict: 'link', linkTo: 55 });
    const ledger = new Ledger(path.join(tmp(), 'l.json'));
    await apply({
      plan: doc,
      gh,
      git: git('blob1'),
      ledger,
      pacer: instantPacer(),
      date: 'd',
    });
    const issue = gh.issues.loom.find(i => i.number === 55);
    expect(issue.labels.map(l => l.name).sort()).toEqual([
      'P2',
      'migrated-from-backlog',
    ]);
    expect(issue.comments).toHaveLength(1);
    expect(ledger.get(r.key)).toMatchObject({
      action: 'linked',
      issue: 55,
      addedLabels: ['P2', 'migrated-from-backlog'],
    });
  });

  test('labelsFor: exactly one P, then type, area, extras, provenance', () => {
    expect(
      labelsFor({
        priority: 'P1',
        type: 'bug',
        area: 'infra',
        labels: ['needs-input'],
      })
    ).toEqual(['P1', 'bug', 'infra', 'needs-input', 'migrated-from-backlog']);
    expect(
      labelsFor({ priority: 'P3', type: null, area: null, labels: [] })
    ).toEqual(['P3', 'migrated-from-backlog']);
  });

  test('split override files sub-issues under the parent', async () => {
    const md =
      '## P1 — do next\n\n### Parent thing\nintro\n#### Stage 2 — later\nwork\n#### Stage 3 — later\nmore\n';
    const gh = fakeGh();
    const { plan: doc } = plan({
      repo: 'loom',
      text: md,
      sourceSha: 's',
      sourceRef: 'r',
      blob: 'b',
      gh,
      date: 'd',
    });
    doc.rows[0].split = ['Stage 2', 'Stage 3'];
    const s = await apply({
      plan: doc,
      gh,
      git: git('b'),
      ledger: new Ledger(path.join(tmp(), 'l.json')),
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s.created).toBe(3);
    const kids = gh.issues.loom.filter(i => i.parent);
    expect(kids.map(k => k.title)).toEqual([
      'Stage 2 — later',
      'Stage 3 — later',
    ]);
    expect(kids[0].body).toContain('work');
    expect(kids[0].body).not.toContain('more');
  });
});

describe('rollback', () => {
  test('closes created issues not-planned, never deletes, and unlabels links', async () => {
    const gh = fakeGh();
    const ledger = new Ledger(path.join(tmp(), 'l.json'));
    await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger,
      pacer: instantPacer(),
      date: 'd',
    });
    const out = await rollback({ ledger, gh, pacer: instantPacer() });
    expect(out.closed).toBe(9);
    const created = [...gh.issues.loom, ...gh.issues.alate];
    expect(created).toHaveLength(9); // nothing deleted
    expect(
      created.every(
        i => i.state === 'CLOSED' && i.stateReason === 'not planned'
      )
    ).toBe(true);
    expect(
      created.every(
        i => !i.labels.some(l => l.name === 'migrated-from-backlog')
      )
    ).toBe(true);
    expect(gh.calls.some(c => /delete/i.test(c[0]))).toBe(false);

    // Idempotent.
    const w = gh.writes;
    await rollback({ ledger, gh, pacer: instantPacer() });
    expect(gh.writes).toBe(w);
  });

  test('dry run lists what it would close', async () => {
    const gh = fakeGh();
    const ledger = new Ledger(path.join(tmp(), 'l.json'));
    await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger,
      pacer: instantPacer(),
      date: 'd',
    });
    const w = gh.writes;
    const out = await rollback({
      ledger,
      gh,
      pacer: instantPacer(),
      dryRun: true,
    });
    expect(out.planned).toHaveLength(9);
    expect(gh.writes).toBe(w);
  });
});

describe('rewrite (local only)', () => {
  function repoDir() {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'docs', 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'BACKLOG.md'), 'old\ncontent\n');
    fs.writeFileSync(
      path.join(dir, 'docs', 'backlog', 'fit-graph.md'),
      '# Fit graph\n\nbody\n'
    );
    fs.writeFileSync(
      path.join(dir, 'docs', 'backlog', 'orphan.md'),
      'no heading\n'
    );
    fs.writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      'see docs/backlog/fit-graph.md and BACKLOG.md\n'
    );
    fs.writeFileSync(
      path.join(dir, 'memory', 'project_regression_log.md'),
      'docs/backlog/fit-graph.md\n'
    );
    return dir;
  }
  const ledgerWith = recs => {
    const l = new Ledger(path.join(tmp(), 'l.json'));
    recs.forEach(r => l.upsert(r));
    return l;
  };

  test('pointer, brief move with Tracking header, link rewrite, history left alone', () => {
    const dir = repoDir();
    const ledger = ledgerWith([
      {
        key: 'a',
        issue: 12,
        repo: 'alate',
        sourceSha: '35a69e1',
        briefs: ['docs/backlog/fit-graph.md'],
        action: 'created',
      },
    ]);
    const report = rewrite({ repo: 'alate', dir, ledger });
    const pointer = fs.readFileSync(path.join(dir, 'BACKLOG.md'), 'utf8');
    expect(pointer).toContain('<!-- backlog-retired -->');
    expect(pointer).toContain('`35a69e1`');
    expect(
      fs.readFileSync(path.join(dir, 'docs', 'briefs', 'fit-graph.md'), 'utf8')
    ).toBe('# Fit graph\n\n**Tracking:** alate#12\n\nbody\n');
    expect(fs.existsSync(path.join(dir, 'docs', 'backlog'))).toBe(false);
    expect(report.untracked).toEqual(['docs/backlog/orphan.md']);
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toContain(
      'docs/briefs/fit-graph.md'
    );
    expect(
      fs.readFileSync(
        path.join(dir, 'memory', 'project_regression_log.md'),
        'utf8'
      )
    ).toBe('docs/backlog/fit-graph.md\n');
    expect(report.mentions).toEqual(['CLAUDE.md:1']);
    expect(report.freezeGuard).toBe(FREEZE_GUARD);
  });

  test('refuses a ledger with mixed source SHAs, or an unfinished apply', () => {
    const dir = repoDir();
    expect(() =>
      rewrite({
        repo: 'alate',
        dir,
        ledger: ledgerWith([
          { key: 'a', issue: 1, sourceSha: 'x' },
          { key: 'b', issue: 2, sourceSha: 'y' },
        ]),
      })
    ).toThrow(/2 source SHAs/);
    expect(() =>
      rewrite({
        repo: 'alate',
        dir,
        ledger: ledgerWith([{ key: 'a', issue: 1, sourceSha: 'x' }]),
        plan: {
          rows: [
            { key: 'a', verdict: 'create' },
            { key: 'b', verdict: 'create' },
          ],
        },
      })
    ).toThrow(/finish apply first/);
    expect(fs.readFileSync(path.join(dir, 'BACKLOG.md'), 'utf8')).toBe(
      'old\ncontent\n'
    );
  });
});

describe('freeze guard', () => {
  test('is the RFD §5.7 one-liner', () => {
    expect(FREEZE_GUARD).toMatch(/grep -q 'backlog-retired' BACKLOG.md/);
    expect(FREEZE_GUARD).toMatch(/wi new/);
  });
});
