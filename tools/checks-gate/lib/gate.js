// Wait until a PR's checks give a real answer: green, red, nothing ran, or out
// of time.
//
// WHY THIS EXISTS. The documented gate for a requested merge was
// `gh pr checks <n> --watch >/dev/null && gh pr merge <n> --squash`, which
// trusts `--watch`'s exit code. That code is non-zero for more than a failed
// check. On alate, 2026-09-09/10, it read as red twice with zero failures:
//
//   - alate#752: run seconds after `gh pr create`. `--watch` fails at once on
//     "no checks reported" — nothing had registered yet.
//   - alate#791: seven checks green, `mobile` still pending. `--watch` exited
//     mid-run on `net/http: TLS handshake timeout`.
//
// Both failed closed, so nothing unsafe merged, but each stalled a ship chain
// and read as a real CI failure. alate fixed its own merge script for this
// (alate#793); this is the same rule for every repo.
//
// So a read is classified from each check's BUCKET, and gh's exit code is
// ignored: it is 8 while checks are pending and non-zero on a network blip, so
// it cannot tell either apart from a failure.
//
// Pure: the caller supplies read(), sleep() and now(), so every rule below is
// tested without a real CI run or a real clock.

'use strict';

const RESULT = {
  GREEN: 'GREEN',
  RED: 'RED',
  NO_CHECKS: 'NO_CHECKS',
  TIMED_OUT: 'TIMED_OUT',
};

const namesWhere = (checks, predicate) =>
  checks.filter(predicate).map(check => check.name || 'unnamed');

const transient = detail => ({ state: 'transient', checks: [], detail });

/**
 * gh's raw output to a list of checks — or, when there is no list to read, the
 * state that says why. Zero checks arrive as the "no checks reported" error or
 * as nothing at all; anything else on stderr is a failed read.
 */
function parseChecks({ stdout = '', stderr = '' }) {
  const out = String(stdout).trim();
  const err = String(stderr).trim();
  if (!out) {
    return !err || /no checks reported/i.test(err)
      ? { state: 'absent', checks: [], detail: 'no checks reported' }
      : transient(err.split('\n')[0]);
  }
  try {
    const checks = JSON.parse(out);
    return Array.isArray(checks)
      ? { checks }
      : transient('gh printed JSON that is not a list of checks');
  } catch {
    return transient('gh printed output that is not JSON');
  }
}

/** A list of `{name, bucket}` rows to red / pending / absent / green. */
function classifyChecks(checks) {
  const failed = namesWhere(
    checks,
    check => check.bucket === 'fail' || check.bucket === 'cancel'
  );
  if (failed.length) {
    return {
      state: 'red',
      checks,
      detail: `did not pass: ${failed.join(', ')}`,
    };
  }
  const running = namesWhere(
    checks,
    check => check.bucket !== 'pass' && check.bucket !== 'skipping'
  );
  if (running.length) {
    const detail = `still running: ${running.join(', ')}`;
    return { state: 'pending', checks, detail };
  }
  const passed = checks.filter(check => check.bucket === 'pass').length;
  const skipped = checks.length - passed;
  if (passed === 0) {
    const detail = skipped
      ? `only skipped checks (${skipped})`
      : 'no checks reported';
    return { state: 'absent', checks, detail };
  }
  const detail = `${passed}/${checks.length} passed${
    skipped ? `, ${skipped} skipped` : ''
  }`;
  return { state: 'green', checks, detail };
}

/**
 * One `gh pr checks <n> --json name,bucket` read.
 *
 * - transient — gh errored or printed something unparseable. Read again; never a result.
 * - absent    — nothing has run: no checks, or only `skipping` ones. alate's
 *               `auto-merge` job skips on every PR, so a skip proves nothing.
 * - red       — any `fail` or `cancel`.
 * - pending   — anything else not yet `pass`/`skipping`, including a bucket
 *               name gh adds later. An unknown state is not green.
 * - green     — nothing pending or failed, and at least one `pass`.
 *
 * @param {{stdout?: string, stderr?: string}} read
 * @returns {{state: string, checks: object[], detail: string}}
 */
function classifyRead(read = {}) {
  const parsed = parseChecks(read);
  return parsed.state ? parsed : classifyChecks(parsed.checks);
}

/**
 * The result this read ends the wait with, or null to read again. Updates
 * `tracker.greenCount`, the check count at the previous read if it was green.
 */
function verdictFor(current, tracker, elapsedMs, limits) {
  if (current.state === 'red') {
    return RESULT.RED;
  }
  const count = current.state === 'green' ? current.checks.length : null;
  if (count !== null && count === tracker.greenCount) {
    return RESULT.GREEN;
  }
  tracker.greenCount = count;
  if (elapsedMs >= limits.timeoutMs) {
    return RESULT.TIMED_OUT;
  }
  const neverRan = !tracker.seenRunning && current.state === 'absent';
  return neverRan && elapsedMs >= limits.registerTimeoutMs
    ? RESULT.NO_CHECKS
    : null;
}

/**
 * Poll until red, confirmed green, or a timeout.
 *
 * Green must hold for two reads running over the same number of checks, so a
 * workflow whose checks register a little after another's cannot let the early
 * set pass for the whole gate. NO_CHECKS applies only while nothing has ever
 * run; a gh that keeps failing is TIMED_OUT, never NO_CHECKS — "could not
 * read" and "nothing ran" are different findings.
 *
 * @returns {Promise<{result: string, detail: string, checks: object[], elapsedMs: number}>}
 */
async function waitForChecks({
  read,
  sleep,
  now,
  pollMs,
  onProgress,
  ...limits
}) {
  const start = now();
  const tracker = { seenRunning: false, greenCount: null };
  let lastState = null;

  for (;;) {
    const current = classifyRead(await read());
    if (current.state !== lastState) {
      (onProgress || (() => {}))(current);
      lastState = current.state;
    }
    if (current.state !== 'absent' && current.state !== 'transient') {
      tracker.seenRunning = true;
    }

    const elapsedMs = now() - start;
    const result = verdictFor(current, tracker, elapsedMs, limits);
    if (result) {
      return {
        result,
        detail: current.detail,
        checks: current.checks,
        elapsedMs,
      };
    }
    await sleep(pollMs);
  }
}

module.exports = { classifyRead, waitForChecks, RESULT };
