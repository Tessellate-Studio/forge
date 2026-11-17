'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MANIFEST_PATH,
  STATE,
  checkBump,
  compareVersions,
  judge,
} = require('../lib/bump');
const { checkPrBump } = require('../lib/remote');

const manifest = version => JSON.stringify({ name: 'forge', version });

describe('compareVersions', () => {
  test.each([
    ['0.21.11', '0.21.10', 1],
    ['0.21.10', '0.21.10', 0],
    ['0.21.9', '0.21.10', -1], // numeric, not string, order
    ['0.22.0', '0.21.99', 1],
    ['1.0.0', '0.99.99', 1],
    ['1.0.0', '1.0.0-rc.1', 1],
    ['1.0.0-rc.2', '1.0.0-rc.10', -1],
    ['1.0.0-alpha', '1.0.0-1', 1],
    ['1.0.0+build.2', '1.0.0+build.1', 0],
  ])('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  test('throws on non-semver', () => {
    expect(() => compareVersions('0.21', '0.21.0')).toThrow(/not semver/);
  });
});

describe('judge', () => {
  test('green when the head is strictly higher', () => {
    const out = judge({
      head: manifest('0.21.12'),
      base: manifest('0.21.11'),
      baseRef: 'master',
    });
    expect(out.state).toBe(STATE.OK);
  });

  // forge#183 / forge#184, 2026-11-17: both bumped 0.21.9 → 0.21.10. Once
  // #183 merged, master read 0.21.10 and #184 must go red.
  test('red when another PR already took the same version', () => {
    const out = judge({
      head: manifest('0.21.10'),
      base: manifest('0.21.10'),
      baseRef: 'master',
    });
    expect(out.state).toBe(STATE.FAIL);
    expect(out.detail).toMatch(/equals master's/);
    expect(out.detail).toMatch(/another PR took that version/);
  });

  test('red when the head is lower', () => {
    const out = judge({ head: manifest('0.21.9'), base: manifest('0.21.10') });
    expect(out.state).toBe(STATE.FAIL);
    expect(out.detail).toMatch(/below/);
  });

  test('red when the head version is not semver or missing', () => {
    expect(
      judge({ head: manifest('next'), base: manifest('1.0.0') }).state
    ).toBe(STATE.FAIL);
    expect(judge({ head: '{}', base: manifest('1.0.0') }).state).toBe(
      STATE.FAIL
    );
    expect(judge({ head: 'not json', base: manifest('1.0.0') }).state).toBe(
      STATE.FAIL
    );
  });

  test('red when the PR deletes the manifest', () => {
    expect(judge({ head: null, base: manifest('1.0.0') }).state).toBe(
      STATE.FAIL
    );
  });

  test('skipped when the base has no manifest (a repo that is not a plugin)', () => {
    expect(judge({ head: null, base: null }).state).toBe(STATE.SKIP);
  });
});

describe('checkBump', () => {
  test('reads both refs through the injected reader', async () => {
    const files = { pr: manifest('2.0.0'), master: manifest('1.9.9') };
    const out = await checkBump({
      readManifest: async ref => files[ref] ?? null,
      headRef: 'pr',
      baseRef: 'master',
    });
    expect(out.state).toBe(STATE.OK);
  });

  test('a failed read rejects — it is never treated as "absent"', async () => {
    await expect(
      checkBump({
        readManifest: async () => {
          throw new Error('HTTP 502');
        },
        headRef: 'pr',
        baseRef: 'master',
      })
    ).rejects.toThrow(/502/);
  });
});

describe('checkPrBump (gh, live base tip)', () => {
  const fakeGh = ({ head, base, viewFails, readFails }) =>
    jest.fn(async args => {
      if (args[0] === 'pr') {
        return viewFails
          ? { stdout: '', stderr: 'HTTP 502', code: 1 }
          : {
              stdout: JSON.stringify({
                headRefOid: 'abc123',
                baseRefName: 'master',
              }),
              stderr: '',
              code: 0,
            };
      }
      if (readFails) {
        return { stdout: '', stderr: 'HTTP 500: boom', code: 1 };
      }
      const text = args[3].endsWith('ref=abc123') ? head : base;
      return text === null
        ? { stdout: '', stderr: 'gh: Not Found (HTTP 404)', code: 1 }
        : { stdout: text, stderr: '', code: 0 };
    });

  test('red when the base tip already carries the head version', async () => {
    const gh = fakeGh({ head: manifest('0.21.10'), base: manifest('0.21.10') });
    const out = await checkPrBump(gh, 'Tessellate-Studio/forge', 184);
    expect(out.state).toBe(STATE.FAIL);
    const reads = gh.mock.calls.map(([args]) => args[3]).filter(Boolean);
    expect(reads).toContain(
      `repos/Tessellate-Studio/forge/contents/${MANIFEST_PATH}?ref=master`
    );
  });

  test('green when higher', async () => {
    const gh = fakeGh({ head: manifest('0.21.12'), base: manifest('0.21.11') });
    expect((await checkPrBump(gh, 'o/r', 1)).state).toBe(STATE.OK);
  });

  test('skip when the base has no manifest', async () => {
    const gh = fakeGh({ head: null, base: null });
    expect((await checkPrBump(gh, 'o/r', 1)).state).toBe(STATE.SKIP);
  });

  test('error, not OK, when GitHub cannot be read', async () => {
    expect(
      (await checkPrBump(fakeGh({ viewFails: true }), 'o/r', 1)).state
    ).toBe('error');
    expect(
      (await checkPrBump(fakeGh({ readFails: true }), 'o/r', 1)).state
    ).toBe('error');
  });
});

// End to end through the CLI against a real git repo: proves the check the
// CI job runs can go red, not only that it is green today.
describe('cli --base-ref', () => {
  const cli = path.join(__dirname, '..', 'cli.js');
  let dir;

  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const writeVersion = version => {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, MANIFEST_PATH), manifest(version));
  };
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-version-'));
    git('init', '-q', '-b', 'master');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    writeVersion('0.21.10');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('exit 10 when the working tree equals the base', () => {
    const result = run('--base-ref', 'master');
    expect(result.status).toBe(10);
    expect(result.stdout).toMatch(/RESULT: NOT BUMPED/);
  });

  test('exit 10 when lower', () => {
    writeVersion('0.21.9');
    expect(run('--base-ref', 'master').status).toBe(10);
  });

  test('exit 0 when higher', () => {
    writeVersion('0.21.11');
    const result = run('--base-ref', 'master');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/RESULT: OK/);
  });

  test('--head-ref compares two commits', () => {
    git('checkout', '-q', '-b', 'pr');
    writeVersion('0.22.0');
    git('commit', '-q', '-am', 'bump');
    expect(run('--base-ref', 'master', '--head-ref', 'pr').status).toBe(0);
    expect(run('--base-ref', 'pr', '--head-ref', 'master').status).toBe(10);
  });

  test('exit 2 with no arguments', () => {
    expect(run().status).toBe(2);
  });
});
