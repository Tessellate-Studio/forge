// RFD 005 §4: bootstrap renames by key, merges a revived duplicate, and
// deletes only what the owner retired by name. Offline (FakeGitHub).

const { bootstrap, planRetire, liveMap } = require('../bootstrap');
const L = require('../lib/labels');
const {
  FakeGitHub,
  instantPacer,
} = require('../../backlog-migrate/test-support/fake-github');

const spec = key => L.canonicalFor('alate').find(l => l.key === key);

function fake(labels, issues = []) {
  return new FakeGitHub({
    labels: { alate: labels },
    issues: { alate: issues },
  });
}

describe('merge a revived duplicate', () => {
  it('moves every item to the canonical label, then deletes the duplicate', async () => {
    const bug = spec('bug');
    const gh = fake(
      [
        { ...bug, name: '🐛 bug' },
        { name: 'bug', color: 'ededed', description: '' },
      ],
      [
        { number: 1, state: 'OPEN', labels: [{ name: 'bug' }], comments: [] },
        {
          number: 2,
          state: 'CLOSED',
          labels: [{ name: '🐛 bug' }, { name: 'bug' }],
          comments: [],
        },
      ]
    );

    // Display names follow the switch; force the emoji form for this case.
    const canonical = L.canonicalFor('alate').map(l =>
      l.key === 'bug' ? { ...l, name: '🐛 bug' } : l
    );
    const plan = L.planLabels(gh.listLabels('alate'), canonical);
    expect(plan.merge).toEqual([{ from: 'bug', into: '🐛 bug' }]);

    await bootstrap({ repo: 'alate', gh, pacer: instantPacer(), canonical });
    expect(gh.listLabels('alate').map(l => l.name)).not.toContain('bug');
    const issues = gh.listIssues('alate');
    expect(issues.map(i => i.labels.map(l => l.name))).toEqual([
      ['🐛 bug'],
      ['🐛 bug'],
    ]);
  });
});

describe('planRetire', () => {
  const canonical = L.canonicalFor('alate');
  it('deletes only names the owner listed, never a canonical label', () => {
    const existing = [
      { name: 'stale' },
      { name: 'bug' },
      { name: 'javascript' },
    ];
    expect(
      planRetire(existing, canonical, ['stale', 'bug', 'not-here'])
    ).toEqual(['stale']);
  });
  it('a retired name in emoji form of a canonical key is still kept', () => {
    expect(planRetire([{ name: '🐛 bug' }], canonical, ['🐛 bug'])).toEqual([]);
  });
  it('no repo retires a label the registry wants (owner list vs registry)', () => {
    for (const repo of Object.keys(L.RETIRED)) {
      const keys = new Set(L.canonicalFor(repo).map(l => l.key.toLowerCase()));
      for (const name of L.retiredFor(repo)) {
        expect([repo, name, keys.has(name.toLowerCase())]).toEqual([
          repo,
          name,
          false,
        ]);
      }
    }
  });
});

describe('--prune deletes a retired label only while it is on nothing', () => {
  it('deletes the empty one and keeps the one applied since', async () => {
    const gh = fake(
      [{ name: 'stale' }, { name: 'wontfix' }],
      [
        {
          number: 7,
          state: 'OPEN',
          labels: [{ name: 'wontfix' }],
          comments: [],
        },
      ]
    );
    jest.replaceProperty(L.RETIRED, 'alate', ['stale', 'wontfix']);
    const logs = [];
    await bootstrap({
      repo: 'alate',
      gh,
      pacer: instantPacer(),
      prune: true,
      canonical: [],
      log: s => logs.push(s),
    });
    expect(gh.listLabels('alate').map(l => l.name)).toEqual(['wontfix']);
    expect(gh.listIssues('alate')[0].labels.map(l => l.name)).toEqual([
      'wontfix',
    ]);
    expect(logs.join('\n')).toMatch(/kept retired "wontfix": it is on 1 item/);
  });
});

describe('liveMap', () => {
  it('maps every canonical key to the name the repo actually has', () => {
    const canonical = L.canonicalFor('alate');
    const map = liveMap([{ name: '🐛 bug' }, { name: 'P1' }], canonical);
    expect(map.bug).toBe('🐛 bug');
    expect(map.P1).toBe('P1');
    expect(map['needs-triage']).toBe(L.displayName('needs-triage'));
    expect(Object.keys(map)).toHaveLength(canonical.length);
  });
});
