const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  REQUIRED_PLUGIN_FILES,
  missingPluginFiles,
  strayWorktrees,
} = require('../lib/clone-health.js');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-clone-health-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** `git worktree list --porcelain`, one block per worktree, blank-line separated. */
const porcelain = blocks =>
  `${blocks.map(lines => lines.join('\n')).join('\n\n')}\n`;

describe('strayWorktrees', () => {
  // The 2026-09-11 incident: a session's worktree lived INSIDE the marketplace clone, so
  // `claude plugin update` copied ~15,500 extra files, timed out, and half-extracted forge.
  const clone = () => path.join(tmp, 'marketplaces', 'tessellate-forge');
  const stray = () =>
    path.join(clone(), '.claude', 'worktrees', 'strange-chaplygin-34d6ee');
  const incident = () =>
    porcelain([
      [
        `worktree ${clone()}`,
        'HEAD 5f9ab30f9d38174b3e94fe34736ad13b4f5f66d1',
        'branch refs/heads/master',
      ],
      [
        `worktree ${stray()}`,
        'HEAD 67e684600000000000000000000000000000000',
        'detached',
      ],
    ]);

  it('names every worktree except the clone itself', () => {
    expect(strayWorktrees(incident(), clone())).toEqual([stray()]);
  });

  it('is empty when the clone is its only worktree', () => {
    const only = porcelain([
      [`worktree ${clone()}`, 'HEAD abc', 'branch refs/heads/master'],
    ]);
    expect(strayWorktrees(only, clone())).toEqual([]);
  });

  it('recognises the clone despite a trailing separator', () => {
    expect(strayWorktrees(incident(), `${clone()}${path.sep}`)).toEqual([
      stray(),
    ]);
  });

  (process.platform === 'win32' ? it : it.skip)(
    'recognises the clone when git prints forward slashes, as it does on Windows',
    () => {
      const out = incident().replace(/\\/g, '/');
      expect(strayWorktrees(out, clone())).toEqual([
        stray().replace(/\\/g, '/'),
      ]);
    }
  );

  it('ignores a prunable worktree — its directory is already gone, so nothing copies it', () => {
    const gone = path.join(clone(), '.claude', 'worktrees', 'deleted-long-ago');
    const out = porcelain([
      [`worktree ${clone()}`, 'HEAD abc', 'branch refs/heads/master'],
      [
        `worktree ${gone}`,
        'HEAD def',
        'detached',
        'prunable gitdir file points to non-existent location',
      ],
      [`worktree ${stray()}`, 'HEAD 123', 'detached'],
    ]);
    expect(strayWorktrees(out, clone())).toEqual([stray()]);
  });

  it('ignores a worktree elsewhere on disk — the copy of the clone never reaches it', () => {
    const elsewhere = path.join(tmp, 'somewhere-else', 'checkout');
    const out = porcelain([
      [`worktree ${clone()}`, 'HEAD abc', 'branch refs/heads/master'],
      [`worktree ${elsewhere}`, 'HEAD def', 'branch refs/heads/feature'],
    ]);
    expect(strayWorktrees(out, clone())).toEqual([]);
  });

  it('does not mistake a sibling whose name merely starts with the clone name for a child', () => {
    const sibling = `${clone()}-old`;
    const out = porcelain([
      [`worktree ${clone()}`, 'HEAD abc', 'branch refs/heads/master'],
      [`worktree ${sibling}`, 'HEAD def', 'detached'],
    ]);
    expect(strayWorktrees(out, clone())).toEqual([]);
  });

  it('reads CRLF output', () => {
    expect(strayWorktrees(incident().replace(/\n/g, '\r\n'), clone())).toEqual([
      stray(),
    ]);
  });

  it.each([undefined, null, '', 'fatal: not a git repository'])(
    'is empty for unusable output %p',
    out => {
      expect(strayWorktrees(out, clone())).toEqual([]);
    }
  );
});

describe('missingPluginFiles', () => {
  const write = (root, rel, content = '') => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  it('requires the manifest and the hook registration — without either, forge does not load', () => {
    expect(REQUIRED_PLUGIN_FILES).toEqual(
      expect.arrayContaining(['.claude-plugin/plugin.json', 'hooks/hooks.json'])
    );
  });

  it('is empty for a complete install', () => {
    const dir = path.join(tmp, 'complete');
    REQUIRED_PLUGIN_FILES.forEach(rel => write(dir, rel, '{}'));
    expect(missingPluginFiles(dir)).toEqual([]);
  });

  it('names everything a half-extracted install lacks — the 2026-09-11 shape: only .claude/ and .in_use/', () => {
    const dir = path.join(tmp, '0.14.9');
    write(
      dir,
      '.claude/worktrees/strange-chaplygin-34d6ee/README.md',
      'copy died here'
    );
    write(dir, '.in_use/19144', '{}');
    expect(missingPluginFiles(dir)).toEqual(REQUIRED_PLUGIN_FILES);
  });

  it('treats a directory that does not exist as missing everything', () => {
    expect(missingPluginFiles(path.join(tmp, 'nope'))).toEqual(
      REQUIRED_PLUGIN_FILES
    );
  });
});
