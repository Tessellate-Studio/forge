// Fixes for what the loom pilot (loom#175) had to do by hand, RFD 004 step 4:
//   1. `**Title.**` kept the full stop in the issue title.
//   2. An area was inferred for a cross-repo target that has no area labels
//      (loom's alate entry → `backend`), so apply refused.
//   3. rewrite scanned only .md files; workflow YAML and .husky hooks that
//      mention BACKLOG were found by hand.
//   4. rewrite did not put the roadmap-Artifact pointer on WEEKLY_DIGEST.md.
//   +  apply refused a cross-repo target lacking `migrated-from-backlog` /
//      type labels; the pilot created them by hand in alate.
//   +  the freeze guard contains `$'`, which a String#replace replacement
//      string expands to "the rest of the file".

const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/render');
const { parseBacklog } = require('../lib/parse');
const { classifyEntries, AREA_SETS } = require('../lib/classify');
const {
  plan,
  apply,
  rewrite,
  insertFreezeGuard,
  FREEZE_GUARD,
} = require('../lib/commands');
const { Ledger } = require('../lib/ledger');
const { AREA, canonicalFor } = require('../../labels/lib/labels');
const { FakeGitHub, instantPacer } = require('../test-support/fake-github');

const LOOM = fs.readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'loom.BACKLOG.md'),
  'utf8'
);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bm-pilot-'));
const names = list => list.map(name => ({ name }));
const git = blob => args => args[0] === 'rev-parse' ? `${blob}\n` : '';
const planFor = gh =>
  plan({
    repo: 'loom',
    text: LOOM,
    sourceSha: 'ab17d1b',
    sourceRef: 'origin/main',
    blob: 'blob1',
    gh,
    date: '2026-09-19',
  }).plan;
const LOOM_ALL = canonicalFor('loom').map(l => ({ name: l.name }));

describe('1. titles', () => {
  test('one trailing full stop is dropped; an ellipsis and inner dots stay', () => {
    expect(R.renderTitle('**Instrument admin/ with Sentry.**')).toBe(
      'Instrument admin/ with Sentry'
    );
    expect(R.renderTitle('Wait for v2.1...')).toBe('Wait for v2.1...');
    expect(R.renderTitle('Bump to v2.1')).toBe('Bump to v2.1');
  });

  test('the key is unchanged, so a re-run over a migrated repo still dedupes', () => {
    expect(R.entryKey('loom', 'Title.')).not.toBe(R.entryKey('loom', 'Title'));
  });
});

describe('2. area: only the target repo configured set, only if it has the label', () => {
  test('area sets are exactly the tools/labels AREA config', () => {
    for (const [repo, set] of Object.entries(AREA)) {
      expect(AREA_SETS[repo]).toEqual(set.map(l => l.name));
    }
    expect(Object.keys(AREA_SETS).sort()).toEqual(Object.keys(AREA).sort());
  });

  test('online: a cross-repo target without the label gets no area, with a note', () => {
    const remote = {
      loom: { issues: [], prs: [], labels: LOOM_ALL },
      alate: { issues: [], prs: [], labels: names(['P2', 'feature']) },
    };
    const rows = classifyEntries(parseBacklog(LOOM), {
      repo: 'loom',
      sourceSha: 'abc1234',
      remote,
    });
    const alateRow = rows.find(r => r.targetRepo === 'alate');
    expect(alateRow.area).toBeNull();
    expect(alateRow.notes.join(';')).toMatch(/area backend dropped: alate/);

    // loom's own rows keep their areas: loom has the labels.
    expect(rows.find(r => r.startLine === 38).area).toBe('admin-ui');
  });

  test('a target repo outside loom/alate never gets an area', () => {
    const text =
      '## P2\n\n- **Fix the CI runner timeouts (badige repo)** — `.github/workflows/ci.yml` and `.github/x.yml`\n';
    const rows = classifyEntries(parseBacklog(text), {
      repo: 'loom',
      sourceSha: 'abc1234',
    });
    expect(rows[0].targetRepo).toBe('badige');
    expect(rows[0].area).toBeNull();
  });
});

describe('+ overrides: decisionPr and deferredUntil', () => {
  test('a residual can be tied to its decision PR and carry a deferral trigger', () => {
    const rows0 = classifyEntries(parseBacklog(LOOM), {
      repo: 'loom',
      sourceSha: 'abc1234',
    });
    const key = rows0.find(r => r.startLine === 63).key;
    const [row] = classifyEntries(parseBacklog(LOOM), {
      repo: 'loom',
      sourceSha: 'abc1234',
      overrides: {
        [key]: { decisionPr: 129, deferredUntil: 'the cadence feels slow' },
      },
    }).filter(r => r.key === key);
    expect(row.decisionPr).toBe(129);
    expect(row.labels).toContain('needs-input');
    const body = R.renderBody(row, { date: 'd' });
    expect(body).toContain('Blocked on decision PR #129 — merge = approve');
    expect(body).toContain('Deferred until: the cadence feels slow');
  });
});

describe('+ apply creates canonical labels on a cross-repo target', () => {
  test('missing provenance / type / P labels in alate are created, then the issue is filed', async () => {
    const gh = new FakeGitHub({ labels: { loom: LOOM_ALL, alate: [] } });
    const s = await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger: new Ledger(path.join(tmp(), 'l.json')),
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s.labelsCreated).toEqual(
      expect.arrayContaining(['alate:migrated-from-backlog', 'alate:P2'])
    );
    const made = gh.labels.alate.find(l => l.name === 'migrated-from-backlog');
    expect(made.color).toBe('EDEDED'); // canonical colour, not a guess
    expect(gh.labels.alate.some(l => l.name === 'backend')).toBe(false);
    expect(gh.issues.alate).toHaveLength(1);
  });

  test('the source repo is not auto-labelled: it still needs bootstrap', async () => {
    const gh = new FakeGitHub({ labels: { loom: names(['P2']), alate: [] } });
    await expect(
      apply({
        plan: planFor(gh),
        gh,
        git: git('blob1'),
        ledger: new Ledger(path.join(tmp(), 'l.json')),
        pacer: instantPacer(),
        date: 'd',
      })
    ).rejects.toThrow(/loom lacks label.*bootstrap/);
    expect(gh.writes).toBe(0);
  });

  test('dry run lists the label creates and writes nothing', async () => {
    const gh = new FakeGitHub({ labels: { loom: LOOM_ALL, alate: [] } });
    const s = await apply({
      plan: planFor(gh),
      gh,
      git: git('blob1'),
      ledger: new Ledger(path.join(tmp(), 'l.json')),
      pacer: instantPacer(),
      date: 'd',
      dryRun: true,
    });
    expect(
      s.planned.filter(p => p.startsWith('label alate:')).length
    ).toBeGreaterThan(0);
    expect(gh.writes).toBe(0);
  });
});

function repoDir({ digest = true } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.husky', '_'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), 'old\n');
  fs.writeFileSync(
    path.join(dir, '.github', 'workflows', 'ops.yml'),
    'on: push\n# tracked in BACKLOG P2\n'
  );
  fs.writeFileSync(
    path.join(dir, '.github', 'workflows', 'ci.yml'),
    'jobs:\n  root:\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n'
  );
  fs.writeFileSync(
    path.join(dir, '.husky', 'pre-commit'),
    'echo "entry in BACKLOG updated?"\n'
  );
  fs.writeFileSync(path.join(dir, '.husky', '_', 'h'), 'BACKLOG\n');
  if (digest) {
    fs.writeFileSync(path.join(dir, 'WEEKLY_DIGEST.md'), '# Weekly digest\n');
  }
  return dir;
}
const ledger = () => {
  const l = new Ledger(path.join(tmp(), 'l.json'));
  l.upsert({ key: 'a', issue: 3, repo: 'loom', sourceSha: 'ab17d1b' });
  return l;
};
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

describe('3. rewrite reports BACKLOG mentions in workflows and hooks', () => {
  test('workflow YAML and .husky hooks are scanned, report-only', () => {
    const dir = repoDir();
    const r = rewrite({ repo: 'loom', dir, ledger: ledger(), date: 'x' });
    expect(r.codeMentions.sort()).toEqual([
      '.github/workflows/ops.yml:2',
      '.husky/pre-commit:1',
    ]);
    expect(read(dir, '.github', 'workflows', 'ops.yml')).toContain(
      'BACKLOG P2'
    );
  });
});

describe('4. WEEKLY_DIGEST.md gets the roadmap Artifact pointer, once', () => {
  test('with a URL', () => {
    const dir = repoDir();
    const url = 'https://claude.ai/code/artifact/abc';
    const r = rewrite({
      repo: 'loom',
      dir,
      ledger: ledger(),
      date: '2026-09-19',
      digestUrl: url,
    });
    const text = read(dir, 'WEEKLY_DIGEST.md');
    expect(r.digest).toBe('pointer added');
    expect(text).toBe(
      `> **Retired 2026-09-19 (RFD 004 §4.6):** the digest is now the [roadmap Artifact](${url}). This file is no longer appended to; its history stays in git.\n\n# Weekly digest\n`
    );
    const again = rewrite({
      repo: 'loom',
      dir,
      ledger: ledger(),
      date: 'y',
      digestUrl: url,
    });
    expect(again.digest).toBe('already retired');
    expect(read(dir, 'WEEKLY_DIGEST.md')).toBe(text);
  });

  test('matches the pointer loom#175 wrote by hand, so a re-run leaves it', () => {
    const dir = repoDir({ digest: false });
    const loomLine =
      '> **Retired 2026-09-19 (RFD 004 §4.6):** the digest is now the [roadmap Artifact](https://claude.ai/code/artifact/44380a7d-1175-4eaf-8e7a-d058cb830b9c). This file is no longer appended to; its history stays in git.\n\n# Weekly digest\n';
    fs.writeFileSync(path.join(dir, 'WEEKLY_DIGEST.md'), loomLine);
    expect(rewrite({ repo: 'loom', dir, ledger: ledger() }).digest).toBe(
      'already retired'
    );
  });

  test('without a URL it says where the URL will live; no digest file → nothing', () => {
    const dir = repoDir();
    rewrite({ repo: 'loom', dir, ledger: ledger(), date: 'd' });
    expect(read(dir, 'WEEKLY_DIGEST.md')).toMatch(
      /artifactUrl.*\.roadmap-pulse-state\.json/
    );
    const bare = repoDir({ digest: false });
    expect(
      rewrite({ repo: 'loom', dir: bare, ledger: ledger() }).digest
    ).toBeNull();
    expect(fs.existsSync(path.join(bare, 'WEEKLY_DIGEST.md'))).toBe(false);
  });
});

describe("+ freeze guard insertion keeps `$'` intact", () => {
  test('a string replacer would mangle it; insertFreezeGuard does not', () => {
    const yaml = 'a\n      - uses: actions/checkout@v6\nTAIL\n';
    const mangled = yaml.replace(
      /- uses: actions\/checkout@v6\n/,
      `X ${FREEZE_GUARD}\n`
    );
    expect(mangled).not.toContain(FREEZE_GUARD); // the gotcha, pinned

    const out = insertFreezeGuard(yaml);
    expect(out).toContain(
      `      - name: BACKLOG.md is retired\n        run: ${FREEZE_GUARD}\n`
    );
    expect(out.endsWith('TAIL\n')).toBe(true);
    expect(insertFreezeGuard(out)).toBe(out);
    expect(insertFreezeGuard('jobs: {}\n')).toBeNull();
  });

  test('goes after the checkout step and its `with:` block', () => {
    const dir = repoDir();
    const r = rewrite({
      repo: 'loom',
      dir,
      ledger: ledger(),
      guardWorkflow: '.github/workflows/ci.yml',
    });
    expect(r.guard).toBe('inserted in .github/workflows/ci.yml');
    const ci = read(dir, '.github', 'workflows', 'ci.yml');
    const lines = ci.split('\n');
    const at = lines.findIndex(l => l.includes('name: BACKLOG.md is retired'));
    expect(lines[at - 4]).toBe('          fetch-depth: 0');
    expect(lines[at + 2]).toBe('      - uses: actions/setup-node@v6');
    expect(ci).toContain(FREEZE_GUARD);
  });
});
