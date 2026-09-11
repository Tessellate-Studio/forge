/**
 * Make an installed plugin directory match the marketplace clone, file for file.
 *
 * WHY THIS EXISTS. `claude plugin update` keys off the version string in plugin.json,
 * and `claude plugin install` reuses a cache directory that already exists for that
 * version (proven 2026-09-09: uninstall + install of forge left `0.12.9/` untouched,
 * mtime hours older than the install, five upstream commits missing from it). So
 * when forge ships a change without a version bump — which happens, because the
 * bump is a human step — NO CLI command refreshes the cache. The clone on disk is
 * current; the copy sessions actually load is not; and the CLI reports success.
 *
 * The cache directory is nothing more than a copy of the plugin source tree (diffed
 * 2026-09-09: content differences only, plus the CLI's own bookkeeping), so the
 * honest fix is the obvious one: copy the clone over it. This module does that, and
 * hashes both trees the same way so "stale" means "would be changed by a sync".
 *
 * CommonJS on purpose, like the rest of hooks/lib: the repo is CJS, jest requires
 * this directly, and the .mjs hook picks up the exports through Node's CJS lexer.
 */

'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Never read, written, or removed, in either tree. `.git` belongs to the clone.
 * `node_modules` and `.in_use` belong to the cache: the CLI installs the former on
 * extract, and the latter holds one marker per session that has the copy loaded.
 */
const SKIP = new Set(['.git', 'node_modules', '.in_use']);

/**
 * Skipped only at the root of either tree. `<clone>/.claude/` is where a session's git
 * worktree lands when one is started inside the clone — on 2026-09-11 one held ~15,500
 * files, which would be copied into every cache and would make every cache read as stale.
 * forge tracks nothing under `.claude/`, so nothing a session loads lives there.
 */
const TOP_LEVEL_SKIP = new Set(['.claude']);

/**
 * Every regular file under `dir`, keyed by POSIX-style relative path so the same
 * tree hashes identically on Windows and Linux. Symlinks and anything in SKIP are
 * left out.
 *
 * @param {string} dir
 * @returns {Map<string, string>} relative path -> absolute path
 */
function listFiles(dir) {
  const out = new Map();
  if (!fs.existsSync(dir)) {
    return out;
  }
  const walk = (abs, rel) => {
    const entries = fs
      .readdirSync(abs, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const ent of entries) {
      if (SKIP.has(ent.name) || (!rel && TOP_LEVEL_SKIP.has(ent.name))) {
        continue;
      }
      const childAbs = path.join(abs, ent.name);
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(childAbs, childRel);
      } else if (ent.isFile()) {
        out.set(childRel, childAbs);
      }
    }
  };
  walk(dir, '');
  return out;
}

/**
 * A digest of every file path and its contents. Two trees with equal digests would
 * be untouched by syncTree; unequal ones differ in something a session could read.
 *
 * @param {string} dir
 * @returns {string|null} null when the directory does not exist
 */
function treeHash(dir) {
  if (!fs.existsSync(dir)) {
    return null;
  }
  const hash = createHash('sha256');
  for (const [rel, abs] of listFiles(dir)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(abs));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * Write `content` to `dest` so a concurrent reader sees either the old file or the
 * new one, never a torn one — sessions are reading these files while this runs.
 * Falls back to a plain write when the rename is refused (a reader holding the
 * file open without delete-sharing, which node itself never does).
 */
function writeAtomic(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    fs.writeFileSync(dest, content);
  }
}

/** Remove directories left empty by a deletion, up to but not including `root`. */
function pruneEmptyDirs(root, from) {
  let dir = from;
  while (dir !== root && dir.startsWith(root)) {
    try {
      if (fs.readdirSync(dir).length > 0) {
        return;
      }
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/**
 * Bring `dst` into line with `src`: write every file whose contents differ, remove
 * every file `src` no longer has, leave SKIP alone. Each file is attempted
 * independently — one locked file must not abandon the rest.
 *
 * @param {string} src  the marketplace clone
 * @param {string} dst  an installed plugin directory
 * @returns {{written: number, removed: number, failed: Array<{rel: string, error: string}>}}
 */
function syncTree(src, dst) {
  const result = { written: 0, removed: 0, failed: [] };
  const want = listFiles(src);
  const have = listFiles(dst);
  writeDiffering(want, have, dst, result);
  removeExtraneous(want, have, dst, result);
  return result;
}

/** Pass one: every file the clone has, written where its bytes differ. */
function writeDiffering(want, have, dst, result) {
  for (const [rel, srcAbs] of want) {
    try {
      const content = fs.readFileSync(srcAbs);
      const dstAbs = have.get(rel) ?? path.join(dst, ...rel.split('/'));
      if (have.has(rel) && content.equals(fs.readFileSync(dstAbs))) {
        continue;
      }
      writeAtomic(dstAbs, content);
      result.written += 1;
    } catch (err) {
      result.failed.push({ rel, error: String(err?.message ?? err) });
    }
  }
}

/** Pass two: every file the clone no longer has, removed. */
function removeExtraneous(want, have, dst, result) {
  for (const [rel, dstAbs] of have) {
    if (want.has(rel)) {
      continue;
    }
    try {
      fs.rmSync(dstAbs, { force: true });
      result.removed += 1;
      pruneEmptyDirs(path.resolve(dst), path.dirname(path.resolve(dstAbs)));
    } catch (err) {
      result.failed.push({ rel, error: String(err?.message ?? err) });
    }
  }
}

module.exports = { SKIP, TOP_LEVEL_SKIP, listFiles, treeHash, syncTree };
