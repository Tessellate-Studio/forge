const { main } = require('../cli');
const L = require('../lib/labels');

function run(argv, live) {
  const out = [];
  const err = [];
  const code = main(argv, {
    run: () => JSON.stringify(live || []),
    out: s => out.push(s),
    err: s => err.push(s),
  });
  return { code, out, err };
}

describe('forge-label', () => {
  it('prints the registry display name without --repo', () => {
    expect(run(['P1']).out).toEqual([L.displayName('P1')]);
  });
  it('prints the repo live name with --repo, whichever form it has', () => {
    expect(run(['P1', '--repo', 'alate'], [{ name: '🔴 P1' }]).out).toEqual([
      '🔴 P1',
    ]);
    expect(run(['P1', '--repo', 'alate'], [{ name: 'P1' }]).out).toEqual([
      'P1',
    ]);
  });
  it('fails loudly when the repo has no such label', () => {
    const r = run(['P1', '--repo', 'alate'], [{ name: 'bug' }]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
  });
  it('usage error without a key', () => {
    expect(run([]).code).toBe(2);
  });
  it('--repo before the key: its value is not taken as the key', () => {
    expect(run(['--repo', 'alate', 'P1'], [{ name: '🔴 P1' }]).out).toEqual([
      '🔴 P1',
    ]);
  });
});
