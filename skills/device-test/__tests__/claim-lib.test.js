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

    // Shared vocabulary with the work claim and the board (humanIdle).
    expect(line).toContain('3m ago');
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

describe('the device one-liner reads as a sentence', () => {
  // Sharing describe() across both variants briefly collapsed the subject to
  // one position, and the device line came out "🔒 claimed by session-a
  // 804KPSL1724518" — as though the holder were named after the handset.
  // Asserted exactly, not with toContain, which let that through.
  it('puts the device before the holder and keeps the word "device"', () => {
    const body = claimBody({
      heldBy: 'session-a',
      device: '804KPSL1724518',
      at: '2026-09-08T10:00:00.000Z',
      lastTouch: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
    expect(describeClaim(parseClaim({ id: 1, body }))).toBe(
      '🔒 device 804KPSL1724518 claimed by session-a (last touch 3m ago)'
    );
  });

  it('says just "device" when no serial was recorded', () => {
    const body = claimBody({
      heldBy: 'session-a',
      at: '2026-09-08T10:00:00.000Z',
      lastTouch: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
    expect(describeClaim(parseClaim({ id: 1, body }))).toBe(
      '🔒 device claimed by session-a (last touch 3m ago)'
    );
  });
});

// ---------------------------------------------------------------------------
// RFD-003 section 3 — one lock per physical device, outside every app queue.
// ---------------------------------------------------------------------------
describe('where a device lock lives', () => {
  const { DEVICES, deviceFor, LOCK_REPO } = require('../scripts/claim-lib');

  it('holds the lock in litmus, not in an app repo and not in forge', () => {
    // The device is not any one app's: alate, mood-layer and badige all drive
    // the same handset. litmus is the shared testing-utilities repo for the
    // mobile apps, and it is PRIVATE, so a claim may name what is being
    // tested. forge is public, which is why the lock cannot live there.
    expect(LOCK_REPO).toBe('Tessellate-Studio/litmus');
    DEVICES.forEach(d => expect(d.repo).toBe(LOCK_REPO));
  });

  it('gives each physical device its own issue', () => {
    // One issue per DEVICE, not per app: a drain can hold the Pixel over adb
    // while a human is mid-sitting on the iPhone, and neither blocks the
    // other.
    const numbers = DEVICES.map(d => d.issue);
    expect(new Set(numbers).size).toBe(DEVICES.length);
    expect(DEVICES.length).toBeGreaterThanOrEqual(2);
  });

  it('finds the Android handset by its adb serial', () => {
    const pixel = deviceFor('804KPSL1724518');
    expect(pixel.issue).toBe(43);
    expect(pixel.adb).toBe(true);
  });

  it('knows the iPhone has no adb path, so its claim waits on a human', () => {
    // Not a workaround — the honest description of the device. Every step is
    // someone's hands, and a claim parked on a human never expires.
    const iphone = DEVICES.find(d => !d.adb);
    expect(iphone).toBeDefined();
    expect(iphone.issue).toBe(44);
    expect(iphone.waitsOnHuman).toBe(true);
  });

  it('falls back to the adb device when asked for an unknown serial', () => {
    // A serial nobody registered is far likelier to be the Pixel re-flashed
    // than a second phone nobody told the queue about; guessing the iPhone
    // would park an agent-runnable drain on a human forever.
    expect(deviceFor('NOT-A-SERIAL').adb).toBe(true);
  });
});

describe('two sessions racing for the same device', () => {
  const { losesRaceTo } = require('../scripts/claim-lib');

  const held = (id, who) => ({
    id,
    html_url: `https://github.com/Tessellate-Studio/litmus/issues/43#issuecomment-${id}`,
    body: [
      '### 🔒 Device claim',
      `- **Claimed by:** ${who}`,
      '- **Device:** 804KPSL1724518',
      `- **Claimed at:** ${minutesAgo(1)}`,
      `- **Last touch:** ${minutesAgo(1)}`,
      '- **Waiting on:** —',
      '- **Claim:** HELD',
    ].join('\n'),
  });

  it('stands the later poster down, deterministically', () => {
    // Comment ids are server-assigned and monotonic, so both racers reach the
    // SAME answer with no clock involved. The 16-second collision on
    // 2026-09-07 resolves in one round trip.
    const claims = [held(100, 'session-a'), held(200, 'session-b')].map(
      parseClaim
    );
    expect(losesRaceTo(claims, 200).heldBy).toBe('session-a');
    expect(losesRaceTo(claims, 100)).toBeNull();
  });

  it('both racers agree on the winner', () => {
    const claims = [held(100, 'session-a'), held(200, 'session-b')].map(
      parseClaim
    );
    const bWinner = losesRaceTo(claims, 200);
    const aWinner = losesRaceTo(claims, 100);
    expect(bWinner).not.toBeNull();
    expect(aWinner).toBeNull();
  });

  it('ignores a released claim, however early it was posted', () => {
    const releasedEarly = {
      ...held(50, 'session-old'),
      body: held(50, 'session-old').body.replace('HELD', 'RELEASED'),
    };
    const claims = [releasedEarly, held(200, 'session-b')].map(parseClaim);
    expect(losesRaceTo(claims, 200)).toBeNull();
  });

  it('ignores a stale claim, so a crashed session cannot wedge the device', () => {
    const silent = {
      ...held(50, 'session-dead'),
      body: held(50, 'session-dead').body.replace(
        `- **Last touch:** ${minutesAgo(1)}`,
        `- **Last touch:** ${minutesAgo(HEARTBEAT_STALE_MINUTES * 3)}`
      ),
    };
    const claims = [silent, held(200, 'session-b')].map(parseClaim);
    expect(losesRaceTo(claims, 200)).toBeNull();
  });

  it('is a no-op when nobody else is holding', () => {
    expect(losesRaceTo([parseClaim(held(200, 'solo'))], 200)).toBeNull();
    expect(losesRaceTo([], 200)).toBeNull();
  });
});
