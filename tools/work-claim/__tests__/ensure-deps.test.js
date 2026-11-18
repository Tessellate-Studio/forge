const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { CLI_DEPS, ensureDeps } = require('../lib/ensure-deps');

const ROOT = path.join('some', 'clone');
const quiet = () => {};

describe('ensureDeps', () => {
  it('lists exactly the deps cli.js loads', () => {
    expect(CLI_DEPS).toEqual(['commander', 'chalk']);
  });

  it('does nothing when the deps already resolve', () => {
    const run = jest.fn();
    const r = ensureDeps({
      root: ROOT,
      resolvable: () => true,
      run,
      log: quiet,
    });
    expect(r).toEqual({ ok: true, installed: false });
    expect(run).not.toHaveBeenCalled();
  });

  // The 2026-11-17 failure: a hand-attached clone with no node_modules.
  it('installs with `npm ci --omit=dev` when deps are missing and a lockfile exists', () => {
    let installed = false;
    const run = jest.fn(() => {
      installed = true;
      return { status: 0 };
    });
    const r = ensureDeps({
      root: ROOT,
      resolvable: () => installed,
      run,
      exists: p => p === path.join(ROOT, 'package-lock.json'),
      log: quiet,
    });
    expect(r).toEqual({ ok: true, installed: true });
    expect(run).toHaveBeenCalledWith(ROOT, [
      'ci',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
    ]);
  });

  it('falls back to `npm install` with no lockfile', () => {
    let installed = false;
    const run = jest.fn(() => {
      installed = true;
      return { status: 0 };
    });
    ensureDeps({
      root: ROOT,
      resolvable: () => installed,
      run,
      exists: () => false,
      log: quiet,
    });
    expect(run.mock.calls[0][1][0]).toBe('install');
  });

  it('reports a failed install with the manual command, never silently', () => {
    const r = ensureDeps({
      root: ROOT,
      resolvable: () => false,
      run: () => ({ status: 1 }),
      exists: () => true,
      log: quiet,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('npm ci --omit=dev');
    expect(r.message).toContain(ROOT);
    expect(r.message).toMatch(/claim was not taken/);
  });

  it('treats an install that exits 0 but leaves deps unresolved as failed', () => {
    const r = ensureDeps({
      root: ROOT,
      resolvable: () => false,
      run: () => ({ status: 0 }),
      exists: () => true,
      log: quiet,
    });
    expect(r.ok).toBe(false);
  });

  it('reports a spawn error (npm not installed)', () => {
    const r = ensureDeps({
      root: ROOT,
      resolvable: () => false,
      run: () => ({ status: null, error: new Error('spawn npm ENOENT') }),
      exists: () => true,
      log: quiet,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('spawn npm ENOENT');
  });
});

// The real entry point: a bare copy of the CLI with no node_modules must try
// to install, and say so plainly when it cannot (here: npm is a stub that fails).
describe('cli.js in a bare copy', () => {
  it('exits 1 with the manual command when the self-install fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wip-bare-'));
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const src = path.join(__dirname, '..');
    fs.cpSync(src, path.join(dir, 'tools', 'work-claim'), {
      recursive: true,
      filter: p => !p.includes('__tests__'),
    });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"bare"}');
    const r = spawnSync(
      process.execPath,
      [path.join(dir, 'tools', 'work-claim', 'cli.js'), '--help'],
      {
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
        encoding: 'utf8',
      }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not install its dependencies');
    expect(r.stderr).not.toContain('MODULE_NOT_FOUND');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
