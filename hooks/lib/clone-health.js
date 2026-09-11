/**
 * Two things about the marketplace clone, and the installs made from it, that the CLI will
 * not tell you — it reports success either way.
 *
 * WHY THIS EXISTS (2026-09-11). A session created its git worktree INSIDE the marketplace
 * clone, at <clone>/.claude/worktrees/strange-chaplygin-34d6ee: ~15,500 files, mostly
 * node_modules. `claude plugin install` and `update` copy the whole clone, so every extract
 * after that spent its time copying the worktree, died after writing only `.claude/`, and
 * still printed "✔ Successfully updated". Cache dirs 0.13.3 and 0.14.9 held nothing but
 * `.claude/` and `.in_use/`, and the refresher's `plugin update` step hit
 * `spawnSync ETIMEDOUT` twice on 2026-09-09.
 *
 * CommonJS, like the rest of hooks/lib: jest requires it directly and the .mjs hook picks up
 * the exports through Node's CJS lexer. No I/O beyond existsSync — the caller runs git.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Without these the plugin does not load at all: no manifest, no hook registration. */
const REQUIRED_PLUGIN_FILES = [
  '.claude-plugin/plugin.json',
  'hooks/hooks.json',
];

const normalise = dir =>
  path
    .resolve(dir)
    .replace(/[\\/]+$/, '')
    .toLowerCase();

/** Same directory, whatever the slash direction, case, or trailing separator. */
function samePath(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalise(left) === normalise(right);
}

/** Strictly below `parent` — a sibling named `<parent>-old` does not count. */
function isInside(child, parent) {
  const childPath = normalise(child);
  const parentPath = normalise(parent);
  return (
    childPath.startsWith(`${parentPath}${path.sep}`) ||
    childPath.startsWith(`${parentPath}/`)
  );
}

/**
 * Worktrees that live INSIDE the clone, other than the clone itself, from
 * `git worktree list --porcelain`. Only those cost anything: the CLI's copy never reaches a
 * worktree elsewhere on disk, and a prunable one's directory is already gone.
 *
 * @param {string} porcelain
 * @param {string} clonePath
 * @returns {string[]} the worktree paths exactly as git printed them
 */
function strayWorktrees(porcelain, clonePath) {
  if (typeof porcelain !== 'string' || !clonePath) {
    return [];
  }
  return porcelain
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(block => block.split('\n').filter(Boolean))
    .filter(lines => lines[0]?.startsWith('worktree '))
    .filter(lines => !lines.some(line => line.startsWith('prunable')))
    .map(lines => lines[0].slice('worktree '.length))
    .filter(dir => !samePath(dir, clonePath) && isInside(dir, clonePath));
}

/**
 * Which of REQUIRED_PLUGIN_FILES an install directory lacks. A half-extracted directory
 * exists, so `existsSync(installPath)` calls it healthy; this does not.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function missingPluginFiles(dir) {
  return REQUIRED_PLUGIN_FILES.filter(
    rel => !dir || !fs.existsSync(path.join(dir, ...rel.split('/')))
  );
}

module.exports = {
  REQUIRED_PLUGIN_FILES,
  missingPluginFiles,
  samePath,
  strayWorktrees,
};
