const {
  HEARTBEAT_STALE_MINUTES,
  parseClaim,
  activeClaim,
  claimBody,
  describeClaim,
} = require('../scripts/claim-lib');

const NOW = Date.parse('2026-09-02T12:00:00Z');
const minutesAgo = m => new Date(NOW - m * 60000).toISOString();

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

const claim = (lines, overrides = {}) => ({
  id: 5507399380,
  html_url:
    'https://github.com/Tessellate-Studio/alate/issues/562#issuecomment-5507399380',
  body: ['### 🔒 Device claim', ...lines].join('\n'),
  ...overrides,
});

describe('a long job keeps the phone — elapsed time is not the criterion', () => {
  it('holds a three-hour-old claim whose last touch is recent', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        '- **Device:** 804KPSL1724518',
        `- **Claimed at:** ${minutesAgo(180)}`,
        `- **Last touch:** ${minutesAgo(4)}`,
        '- **Waiting on:** —',
        '- **Claim:** HELD',
      ])
    );

    // The old rule expired this at 45 minutes and handed the device to a
    // second session mid-fix. Duration of the task is not evidence of
    // abandonment; silence is.
    expect(parsed.stale).toBe(false);
    expect(parsed.idleMinutes).toBe(4);
  });

  it('goes stale on silence, measured from the last touch', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(180)}`,
        `- **Last touch:** ${minutesAgo(HEARTBEAT_STALE_MINUTES + 1)}`,
        '- **Waiting on:** —',
        '- **Claim:** HELD',
      ])
    );
    expect(parsed.stale).toBe(true);
  });

  it('never expires a claim that is parked waiting on a human', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(400)}`,
        `- **Last touch:** ${minutesAgo(240)}`,
        '- **Waiting on:** human — camera permission prompt',
        '- **Claim:** HELD',
      ])
    );

    // A human step can take hours. Stealing the device out from under one is
    // exactly the collision the lock exists to prevent.
    expect(parsed.waitingOnHuman).toBe(true);
    expect(parsed.stale).toBe(false);
  });

  it('treats an em-dash placeholder as not waiting on anyone', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(10)}`,
        `- **Last touch:** ${minutesAgo(HEARTBEAT_STALE_MINUTES + 5)}`,
        '- **Waiting on:** —',
        '- **Claim:** HELD',
      ])
    );
    expect(parsed.waitingOnHuman).toBe(false);
    expect(parsed.stale).toBe(true);
  });
});

describe('claims written before the heartbeat existed', () => {
  it('falls back to Claimed at when there is no Last touch', () => {
    const fresh = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(5)}`,
        '- **Claim:** HELD',
      ])
    );
    expect(fresh.stale).toBe(false);

    const old = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(HEARTBEAT_STALE_MINUTES + 10)}`,
        '- **Claim:** HELD',
      ])
    );
    expect(old.stale).toBe(true);
  });

  it('counts an unreadable timestamp as stale rather than an indefinite hold', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        '- **Claimed at:** whenever',
        '- **Claim:** HELD',
      ])
    );
    expect(parsed.stale).toBe(true);
  });
});

describe('who holds the device', () => {
  it('is nobody once the claim reads RELEASED', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(2)}`,
        `- **Last touch:** ${minutesAgo(1)}`,
        '- **Claim:** RELEASED',
      ])
    );
    expect(activeClaim([parsed])).toBeNull();
  });

  it('takes the latest record per holder, so a re-claim does not read as two', () => {
    const held = parseClaim(
      claim(
        [
          '- **Claimed by:** session-a',
          `- **Claimed at:** ${minutesAgo(30)}`,
          `- **Last touch:** ${minutesAgo(30)}`,
          '- **Claim:** HELD',
        ],
        { id: 1 }
      )
    );
    const released = parseClaim(
      claim(
        [
          '- **Claimed by:** session-a',
          `- **Claimed at:** ${minutesAgo(2)}`,
          `- **Last touch:** ${minutesAgo(1)}`,
          '- **Claim:** RELEASED',
        ],
        { id: 2 }
      )
    );
    expect(activeClaim([held, released])).toBeNull();
  });
});

describe('the comment body a session writes', () => {
  it('carries the heartbeat fields', () => {
    const body = claimBody({
      heldBy: 'session-a',
      device: '804KPSL1724518',
      at: '2026-09-02T09:25:42Z',
      lastTouch: '2026-09-02T11:04:10Z',
    });
    expect(body).toContain('### 🔒 Device claim');
    expect(body).toContain('- **Last touch:** 2026-09-02T11:04:10Z');
    expect(body).toContain('- **Waiting on:** —');
    expect(body).toContain('- **Claim:** HELD');

    // Round-trips through the parser it is written for.
    expect(parseClaim({ id: 1, body }).heldBy).toBe('session-a');
  });

  it('defaults Last touch to the claim time and renders a release', () => {
    const body = claimBody({
      heldBy: 'session-a',
      at: '2026-09-02T09:25:42Z',
      held: false,
    });
    expect(body).toContain('- **Last touch:** 2026-09-02T09:25:42Z');
    expect(body).toContain('- **Claim:** RELEASED');
  });

  it('says what it is waiting on when it is parked', () => {
    const body = claimBody({
      heldBy: 'session-a',
      at: '2026-09-02T09:25:42Z',
      waitingOn: 'human — camera permission prompt',
    });
    expect(body).toContain(
      '- **Waiting on:** human — camera permission prompt'
    );
  });
});

describe('the one-line summary', () => {
  it('reports idle time, not age', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        '- **Device:** 804KPSL1724518',
        `- **Claimed at:** ${minutesAgo(180)}`,
        `- **Last touch:** ${minutesAgo(3)}`,
        '- **Claim:** HELD',
      ])
    );
    const line = describeClaim(parsed);
    expect(line).toContain('804KPSL1724518');
    expect(line).toContain('session-a');
    expect(line).toContain('3 min');
  });

  it('says so when the holder is parked on a human', () => {
    const parsed = parseClaim(
      claim([
        '- **Claimed by:** session-a',
        `- **Claimed at:** ${minutesAgo(60)}`,
        `- **Last touch:** ${minutesAgo(50)}`,
        '- **Waiting on:** human — camera permission prompt',
        '- **Claim:** HELD',
      ])
    );
    expect(describeClaim(parsed)).toMatch(/waiting on/i);
  });

  it('is empty when the device is free', () => {
    expect(describeClaim(null)).toBe('');
  });
});
