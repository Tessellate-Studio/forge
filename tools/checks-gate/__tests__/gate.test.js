'use strict';

const { classifyRead, waitForChecks, RESULT } = require('../lib/gate');

// Real `gh pr checks <n> -R Tessellate-Studio/alate --json name,bucket` output,
// read 2026-09-10. #791 merged green; #679 merged past a failed `backend`.
const ALATE_791 = [
  { bucket: 'skipping', name: 'Alert — red default branch' },
  { bucket: 'pass', name: 'mobile' },
  { bucket: 'pass', name: 'lint-backend' },
  { bucket: 'pass', name: 'backend' },
  { bucket: 'pass', name: 'shared-purity' },
  { bucket: 'pass', name: 'lint-mobile' },
  { bucket: 'pass', name: 'guard' },
  { bucket: 'pass', name: 'Scan for user data / secrets' },
  { bucket: 'pass', name: 'inspect / Inspect with Code Standards' },
  { bucket: 'skipping', name: 'auto-merge' },
];
const ALATE_679 = [
  { bucket: 'pass', name: 'mobile' },
  { bucket: 'fail', name: 'backend' },
  { bucket: 'pass', name: 'guard' },
  { bucket: 'skipping', name: 'auto-merge' },
];

const ok = rows => ({ stdout: JSON.stringify(rows), stderr: '' });
const failed = stderr => ({ stdout: '', stderr });

const GREEN = ok(ALATE_791);
const RED = ok(ALATE_679);
const PENDING = ok([
  { bucket: 'pass', name: 'guard' },
  { bucket: 'pending', name: 'mobile' },
  { bucket: 'skipping', name: 'auto-merge' },
]);
const TLS = failed(
  'Post "https://api.github.com/graphql": net/http: TLS handshake timeout'
);
const NO_CHECKS = failed("no checks reported on the 'fix/x' branch");

describe('classifyRead — one `gh pr checks --json name,bucket` read', () => {
  it('is green when nothing is pending or failed and something passed', () => {
    expect(classifyRead(GREEN).state).toBe('green');
  });

  it('is red on a fail bucket, and names the check', () => {
    const read = classifyRead(RED);
    expect(read.state).toBe('red');
    expect(read.detail).toMatch(/backend/);
  });

  it('is red on a cancel bucket — a cancelled check did not pass', () => {
    expect(classifyRead(ok([{ bucket: 'cancel', name: 'mobile' }])).state).toBe(
      'red'
    );
  });

  it('is pending while any check runs', () => {
    expect(classifyRead(PENDING).state).toBe('pending');
  });

  it('treats a bucket gh adds later as pending, never green', () => {
    const read = classifyRead(
      ok([
        { bucket: 'pass', name: 'guard' },
        { bucket: 'waiting', name: 'mobile' },
      ])
    );
    expect(read.state).toBe('pending');
  });

  describe('absent — nothing has run yet, which is neither red nor green', () => {
    it.each([
      ['the "no checks reported" error (alate#752)', NO_CHECKS],
      ['an empty list', ok([])],
      ['empty stdout and empty stderr', { stdout: '', stderr: '' }],
      [
        'only skipping checks — alate’s auto-merge job always skips',
        ok([{ bucket: 'skipping', name: 'auto-merge' }]),
      ],
    ])('%s', (_label, read) => {
      expect(classifyRead(read).state).toBe('absent');
    });
  });

  describe('transient — a failed read, never a result', () => {
    it('a network error (alate#791)', () => {
      const read = classifyRead(TLS);
      expect(read.state).toBe('transient');
      expect(read.detail).toMatch(/TLS handshake timeout/);
    });

    it.each([
      ['stdout that is not JSON', { stdout: 'HTTP 502', stderr: '' }],
      ['JSON that is not a list', { stdout: '{"message":"x"}', stderr: '' }],
    ])('%s', (_label, read) => {
      expect(classifyRead(read).state).toBe('transient');
    });
  });
});

describe('waitForChecks — polls until a real answer', () => {
  const run = (reads, options = {}) => {
    let clock = 0;
    let index = 0;
    const calls = { reads: 0 };
    const promise = waitForChecks({
      read: async () => {
        calls.reads += 1;
        return reads[Math.min(index++, reads.length - 1)];
      },
      sleep: async ms => {
        clock += ms;
      },
      now: () => clock,
      pollMs: 20_000,
      registerTimeoutMs: 600_000,
      timeoutMs: 7_200_000,
      ...options,
    });
    return promise.then(outcome => ({ ...outcome, calls }));
  };

  it('waits for checks to register instead of reporting red (alate#752)', async () => {
    const outcome = await run([NO_CHECKS, NO_CHECKS, PENDING, GREEN, GREEN]);
    expect(outcome.result).toBe(RESULT.GREEN);
  });

  it('retries a network error mid-run instead of reporting red (alate#791)', async () => {
    const outcome = await run([PENDING, TLS, PENDING, GREEN, GREEN]);
    expect(outcome.result).toBe(RESULT.GREEN);
  });

  it('reports red as soon as a check fails, with the failing check', async () => {
    const outcome = await run([PENDING, RED, GREEN]);
    expect(outcome.result).toBe(RESULT.RED);
    expect(outcome.calls.reads).toBe(2);
    expect(outcome.detail).toMatch(/backend/);
  });

  it('does not trust a single green read', async () => {
    const outcome = await run([GREEN, GREEN]);
    expect(outcome.result).toBe(RESULT.GREEN);
    expect(outcome.calls.reads).toBe(2);
  });

  it('restarts the confirmation when a check registers late', async () => {
    const early = ok(ALATE_791.slice(0, 3));
    const outcome = await run([early, GREEN, GREEN]);
    expect(outcome.result).toBe(RESULT.GREEN);
    expect(outcome.calls.reads).toBe(3);
  });

  it('restarts the confirmation when a green read is followed by a pending one', async () => {
    const outcome = await run([GREEN, PENDING, GREEN, GREEN]);
    expect(outcome.result).toBe(RESULT.GREEN);
    expect(outcome.calls.reads).toBe(4);
  });

  it('gives up with NO_CHECKS when nothing ever runs', async () => {
    const outcome = await run([NO_CHECKS]);
    expect(outcome.result).toBe(RESULT.NO_CHECKS);
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(600_000);
    expect(outcome.elapsedMs).toBeLessThan(7_200_000);
  });

  it('counts only-skipping as nothing having run', async () => {
    const outcome = await run([
      ok([{ bucket: 'skipping', name: 'auto-merge' }]),
    ]);
    expect(outcome.result).toBe(RESULT.NO_CHECKS);
  });

  it('reports a gh that never answers as TIMED_OUT, not as NO_CHECKS', async () => {
    const outcome = await run([TLS]);
    expect(outcome.result).toBe(RESULT.TIMED_OUT);
    expect(outcome.detail).toMatch(/TLS handshake timeout/);
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(7_200_000);
  });

  it('reports checks that never finish as TIMED_OUT, naming them', async () => {
    const outcome = await run([PENDING]);
    expect(outcome.result).toBe(RESULT.TIMED_OUT);
    expect(outcome.detail).toMatch(/mobile/);
  });

  it('reports each state change once through onProgress', async () => {
    const seen = [];
    await run([NO_CHECKS, NO_CHECKS, PENDING, TLS, PENDING, GREEN, GREEN], {
      onProgress: read => seen.push(read.state),
    });
    expect(seen).toEqual([
      'absent',
      'pending',
      'transient',
      'pending',
      'green',
    ]);
  });
});
