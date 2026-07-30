/**
 * The version-pin latch, split out of forge-freshness.mjs so it can be unit-tested.
 *
 * forge-freshness.mjs runs its hook on import (it is an executable, not a module), so a
 * predicate living there cannot be exercised from a test. Everything here is pure — the
 * caller reads the filesystem and git, and passes the results in.
 *
 * CommonJS on purpose. The repo is CJS (no `"type": "module"`), so jest requires this
 * directly, while the .mjs hook picks up the named export through Node's CJS lexer — one
 * file, both loaders, no ESM-in-jest flags.
 *
 * Lives beside the hook, which is fine: the "never beside this file" rule in the hook header
 * is about MUTABLE STATE (throttle, lock, log) that a plugin update would wipe. Code ships
 * with the cache and is meant to be replaced wholesale.
 */

/**
 * Version-pinned staleness is the one drift a repair provably cannot clear: the clone is
 * current, so `claude plugin update` compares equal version strings and no-ops, forever.
 * Spawning a worker for it is pure cost — and because the condition never clears on its own,
 * that cost is paid on EVERY session.
 *
 * So the verdict latches. It stops blocking the moment an input that could change the
 * outcome moves:
 *   - the cache is no longer stale  -> someone ran the forced reinstall; nothing to repair.
 *   - the clone HEAD moved          -> new upstream commits, possibly carrying a version bump.
 *   - the installed version changed -> an update landed; the pin is gone.
 *   - the clone fell behind again   -> a genuine, retryable drift is now in play.
 *
 * Anything it cannot confirm does NOT latch: state written before the fingerprint shipped,
 * an unreadable HEAD, a missing manifest entry. One wasted retry is cheaper than a latch
 * stuck on unverifiable grounds.
 *
 * @param {object|null|undefined} last  state.lastRepair
 * @param {object|null} entry           the installed-plugin manifest entry
 * @param {{cacheStale: boolean, behind: number|null, head: string|null}} now observed state
 * @returns {boolean} true when the worker must NOT be spawned
 */
exports.isVersionPinBlocked = function isVersionPinBlocked(last, entry, now) {
  if (!last || !last.versionPinned || last.ok) {
    return false;
  }

  // The pinned condition itself must still hold. A truthy `behind` means genuinely new
  // upstream work, which IS retryable and so is not this case.
  if (!now.cacheStale || now.behind) {
    return false;
  }

  if (!last.pinnedAtVersion || !last.pinnedAtCloneHead) {
    return false;
  }
  if (!now.head) {
    return false;
  }

  return (
    last.pinnedAtVersion === (entry && entry.version) &&
    last.pinnedAtCloneHead === now.head
  );
};
