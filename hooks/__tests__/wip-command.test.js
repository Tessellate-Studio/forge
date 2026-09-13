const path = require('path');
const { resolveWipCommand, wipNotice } = require('../lib/wip-command');

const ROOT = path.join('plugins', 'cache', 'forge', '9.9.9');
const BIN = path.join('npm', 'global');

// A fake filesystem: only the listed paths exist.
const fsWith =
  (...present) =>
  p =>
    present.includes(p);
const depsOk = () => true;
const depsMissing = () => false;

describe('resolveWipCommand', () => {
  it('uses bare `wip` when it is on PATH', () => {
    const r = resolveWipCommand({
      env: { PATH: BIN },
      platform: 'linux',
      pluginRoot: ROOT,
      exists: fsWith(path.join(BIN, 'wip')),
      depsResolvable: depsOk,
    });
    expect(r).toEqual({ onPath: true, command: 'wip', depsMissing: false });
  });

  it('finds a Windows npm shim through PATHEXT', () => {
    const r = resolveWipCommand({
      env: { Path: BIN, PATHEXT: '.COM;.EXE;.CMD' },
      platform: 'win32',
      pluginRoot: ROOT,
      exists: fsWith(path.join(BIN, 'wip.cmd')),
      depsResolvable: depsOk,
    });
    expect(r.onPath).toBe(true);
    expect(r.command).toBe('wip');
  });

  // The 2026-09-13 failure: an `npm link` made before the `wip` bin existed
  // left a `dtq` shim and no `wip` one, so every skill's `wip claim` failed
  // with "command not found" and was skipped.
  it('falls back to the plugin CLI when `wip` is not on PATH', () => {
    const r = resolveWipCommand({
      env: { PATH: BIN },
      platform: 'linux',
      pluginRoot: ROOT,
      exists: fsWith(path.join(BIN, 'dtq')),
      depsResolvable: depsOk,
    });
    expect(r.onPath).toBe(false);
    expect(r.command).toBe(
      `node "${path.join(ROOT, 'tools', 'work-claim', 'cli.js')}"`
    );
    expect(r.depsMissing).toBe(false);
  });

  it('reports missing CLI dependencies instead of a command that cannot run', () => {
    const r = resolveWipCommand({
      env: { PATH: '' },
      platform: 'linux',
      pluginRoot: ROOT,
      exists: fsWith(),
      depsResolvable: depsMissing,
    });
    expect(r.onPath).toBe(false);
    expect(r.depsMissing).toBe(true);
  });

  it('ignores deps when `wip` itself is on PATH (the shim carries its own)', () => {
    const r = resolveWipCommand({
      env: { PATH: BIN },
      platform: 'linux',
      pluginRoot: ROOT,
      exists: fsWith(path.join(BIN, 'wip')),
      depsResolvable: depsMissing,
    });
    expect(r.depsMissing).toBe(false);
  });
});

describe('wipNotice', () => {
  it('says nothing when `wip` is on PATH', () => {
    expect(
      wipNotice({ onPath: true, command: 'wip', depsMissing: false }, ROOT)
    ).toBeNull();
  });

  it('names the fallback command and forbids a silent skip', () => {
    const cmd = 'node "/x/tools/work-claim/cli.js"';
    const line = wipNotice(
      { onPath: false, command: cmd, depsMissing: false },
      ROOT
    );
    expect(line).toContain(cmd);
    expect(line).toMatch(/never skipped silently/);
  });

  it('tells the session how to install the deps when they are missing', () => {
    const line = wipNotice(
      { onPath: false, command: 'node "x"', depsMissing: true },
      ROOT
    );
    expect(line).toContain('npm ci --omit=dev');
    expect(line).toContain(ROOT);
  });
});
