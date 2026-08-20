/**
 * Whether the SessionStart hook may spawn a repair worker right now.
 *
 * Split out of forge-freshness.mjs for the same reason as version-pin.js: that file runs its
 * hook on import, so nothing in it can be unit-tested. This is the rate ceiling that stops a
 * doomed repair running once per session forever, so it is worth being able to prove.
 *
 * Pure. The caller observes the world and passes it in.
 */

/**
 * Order matters — the two hard stops come before either reason to go.
 *
 * @param {object}  state
 * @param {number}  state.now            Date.now()
 * @param {number}  [state.lastAttempt]  ms timestamp of the last spawn, absent if never
 * @param {number}  state.intervalMs     normal re-check interval (or the backoff interval)
 * @param {number}  state.minIntervalMs  hard floor; nothing bypasses this
 * @param {boolean} state.liveProblem    a problem is visible on disk right now
 * @param {boolean} state.backedOff      repeated genuine failures have escalated the interval
 * @param {boolean} state.pinBlocked     the version-pin latch is engaged
 * @returns {{spawn: boolean, reason: string}}
 */
function shouldSpawnRepair(state) {
  // 1. A retry that provably cannot work is never worth spawning.
  if (state.pinBlocked) {
    return { spawn: false, reason: 'pin-latched' };
  }

  const sinceAttempt = state.now - (state.lastAttempt ?? 0);

  // 2. The floor. Checked before ANY reason to go, so no condition can argue its way past it.
  //    This is what covers failure modes that have not been characterised — including a
  //    lastAttempt in the future, which a clock change can cause and which must not be read
  //    as "very overdue".
  if (state.lastAttempt && sinceAttempt < state.minIntervalMs) {
    return { spawn: false, reason: 'rate-ceiling' };
  }

  // 3. Never attempted, or the interval has genuinely elapsed.
  if (!state.lastAttempt || sinceAttempt > state.intervalMs) {
    return { spawn: true, reason: 'due' };
  }

  // 4. A visible problem justifies going early — but not while backed off, because a visible
  //    problem is precisely what a failing repair leaves behind. Letting it through here is
  //    what made the backoff unreachable in the only situation it exists for.
  if (state.liveProblem && !state.backedOff) {
    return { spawn: true, reason: 'live-problem' };
  }

  return { spawn: false, reason: 'not-due' };
}

module.exports = { shouldSpawnRepair };
