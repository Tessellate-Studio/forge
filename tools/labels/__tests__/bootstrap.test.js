// Offline: FakeGitHub stands in for gh. Nothing here can create a real label.

const { bootstrap } = require('../bootstrap');
const L = require('../lib/labels');
const { AREA_SETS } = require('../../backlog-migrate/lib/classify');
const {
  FakeGitHub,
  instantPacer,
} = require('../../backlog-migrate/test-support/fake-github');

// A snapshot of mood-layer's live labels on 2026-09-19 (the subset that matters).
const MOOD = [
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'feature', color: '0E8A16', description: 'New functionality' },
  {
    name: 'P0',
    color: 'B60205',
    description: 'Priority 0 — blocker / pre-launch',
  },
  {
    name: 'critical',
    color: 'B60205',
    description: 'Production-breaking, fix immediately',
  },
  { name: 'high', color: 'D93F0B', description: 'Important, fix soon' },
  {
    name: 'data',
    color: '5319E7',
    description: 'On-device store, persistence, migrations',
  },
  {
    name: 'ui',
    color: '1D76DB',
    description: 'Screens, components, visual design',
  },
  { name: 'infra', color: 'E4E669', description: 'Infrastructure/CI/CD' },
];

describe('canonical set', () => {
  test('P0–P3 carry the owner-specified colours and descriptions', () => {
    expect(L.PRIORITY).toEqual([
      { name: 'P0', color: 'B60205', description: 'blocker / pre-launch' },
      { name: 'P1', color: 'D93F0B', description: 'do next' },
      { name: 'P2', color: 'FBCA04', description: 'soon' },
      { name: 'P3', color: 'C5DEF5', description: 'later' },
    ]);
  });

  test('every repo gets P, type, lifecycle, provenance and device-test labels', () => {
    const names = L.canonicalFor('badige').map(l => l.name);
    for (const n of [
      'P0',
      'P3',
      'bug',
      'feature',
      'chore',
      'refactor',
      'decision',
      'on hold',
      'claimed',
      'needs-input',
      'needs-triage',
      'migrated-from-backlog',
      'device-test',
      'needs-human',
      'needs-build',
      'parked',
      'failed',
    ]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  test('area labels: loom keeps its set, alate gets the new set, mood-layer and badige none', () => {
    const area = repo => (L.AREA[repo] ? L.AREA[repo].map(l => l.name) : []);
    expect(area('loom')).toEqual([
      'admin-ui',
      'api',
      'sdk',
      'extension',
      'supabase',
      'infra',
    ]);
    expect(area('alate')).toEqual([
      'mobile',
      'backend',
      'scraper',
      'fit-engine',
      'infra',
    ]);
    expect(L.canonicalFor('mood-layer').map(l => l.name)).not.toContain('data');
    expect(
      L.canonicalFor('Tessellate-Studio/badige').map(l => l.name)
    ).not.toContain('infra');
    expect(
      L.canonicalFor('Tessellate-Studio/alate').map(l => l.name)
    ).toContain('fit-engine');
  });

  test('the migration infers exactly the areas bootstrap creates', () => {
    expect(AREA_SETS).toEqual({ loom: area('loom'), alate: area('alate') });
    function area(r) {
      return L.AREA[r].map(l => l.name);
    }
  });
});

describe('bootstrap', () => {
  test('dry run reports and writes nothing', async () => {
    const gh = new FakeGitHub({
      labels: { 'mood-layer': MOOD.map(l => ({ ...l })) },
    });
    const lines = [];
    const plan = await bootstrap({
      repo: 'mood-layer',
      gh,
      pacer: instantPacer(),
      dryRun: true,
      log: s => lines.push(s),
    });
    expect(gh.writes).toBe(0);
    expect(plan.edit.map(l => l.name)).toEqual(['P0']); // description aligned
    expect(plan.create.map(l => l.name)).toContain('P1');
    expect(lines.join('\n')).toMatch(/would create P1 #D93F0B "do next"/);
    expect(lines.join('\n')).toMatch(
      /legacy priority labels present .*critical, high/
    );
  });

  test('creates, aligns, then a second run makes zero writes; never deletes', async () => {
    const gh = new FakeGitHub({
      labels: { 'mood-layer': MOOD.map(l => ({ ...l })) },
    });
    await bootstrap({ repo: 'mood-layer', gh, pacer: instantPacer() });
    const first = gh.writes;
    expect(first).toBeGreaterThan(0);
    const names = gh.labels['mood-layer'].map(l => l.name);

    // mood-layer's area labels and legacy labels are left exactly as they were.
    for (const keep of ['data', 'ui', 'infra', 'critical', 'high']) {
      expect(names).toContain(keep);
    }
    expect(gh.labels['mood-layer'].find(l => l.name === 'data')).toEqual(
      MOOD.find(l => l.name === 'data')
    );
    expect(gh.calls.some(c => /delete/i.test(c[0]))).toBe(false);

    await bootstrap({ repo: 'mood-layer', gh, pacer: instantPacer() });
    expect(gh.writes).toBe(first);
  });

  test('a case-only name difference is fixed by rename, not duplicated', async () => {
    const gh = new FakeGitHub({
      labels: {
        forge: [{ name: 'On Hold', color: 'bfd4f2', description: 'x' }],
      },
    });
    await bootstrap({ repo: 'forge', gh, pacer: instantPacer() });
    const holds = gh.labels.forge.filter(
      l => l.name.toLowerCase() === 'on hold'
    );
    expect(holds).toEqual([expect.objectContaining({ name: 'on hold' })]);
  });

  test('alate would get its five area labels', async () => {
    const gh = new FakeGitHub({ labels: { alate: [] } });
    const plan = await bootstrap({
      repo: 'alate',
      gh,
      pacer: instantPacer(),
      dryRun: true,
    });
    expect(plan.create.map(l => l.name)).toEqual(
      expect.arrayContaining([
        'mobile',
        'backend',
        'scraper',
        'fit-engine',
        'infra',
      ])
    );
  });
});
