const { shouldSpawnRepair } = require('../lib/spawn-decision.js');

const MIN = 10 * 60 * 1000; // rate ceiling
const HOUR = 60 * 60 * 1000; // normal interval
const DAY = 24 * HOUR; // backoff interval
const NOW = 1_800_000_000_000;

/** Healthy defaults: attempted an hour and a half ago, nothing wrong, not backed off. */
function at(overrides) {
  return shouldSpawnRepair({
    now: NOW,
    lastAttempt: NOW - 90 * 60 * 1000,
    intervalMs: HOUR,
    minIntervalMs: MIN,
    liveProblem: false,
    backedOff: false,
    pinBlocked: false,
    ...overrides,
  });
}

describe('the rate ceiling cannot be bypassed', () => {
  it.each([
    ['a live problem', { liveProblem: true }],
    ['a live problem while backed off', { liveProblem: true, backedOff: true }],
    [
      'a live problem and a long interval',
      { liveProblem: true, intervalMs: DAY },
    ],
  ])('blocks %s inside the floor', (_label, extra) => {
    const decision = at({ lastAttempt: NOW - 60_000, ...extra });
    expect(decision).toEqual({ spawn: false, reason: 'rate-ceiling' });
  });

  it('blocks right up to the floor and releases just past it', () => {
    expect(at({ lastAttempt: NOW - (MIN - 1), liveProblem: true }).spawn).toBe(
      false
    );

    // Just past the floor a live problem may go early; the interval has not elapsed yet.
    expect(at({ lastAttempt: NOW - (MIN + 1), liveProblem: true })).toEqual({
      spawn: true,
      reason: 'live-problem',
    });
  });

  it('caps a permanent live problem to the floor, not once per session', () => {
    // 40 sessions in 5 minutes, the shape of the observed bug. Only spawns that clear the
    // floor count, so simulate honestly: lastAttempt only moves when a spawn happens.
    let lastAttempt = NOW - MIN - 1;
    let spawns = 0;
    for (let i = 0; i < 40; i++) {
      const now = NOW + i * 7_500; // a session every 7.5s
      const decision = shouldSpawnRepair({
        now,
        lastAttempt,
        intervalMs: HOUR,
        minIntervalMs: MIN,
        liveProblem: true,
        backedOff: false,
        pinBlocked: false,
      });
      if (decision.spawn) {
        spawns++;
        lastAttempt = now;
      }
    }
    expect(spawns).toBe(1); // 40 sessions across 5 minutes -> a single worker
  });

  it('treats a future lastAttempt as blocked, never as overdue', () => {
    // A clock change must not read as "very overdue" and unleash a spawn per session.
    const decision = at({ lastAttempt: NOW + DAY, liveProblem: true });
    expect(decision).toEqual({ spawn: false, reason: 'rate-ceiling' });
  });
});

describe('the hard stops come first', () => {
  it('never spawns while the version pin is latched, however overdue', () => {
    expect(
      at({ pinBlocked: true, lastAttempt: NOW - DAY, liveProblem: true })
    ).toEqual({
      spawn: false,
      reason: 'pin-latched',
    });
  });

  it('respects the backoff interval instead of the normal one', () => {
    // 90 minutes in: past the hourly interval, nowhere near the daily one.
    expect(at({ backedOff: true, intervalMs: DAY, liveProblem: true })).toEqual(
      {
        spawn: false,
        reason: 'not-due',
      }
    );
    expect(
      at({ backedOff: true, intervalMs: DAY, lastAttempt: NOW - DAY - 1 })
    ).toEqual({
      spawn: true,
      reason: 'due',
    });
  });
});

describe('it still does its job', () => {
  it('spawns on a fresh install with no recorded attempt', () => {
    expect(at({ lastAttempt: undefined })).toEqual({
      spawn: true,
      reason: 'due',
    });
    expect(at({ lastAttempt: 0 })).toEqual({ spawn: true, reason: 'due' });
  });

  it('spawns once the normal interval elapses, with nothing visibly wrong', () => {
    expect(at({ lastAttempt: NOW - HOUR - 1 })).toEqual({
      spawn: true,
      reason: 'due',
    });
  });

  it('holds off inside the interval when nothing is wrong', () => {
    expect(at({ lastAttempt: NOW - 30 * 60 * 1000 })).toEqual({
      spawn: false,
      reason: 'not-due',
    });
  });
});
