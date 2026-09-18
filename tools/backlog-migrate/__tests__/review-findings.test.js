// Regression tests for the findings of the pre-PR code review. Each test is
// named after the defect it pins, and each failed against the code as it
// stood when the review ran.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseBacklog } = require('../lib/parse');
const { classifyEntries } = require('../lib/classify');
const { plan, apply, rewrite } = require('../lib/commands');
const { Ledger } = require('../lib/ledger');
const { entryKey } = require('../lib/render');
const { FakeGitHub, instantPacer } = require('../test-support/fake-github');

const LABELS = [
  'P0',
  'P1',
  'P2',
  'P3',
  'feature',
  'bug',
  'chore',
  'refactor',
  'needs-input',
  'migrated-from-backlog',
].map(name => ({ name }));
const tmpLedger = () =>
  new Ledger(
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')), 'l.json')
  );
const git = () => () => 'b\n';

test('mergeInto does not duplicate text when plan classifies twice (online)', () => {
  const md = '## P2\n\n- **Alpha thing** — a\n- **Beta thing** — b\n';
  const keyB = entryKey('loom', 'Beta thing');
  const keyA = entryKey('loom', 'Alpha thing');
  const gh = new FakeGitHub();
  const { plan: doc } = plan({
    repo: 'loom',
    text: md,
    sourceSha: 's',
    gh,
    overrides: { [keyB]: { mergeInto: keyA } },
    date: 'd',
  });
  expect(doc.rows).toHaveLength(1);
  expect(doc.rows[0].text.match(/Beta thing/g)).toHaveLength(1);
});

describe('split children', () => {
  const md =
    '## P1 — do next\n\n### Parent thing\nintro\n#### Stage 2 — a\nwork\n#### Stage 3 — b\nmore\n';
  function splitPlan(gh) {
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
    return doc;
  }

  test('a stop after the parent does not strand the children on re-run', async () => {
    const gh = new FakeGitHub({ labels: { loom: LABELS }, failOnWrite: 2 });
    const doc = splitPlan(gh);
    const ledger = tmpLedger();
    await expect(
      apply({
        plan: doc,
        gh,
        git: git(),
        ledger,
        pacer: instantPacer(),
        date: 'd',
      })
    ).rejects.toThrow('simulated crash');
    gh.failOnWrite = null;
    const s = await apply({
      plan: doc,
      gh,
      git: git(),
      ledger: new Ledger(ledger.file),
      pacer: instantPacer(),
      date: 'd',
    });
    expect(s.created).toBe(2);
    const parent = gh.issues.loom.find(i => !i.parent);
    expect(
      gh.issues.loom.filter(i => i.parent === parent.number).map(i => i.title)
    ).toEqual(['Stage 2 — a', 'Stage 3 — b']);
  });

  test('--max also caps the children', async () => {
    const gh = new FakeGitHub({ labels: { loom: LABELS } });
    const s = await apply({
      plan: splitPlan(gh),
      gh,
      git: git(),
      ledger: tmpLedger(),
      pacer: instantPacer(),
      max: 2,
      date: 'd',
    });
    expect(s.created).toBe(2);
    expect(s.stoppedAtMax).toBe(true);
  });
});

test('link never gives an issue a second P label', async () => {
  const gh = new FakeGitHub({
    labels: { loom: LABELS },
    issues: {
      loom: [
        {
          number: 7,
          title: 'x',
          body: '',
          state: 'OPEN',
          labels: [{ name: 'P2' }],
          comments: [],
        },
      ],
    },
  });
  const { plan: doc } = plan({
    repo: 'loom',
    text: '## P1 — do next\n\n- **Thing** — loom#7\n',
    sourceSha: 's',
    sourceRef: 'r',
    blob: 'b',
    gh,
    date: 'd',
  });
  Object.assign(doc.rows[0], { verdict: 'link', linkTo: 7 });
  await apply({
    plan: doc,
    gh,
    git: git(),
    ledger: tmpLedger(),
    pacer: instantPacer(),
    date: 'd',
  });
  const names = gh.issues.loom[0].labels.map(l => l.name).sort();
  expect(names).toEqual(['P2', 'migrated-from-backlog']);
});

test('a targetRepo override is applied before linking, so the link is found in the new repo', () => {
  const md = '## P2\n\n- **Widget polish** — alate#42 and litmus#42\n';
  const key = entryKey('alate', 'Widget polish');
  const remote = {
    alate: {
      issues: [{ number: 42, title: 'Widget polish', state: 'OPEN', body: '' }],
      prs: [],
    },
    litmus: {
      issues: [
        { number: 42, title: 'Unrelated flaky spec', state: 'OPEN', body: '' },
      ],
      prs: [],
    },
  };
  const [r] = classifyEntries(parseBacklog(md), {
    repo: 'alate',
    sourceSha: 's',
    remote,
    overrides: { [key]: { targetRepo: 'litmus' } },
  });
  expect(r.targetRepo).toBe('litmus');
  expect(r.verdict).toBe('create'); // litmus#42 is not this entry
  expect(r.linkTo).toBeNull();
});

test('dry run honours --max the way a real run would', async () => {
  const md = '## P2\n\n- **One** — a\n- **Two** — b\n- **Three** — c\n';
  const gh = new FakeGitHub({ labels: { loom: LABELS } });
  const { plan: doc } = plan({
    repo: 'loom',
    text: md,
    sourceSha: 's',
    sourceRef: 'r',
    blob: 'b',
    gh,
    date: 'd',
  });
  const s = await apply({
    plan: doc,
    gh,
    git: git(),
    ledger: tmpLedger(),
    pacer: instantPacer(),
    max: 2,
    dryRun: true,
    date: 'd',
  });
  expect(s.planned).toHaveLength(2);
  expect(s.stoppedAtMax).toBe(true);
});

test('two entries with one title get distinct keys, so an override can address each', () => {
  const md = '## P2\n\n- **Same title** — first\n- **Same title** — second\n';
  const rows = classifyEntries(parseBacklog(md), {
    repo: 'loom',
    sourceSha: 's',
  });
  expect(rows[0].key).not.toBe(rows[1].key);
  expect(rows.map(r => r.verdict)).toEqual(['create', 'review']);
  const overridden = classifyEntries(parseBacklog(md), {
    repo: 'loom',
    sourceSha: 's',
    overrides: { [rows[1].key]: { verdict: 'skip-resolved' } },
  });
  expect(overridden.map(r => r.verdict)).toEqual(['create', 'skip-resolved']);
});

test('rewrite ignores rolled-back records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-'));
  fs.writeFileSync(path.join(dir, 'BACKLOG.md'), 'old\n');
  const ledger = tmpLedger();
  ledger.upsert({ key: 'a', issue: 1, sourceSha: 'x', rolledBack: true });
  expect(() => rewrite({ repo: 'loom', dir, ledger })).toThrow(/0 source SHAs/);
  expect(fs.readFileSync(path.join(dir, 'BACKLOG.md'), 'utf8')).toBe('old\n');
});
