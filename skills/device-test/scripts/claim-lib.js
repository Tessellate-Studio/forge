// Device lock — a soft lock so two sessions don't drive the same phone at once.
//
// WHY THIS EXISTS. The status board (dtq) answers "what is pending?". Nothing
// answered "is anyone on the device RIGHT NOW?". On 2026-09-01 two sessions
// reached for the same handset within the hour, and on 2026-09-07 two drains
// interleaved through alate's body-profile mutate/restore flow and wiped the
// user's real saved profile. Every session commits under the same GitHub
// account, so the byline never says who is on the phone.
//
// WHERE IT LIVES (ADR-004, 2026-09-25, superseding RFD-003 §3). It used to be
// a 🔒 comment on one pinned issue per handset in Tessellate-Studio/litmus.
// That was a second place to look, a second claim format, and a lock that
// said nothing about WHICH test was running. Now there is no lock issue: a
// drain claims each device-test issue it takes with the ordinary 🚧 work
// claim (`wip claim <repo>#<n> --device pixel`) — same `claimed` label, same
// session / worktree / related fields a PR claim carries — and a phone is
// busy while any OPEN device-test issue holds a live claim naming it. The
// test list and the lock are the same list.
//
// TWO WINDOWS, ON PURPOSE. The work claim survives seven days of silence,
// because nobody is blocked waiting on it. The PHONE is scarce: someone is
// waiting, so a device claim stops holding the phone after
// HEARTBEAT_STALE_MINUTES of silence — while the work claim itself stays
// readable on the issue. A claim parked on a human (`Waiting on: human — …`)
// never expires on either window.
//
// It is advisory, not enforced — nothing can stop a raw `adb` command. It
// removes the ambiguity, which is what actually went wrong.

/** No touch for this long and the phone is presumed free — the backstop for a
 *  crashed drain, NOT a cap on how long a job may hold the phone. Long enough
 *  to cover an OTA double-relaunch, a cloud-build download, or a human reading
 *  a step; short enough to clear within one sitting. */
const HEARTBEAT_STALE_MINUTES = 30;

/**
 * The physical devices, claimed independently: a drain can hold the Pixel
 * over adb while a human is mid-sitting on the iPhone, and neither blocks the
 * other. `key` is what a claim's `Device` field says.
 */
const DEVICES = [
  {
    key: 'pixel',
    serial: '804KPSL1724518',
    label: 'Pixel, Android',
    adb: true,
    waitsOnHuman: false,
  },
  {
    key: 'iphone',
    serial: 'iphone',
    label: 'iPhone — TestFlight, no adb',
    adb: false,

    // Every step on this device is someone's hands, so its claims sit at
    // `Waiting on: human` — and a claim parked on a human never expires.
    waitsOnHuman: true,
  },
];

/**
 * The device a name or serial refers to, defaulting to the adb handset.
 *
 * An unregistered name is far likelier to be the Pixel re-flashed or
 * re-paired than a second phone nobody told the queue about, and guessing the
 * iPhone would park an agent-runnable drain on a human indefinitely — the
 * expensive direction to be wrong in. For the busy check it is also the SAFE
 * direction: a claim naming an unknown device locks the handset rather than
 * nothing.
 */
function deviceFor(name) {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  return (
    DEVICES.find(d => d.key === n || d.serial.toLowerCase() === n) ||
    DEVICES.find(d => d.adb)
  );
}

/** Does this parsed work claim hold this phone right now? */
function holdsDevice(claim, device) {
  if (!claim || !claim.device || !claim.held) {
    return false;
  }
  if (deviceFor(claim.device) !== device) {
    return false;
  }
  if (claim.waitingOnHuman) {
    return true;
  }
  return (
    claim.idleMinutes !== null && claim.idleMinutes <= HEARTBEAT_STALE_MINUTES
  );
}

const byCommentId = (a, b) => (a.commentId || 0) - (b.commentId || 0);

/**
 * Drop claims a later claim on the SAME test has superseded.
 *
 * `wip claim --force` takes a silent test over by posting a new claim; the
 * crashed holder's comment stays HELD because nobody alive can release it.
 * Counting it would hand the phone back to a dead drain — it has the lower
 * comment id — the moment anything made it look alive (review 2026-09-25).
 *
 * But only a TAKEOVER supersedes. Two drains racing for one test both post
 * fresh claims, and there the lower id must still win; if "later retires
 * earlier" applied to them too, the race rule would invert. So a later claim
 * by a different holder retires an earlier one only if, when it was posted,
 * the earlier was already silent past the window or parked on a human —
 * i.e. only a `--force` over something the phone rules had let go of, or a
 * deliberate takeover of a human-parked claim.
 */
function takenOver(earlier, later) {
  if (earlier.waitingOnHuman) {
    return true;
  }
  const touched = Date.parse(earlier.lastTouch);
  const posted = Date.parse(later.at);
  if (Number.isNaN(touched) || Number.isNaN(posted)) {
    return true; // unreadable reads as stale, as everywhere in the protocol
  }
  return posted - touched > HEARTBEAT_STALE_MINUTES * 60000;
}

function current(claims) {
  const list = (claims || []).filter(Boolean);
  return list.filter(
    c =>
      !list.some(
        later =>
          later.testId === c.testId &&
          later.heldBy !== c.heldBy &&
          (later.commentId || 0) > (c.commentId || 0) &&
          takenOver(c, later)
      )
  );
}

/**
 * Who holds the phone, or null when it is free.
 *
 * @param claims every parsed claim on every OPEN device-test issue, across
 *   all queue repos (see queue-lib `fetchDeviceClaims`)
 *
 * When two drains both hold tests on one phone, the EARLIEST claim is the
 * holder — the same verdict `losesRaceTo` gives the later drain.
 */
function deviceHolder(claims, device) {
  const live = current(claims).filter(c => holdsDevice(c, device));
  return live.length ? live.sort(byCommentId)[0] : null;
}

/**
 * The claim that beats mine, or null when mine stands — the post-then-re-read
 * rule (RFD-003 §3, carried over).
 *
 * LOWEST comment id wins. GitHub comment ids are server-assigned and global,
 * so two drains that claimed DIFFERENT tests, even in different repos, reach
 * the same verdict with no clock and no coordination: the earlier poster
 * keeps the phone, the later releases everything it claimed and stands down.
 * My own other claims are never rivals — one drain holds several tests.
 */
function losesRaceTo(claims, device, myHeldBy) {
  const live = current(claims);
  const holder = deviceHolder(
    live.filter(c => c.heldBy !== myHeldBy),
    device
  );
  if (!holder) {
    return null;
  }
  const mine = live
    .filter(c => c.heldBy === myHeldBy && holdsDevice(c, device))
    .sort(byCommentId)[0];
  return !mine || holder.commentId < mine.commentId ? holder : null;
}

/**
 * The board's Devices block: one row per phone.
 *
 * Any queue that could not be read makes EVERY device unreadable, never free:
 * the claim that holds the phone may be sitting in exactly that repo, and
 * "nobody is on the phone" and "I could not find out" are opposite
 * instructions to a session about to drive it.
 */
function resolveDevices(claims, errors = []) {
  return DEVICES.map(device =>
    errors.length
      ? { device, error: errors.join('; ') }
      : { device, claim: deviceHolder(claims, device) }
  );
}

/** One-line summary for the board: which phone, which test, who. */
function describeDeviceClaim(device, claim) {
  if (!claim) {
    return '';
  }
  const idle =
    claim.idleMinutes === null ? '?' : `${Math.round(claim.idleMinutes)}m`;
  const parked = claim.waitingOnHuman ? `, waiting on ${claim.waitingOn}` : '';
  return `🔒 ${device.label} — ${claim.testId || 'a test'} claimed by ${
    claim.heldBy
  } (last touch ${idle} ago${parked})`;
}

module.exports = {
  HEARTBEAT_STALE_MINUTES,
  DEVICES,
  deviceFor,
  holdsDevice,
  deviceHolder,
  losesRaceTo,
  resolveDevices,
  describeDeviceClaim,
};
