// The device lock (ADR-004, superseding RFD-003 §3): no litmus issue. A drain
// claims each device-test issue it takes with the ordinary 🚧 work claim plus
// a `Device` field, and a phone is busy while any open test holds a live claim
// naming it.

const {
  HEARTBEAT_STALE_MINUTES,
  DEVICES,
  deviceFor,
  deviceHolder,
  losesRaceTo,
  resolveDevices,
} = require('../scripts/claim-lib');
const {
  claimBody,
  parseClaim,
} = require('../../../tools/work-claim/lib/claim');

const NOW = Date.parse('2026-09-25T12:00:00Z');
const minutesAgo = m => new Date(NOW - m * 60000).toISOString();

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

let nextId = 7000000000;

/** A parsed 🚧 claim, as the drain would post it with `wip claim --device`. */
const claim = (over = {}) => {
  const id = over.id || nextId++;
  const parsed = parseClaim({
    id,
    html_url: `https://github.com/Tessellate-Studio/alate/issues/990#issuecomment-${id}`,
    body: claimBody({
      heldBy: over.heldBy || 'drain-a (abcd1234)',
      sessionId: 'abcd1234-0000',
      host: 'spectre',
      worktree: null,
      branch: 'master',
      device: 'device' in over ? over.device : 'pixel',
      at: minutesAgo(over.age || 5),
      lastTouch: minutesAgo(over.idle === undefined ? 1 : over.idle),
      waitingOn: over.waitingOn,
      held: over.held,
    }),
  });
  return { ...parsed, testId: over.testId || 'alate#990' };
};

const pixel = deviceFor('pixel');
const iphone = deviceFor('iphone');

describe('there is no litmus lock any more', () => {
  it('registers devices without a lock repo or lock issue', () => {
    DEVICES.forEach(d => {
      expect(d.repo).toBeUndefined();
      expect(d.issue).toBeUndefined();
    });
    expect(require('../scripts/claim-lib').LOCK_REPO).toBeUndefined();
  });
});

describe('naming a device', () => {
  it('finds a device by key or by adb serial, case-insensitively', () => {
    expect(deviceFor('Pixel')).toBe(pixel);
    expect(deviceFor('804KPSL1724518')).toBe(pixel);
    expect(deviceFor('iPhone')).toBe(iphone);
  });

  it('falls back to the adb handset for an unknown name', () => {
    // Guessing the iPhone would park an agent-runnable drain on a human.
    expect(deviceFor('some-new-serial')).toBe(pixel);
  });

  it('knows the iPhone waits on a human', () => {
    expect(iphone.adb).toBe(false);
    expect(iphone.waitsOnHuman).toBe(true);
  });
});

describe('the Device field rides on the ordinary work claim', () => {
  it('reads back the device it was posted with', () => {
    expect(claim().device).toBe('pixel');
  });

  it('leaves a PR claim with no device exactly as it was', () => {
    const body = claimBody({ heldBy: 'x', branch: 'feat/y' });
    expect(body).not.toContain('**Device:**');
    expect(parseClaim({ id: 1, body }).device).toBeNull();
  });
});

describe('is the phone busy?', () => {
  it('is free when no test claims it', () => {
    expect(deviceHolder([], pixel)).toBeNull();
  });

  it('is busy while any open test holds a live claim naming it', () => {
    const c = claim();
    expect(deviceHolder([c], pixel)).toBe(c);
  });

  it('ignores claims naming the other device', () => {
    expect(deviceHolder([claim({ device: 'iphone' })], pixel)).toBeNull();
  });

  it('ignores claims with no device — those are work claims, not locks', () => {
    // A session fixing a failed test claims the issue without driving the
    // phone; that must not lock the handset.
    expect(deviceHolder([claim({ device: null })], pixel)).toBeNull();
  });

  it('ignores a released claim', () => {
    expect(deviceHolder([claim({ held: false })], pixel)).toBeNull();
  });

  it(`frees the phone after ${HEARTBEAT_STALE_MINUTES} min of silence, however young the work claim`, () => {
    // The WORK claim survives seven days; the PHONE cannot wait that long
    // for a crashed drain. Silence on the device is judged on its own window.
    const quiet = claim({ idle: HEARTBEAT_STALE_MINUTES + 1 });
    expect(quiet.stale).toBe(false);
    expect(deviceHolder([quiet], pixel)).toBeNull();
  });

  it('holds a long job whose last touch is recent', () => {
    expect(deviceHolder([claim({ age: 180, idle: 3 })], pixel)).not.toBeNull();
  });

  it('never frees a claim parked on a human', () => {
    const parked = claim({
      idle: 600,
      waitingOn: 'human — judge the swipe feel',
    });
    expect(deviceHolder([parked], pixel)).toBe(parked);
  });

  it('names the earliest claim when two drains hold tests on the same phone', () => {
    const first = claim({ id: 100, heldBy: 'drain-a', testId: 'alate#990' });
    const second = claim({ id: 200, heldBy: 'drain-b', testId: 'badige#12' });
    expect(deviceHolder([second, first], pixel)).toBe(first);
  });
});

describe('two drains racing across different tests', () => {
  // Comment ids are global on GitHub, so the lowest-id rule works across
  // issues and repos, not just within one lock issue.
  it('stands the later drain down', () => {
    const a = claim({ id: 100, heldBy: 'drain-a' });
    const b = claim({ id: 200, heldBy: 'drain-b' });
    expect(losesRaceTo([a, b], pixel, 'drain-b')).toBe(a);
    expect(losesRaceTo([a, b], pixel, 'drain-a')).toBeNull();
  });

  it('does not race against itself holding several tests', () => {
    const mine = [
      claim({ id: 100, heldBy: 'drain-a', testId: 'alate#990' }),
      claim({ id: 150, heldBy: 'drain-a', testId: 'alate#1032' }),
    ];
    expect(losesRaceTo(mine, pixel, 'drain-a')).toBeNull();
  });

  it('ignores a rival on the other device', () => {
    const a = claim({ id: 100, heldBy: 'drain-a', device: 'iphone' });
    expect(losesRaceTo([a], pixel, 'drain-b')).toBeNull();
  });
});

describe('the Devices block the board prints', () => {
  it('reports each device with its holder, or free', () => {
    const c = claim();
    const out = resolveDevices([c]);
    expect(out.find(d => d.device === pixel).claim).toBe(c);
    expect(out.find(d => d.device === iphone).claim).toBeNull();
  });

  it('reads UNREADABLE, never free, when any queue could not be read', () => {
    const out = resolveDevices([], ['alate: HTTP 502']);
    out.forEach(d => {
      expect(d.error).toMatch(/alate: HTTP 502/);
      expect(d.claim).toBeUndefined();
    });
  });
});

describe('a taken-over claim cannot come back (review 2026-09-25)', () => {
  // A claim parked on a human never expires, so the only way off it is a
  // --force takeover — which leaves the old comment HELD.
  const parkedDead = () =>
    claim({ id: 100, heldBy: 'drain-a', idle: 90, waitingOn: 'human — tap' });

  it('hands the phone to the taker, not the older parked claim', () => {
    const taker = claim({ id: 200, heldBy: 'drain-b', age: 2 });
    expect(deviceHolder([parkedDead(), taker], pixel)).toBe(taker);
    expect(losesRaceTo([parkedDead(), taker], pixel, 'drain-b')).toBeNull();
  });

  it('keeps it retired after the taker releases', () => {
    const released = claim({ id: 200, heldBy: 'drain-b', age: 2, held: false });
    expect(deviceHolder([parkedDead(), released], pixel)).toBeNull();
  });

  it('does NOT let a later racer retire a fresh claim on the same test', () => {
    // Both posted within seconds: the lower id keeps the phone.
    const first = claim({ id: 100, heldBy: 'drain-a', age: 1, idle: 1 });
    const second = claim({ id: 200, heldBy: 'drain-b', age: 1, idle: 1 });
    expect(losesRaceTo([first, second], pixel, 'drain-b')).toBe(first);
  });

  it('still races two live claims on DIFFERENT tests', () => {
    const a = claim({ id: 100, heldBy: 'drain-a', testId: 'alate#990' });
    const b = claim({ id: 200, heldBy: 'drain-b', testId: 'alate#1032' });
    expect(losesRaceTo([a, b], pixel, 'drain-b')).toBe(a);
  });
});
