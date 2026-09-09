const fs = require('fs');
const os = require('os');
const path = require('path');

const { treeHash, syncTree, listFiles } = require('../lib/cache-sync.js');

/** Lay out a tree from {relativePath: content}; a trailing slash makes a directory. */
function scaffold(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'));
    if (rel.endsWith('/')) {
      fs.mkdirSync(abs, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

let tmp;
let clone;
let cache;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-cache-sync-'));
  clone = path.join(tmp, 'clone');
  cache = path.join(tmp, 'cache');
  scaffold(clone, {
    'standards/workflows.md': 'v2',
    'skills/plan/SKILL.md': 'plan v2',
    'skills/new/SKILL.md': 'brand new',
    '.git/HEAD': 'ref: refs/heads/master',
  });
  scaffold(cache, {
    'standards/workflows.md': 'v1',
    'skills/plan/SKILL.md': 'plan v2',
    'skills/removed/SKILL.md': 'gone upstream',
    'node_modules/dep/index.js': 'installed by the CLI',
    '.in_use/12345': '',
  });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('treeHash', () => {
  it('is null for a directory that does not exist', () => {
    expect(treeHash(path.join(tmp, 'nope'))).toBeNull();
  });

  it('ignores .git, node_modules and .in_use — they differ between clone and cache by design', () => {
    const bare = path.join(tmp, 'bare');
    scaffold(bare, { 'a.md': 'x' });
    const noisy = path.join(tmp, 'noisy');
    scaffold(noisy, {
      'a.md': 'x',
      '.git/config': 'c',
      'node_modules/x/y.js': 'y',
      '.in_use/1': '',
    });
    expect(treeHash(bare)).toBe(treeHash(noisy));
  });

  it('changes when a file changes, and when one is added', () => {
    const before = treeHash(clone);
    fs.writeFileSync(path.join(clone, 'standards', 'workflows.md'), 'v3');
    const changed = treeHash(clone);
    expect(changed).not.toBe(before);
    fs.writeFileSync(path.join(clone, 'extra.md'), '');
    expect(treeHash(clone)).not.toBe(changed);
  });
});

describe('syncTree', () => {
  it('reports the cache as stale before, and identical to the clone after', () => {
    expect(treeHash(cache)).not.toBe(treeHash(clone));
    syncTree(clone, cache);
    expect(treeHash(cache)).toBe(treeHash(clone));
  });

  it('writes changed and new files, removes files the clone no longer has, leaves equal ones alone', () => {
    const result = syncTree(clone, cache);
    expect(result).toEqual({ written: 2, removed: 1, failed: [] });
    expect(
      fs.readFileSync(path.join(cache, 'standards', 'workflows.md'), 'utf8')
    ).toBe('v2');
    expect(
      fs.readFileSync(path.join(cache, 'skills', 'new', 'SKILL.md'), 'utf8')
    ).toBe('brand new');
    expect(fs.existsSync(path.join(cache, 'skills', 'removed'))).toBe(false); // emptied dir pruned too
  });

  it("never touches the cache's own node_modules or .in_use, and never copies .git", () => {
    syncTree(clone, cache);
    expect(
      fs.existsSync(path.join(cache, 'node_modules', 'dep', 'index.js'))
    ).toBe(true);
    expect(fs.existsSync(path.join(cache, '.in_use', '12345'))).toBe(true);
    expect(fs.existsSync(path.join(cache, '.git'))).toBe(false);
  });

  it('is a no-op the second time', () => {
    syncTree(clone, cache);
    expect(syncTree(clone, cache)).toEqual({
      written: 0,
      removed: 0,
      failed: [],
    });
  });

  it('leaves no temp files behind', () => {
    syncTree(clone, cache);
    const leftovers = [...listFiles(cache).keys()].filter(rel =>
      rel.endsWith('.tmp')
    );
    expect(leftovers).toEqual([]);
  });

  it('creates the destination when it is missing entirely', () => {
    const fresh = path.join(tmp, 'fresh');
    const result = syncTree(clone, fresh);
    expect(result.failed).toEqual([]);
    expect(treeHash(fresh)).toBe(treeHash(clone));
  });
});
