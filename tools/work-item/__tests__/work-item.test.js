const { buildIssue, findDuplicate, wiNew } = require('../lib/work-item');
const { main } = require('../cli');
const {
  FakeGitHub,
} = require('../../backlog-migrate/test-support/fake-github');

const base = {
  repo: 'loom',
  title: 'Add a collection picker',
  priority: 'P2',
  what: 'Pick collections from a list',
  why: 'Merchants paste raw ids today',
  'done-when': 'Picker lists collections',
};

describe('exactly one P label', () => {
  test('missing priority is refused', () => {
    const { priority, ...noP } = base;
    expect(priority).toBe('P2');
    expect(() => buildIssue(noP)).toThrow(/exactly one P label/);
  });

  test('a second P via --label is refused, not silently merged', () => {
    expect(() => buildIssue({ ...base, label: ['P0'] })).toThrow(
      /exactly one P label is required \(got P2, P0\)/
    );
  });

  test('a P label passed only through --label counts as the one', () => {
    const { priority, ...noP } = base;
    expect(priority).toBeTruthy();
    expect(buildIssue({ ...noP, label: ['p1'] }).labels[0]).toBe('P1');
  });

  test('P4 and junk are refused', () => {
    expect(() => buildIssue({ ...base, priority: 'P4' })).toThrow(/P0–P3/);
    expect(() => buildIssue({ ...base, priority: 'high' })).toThrow(/P0–P3/);
  });
});

describe('rendering', () => {
  test('labels: P first, then type, area, extras; enhancement → feature', () => {
    const i = buildIssue({
      ...base,
      type: 'enhancement',
      area: 'admin-ui',
      label: ['needs-input'],
    });
    expect(i.labels).toEqual(['P2', 'feature', 'admin-ui', 'needs-input']);
  });

  test('the body uses the form section headings, _No response_ for empty optionals', () => {
    const i = buildIssue({ ...base, effort: '2', reach: '10' });
    expect(i.body).toBe(
      '### What\n\nPick collections from a list\n\n' +
        '### Why / evidence\n\nMerchants paste raw ids today\n\n' +
        '### Done when\n\nPicker lists collections\n\n' +
        '### Context & history\n\n_No response_\n\n' +
        '### Effort (person-days)\n\n2\n\n' +
        '### Reach\n\n10 — early testers\n'
    );
  });

  test('required sections, option values and per-repo areas are validated', () => {
    expect(() => buildIssue({ ...base, why: '' })).toThrow(/--why is required/);
    expect(() => buildIssue({ ...base, effort: '4' })).toThrow(
      /--effort must be one of/
    );
    expect(() => buildIssue({ ...base, type: 'epic' })).toThrow(/--type/);
    expect(() => buildIssue({ ...base, area: 'mobile' })).toThrow(
      /loom must be one of admin-ui/
    );
    expect(() =>
      buildIssue({ ...base, repo: 'mood-layer', area: 'ui' })
    ).toThrow(/no area labels/);
    expect(
      buildIssue({ ...base, repo: 'alate', area: 'fit-engine' }).labels
    ).toContain('fit-engine');
  });
});

describe('list-before-create', () => {
  const open = [{ number: 9, title: 'Collection picker for charts', body: '' }];

  test('findDuplicate matches on title overlap', () => {
    expect(
      findDuplicate('Add a collection picker for charts', open).number
    ).toBe(9);
    expect(findDuplicate('Webhook dead letters', open)).toBeNull();
  });

  test('a likely duplicate is refused without writing; --force files anyway', () => {
    const gh = new FakeGitHub({
      issues: {
        loom: open.map(i => ({
          ...i,
          state: 'OPEN',
          labels: [],
          comments: [],
        })),
      },
    });
    const r = wiNew(
      { ...base, title: 'Collection picker for the charts' },
      { gh }
    );
    expect(r.status).toBe('duplicate');
    expect(gh.writes).toBe(0);
    const f = wiNew(
      { ...base, title: 'Collection picker for the charts', force: true },
      { gh }
    );
    expect(f.status).toBe('created');
    expect(gh.issues.loom.at(-1).labels.map(l => l.name)).toEqual(['P2']);
  });

  test('dry run lists nothing and writes nothing', () => {
    const gh = new FakeGitHub();
    expect(wiNew(base, { gh, dryRun: true }).status).toBe('dry-run');
    expect(gh.calls).toEqual([]);
  });
});

describe('cli', () => {
  const run = (argv, gh = new FakeGitHub()) => {
    const out = [];
    const err = [];
    const code = main(argv, {
      gh,
      out: s => out.push(s),
      err: s => err.push(s),
    });
    return { code, out: out.join('\n'), err: err.join('\n'), gh };
  };
  const args = [
    'new',
    '--repo',
    'loom',
    '--title',
    'T',
    '--what',
    'w',
    '--why',
    'y',
    '--done-when',
    'd',
  ];

  test('usage error without a P label exits 2', () => {
    const r = run(args);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/exactly one P label/);
  });

  test('--dry-run prints the issue', () => {
    const r = run([
      ...args,
      '--priority',
      'P1',
      '--label',
      'needs-input',
      '--dry-run',
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/labels: P1, needs-input/);
    expect(r.gh.writes).toBe(0);
  });

  test('creates and prints the URL', () => {
    const r = run([...args, '--priority', 'P3']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/issues\/1000$/);
  });
});
