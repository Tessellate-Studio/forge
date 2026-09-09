/**
 * Whether the SessionStart hook may spawn a repair worker right now.
 *
 * Split out of forge-freshness.mjs because that file runs its hook on import, so nothing
 * in it can be unit-tested. This is the rate ceiling that stops a
 * doomed repair running once per session forever, so it is worth being able to prove.
 *
 * Pure. The caller observes the world and passes it in.
 */

/**
 * Order matters — the hard stop comes before either reason to go.
 *
 * @param {object}  state
 * @param {number}  state.now            Date.now()
 * @param {number}  [state.lastAttempt]  ms timestamp of the last spawn, absent if never
 * @param {number}  state.intervalMs     normal re-check interval (or the backoff interval)
 * @param {number}  state.minIntervalMs  hard floor; nothing bypasses this
 * @param {boolean} state.liveProblem    a problem is visible on disk right now
 * @param {boolean} state.backedOff      repeated genuine failures have escalated the interval
 * @returns {{spawn: boolean, reason: string}}
 */
function shouldSpawnRepair(state) {
  const sinceAttempt = state.now - (state.lastAttempt ?? 0);

  // 1. The floor. Checked before ANY reason to go, so no condition can argue its way past it.
  //    This is what covers failure modes that have not been characterised — including a
  //    lastAttempt in the future, which a clock change can cause and which must not be read
  //    as "very overdue".
  if (state.lastAttempt && sinceAttempt < state.minIntervalMs) {
    return { spawn: false, reason: 'rate-ceiling' };
  }

  // 2. Never attempted, or the interval has genuinely elapsed.
  if (!state.lastAttempt || sinceAttempt > state.intervalMs) {
    return { spawn: true, reason: 'due' };
  }

  // 3. A visible problem justifies going early — but not while backed off, because a visible
  //    problem is precisely what a failing repair leaves behind. Letting it through here is
  //    what made the backoff unreachable in the only situation it exists for.
  if (state.liveProblem && !state.backedOff) {
    return { spawn: true, reason: 'live-problem' };
  }

  return { spawn: false, reason: 'not-due' };
}

module.exports = { shouldSpawnRepair };
