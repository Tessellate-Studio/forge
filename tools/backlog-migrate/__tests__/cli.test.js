const fs = require('fs');
const os = require('os');
const path = require('path');
const { main, parseArgs } = require('../cli');

describe('cli', () => {
  let err;
  let log;
  beforeEach(() => {
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    err.mockRestore();
    log.mockRestore();
  });

  test('parseArgs reads flags and values', () => {
    expect(
      parseArgs(['apply', '--repo', 'loom', '--max', '25', '--dry-run'])
    ).toEqual({
      _: 'apply',
      repo: 'loom',
      max: '25',
      'dry-run': true,
    });
    expect(() => parseArgs(['plan', 'stray'])).toThrow(/unexpected argument/);
  });

  test('no command or no --repo is a usage error; --help is not', async () => {
    expect(await main([])).toBe(2);
    expect(await main(['plan'])).toBe(2);
    expect(await main(['--help'])).toBe(0);
  });

  test('apply refuses an offline plan (it never deduped) before touching GitHub', async () => {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')),
      'p.json'
    );
    fs.writeFileSync(
      f,
      JSON.stringify({ repo: 'loom', online: false, rows: [] })
    );
    await expect(
      main(['apply', '--repo', 'loom', '--plan', f, '--dry-run'])
    ).rejects.toThrow(/offline plan/);
  });

  test('apply refuses a plan made for another repo', async () => {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')),
      'p.json'
    );
    fs.writeFileSync(
      f,
      JSON.stringify({ repo: 'alate', online: true, rows: [] })
    );
    await expect(
      main(['apply', '--repo', 'loom', '--plan', f, '--dry-run'])
    ).rejects.toThrow(/plan is for alate/);
  });
});
