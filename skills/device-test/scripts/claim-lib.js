// Device claim — a soft lock so two sessions don't drive the same phone at
// once.
//
// WHY THIS EXISTS. The status board (dtq) is read-only and answers "what is
// pending?". Nothing answered "is anyone on the device RIGHT NOW?". On
// 2026-09-01 two sessions reached for the same handset (804KPSL1724518)
// within the hour: one ran a 15-cycle relaunch investigation plus a full
// drain, the other had enqueued a device item without claiming the device.
// Neither announced. Because every session commits under the same GitHub
// account, authorship is not readable from the byline either — the collision
// had to be reconstructed afterwards by one session messaging the other.
//
// The lock lives as a comment on the SAME queue issue the drain already
// reads, so the queue itself carries it: any session, on any machine, and
// any human, can read and release it with the tools they already use. No new
// service, no local state file that a second machine cannot see.
//
// It is advisory, not enforced — nothing can stop a raw `adb` command. It
// removes the ambiguity, which is what actually went wrong.
//
// HOW A CLAIM ENDS (changed 2026-09-03). It used to expire 45 minutes after
// it was taken. That measured the wrong thing: plenty of fixes run longer
// than 45 minutes, and the session still holding the phone had its claim
// quietly ignored mid-job. A claim now ends when its holder CLOSES it — edit
// `**Claim:**` to RELEASED and minimize the comment. The only automatic
// escape hatch is SILENCE, not duration: the holder rewrites `**Last touch:**`
// every time it drives the device, and a claim reads as abandoned only after
// HEARTBEAT_STALE_MINUTES with no touch at all. A claim parked on a human
// step (`**Waiting on:** human — …`) never expires, because a human step
// legitimately takes hours and stealing the device out from under one is the
// exact collision this lock exists to prevent.

/** No touch for this long and the holder is presumed gone — the backstop for
 *  a crashed session, NOT a cap on how long a job may hold the phone. Long
 *  enough to cover an OTA double-relaunch, a cloud-build download, or a human
 *  reading a step; short enough to clear within one sitting. */
const HEARTBEAT_STALE_MINUTES = 30;

const CLAIM_MARKER = /^###\s*🔒\s*Device claim\b/m;

/**
 * Automated notices that post to the queue issue but are NOT tests — the
 * OTA-publish record written by eas-update.yml, plus the claim above. They
 * carry a heading and no Status line, so the item parser files them as
 * malformed items and the board nags forever about drift no human caused.
 * Six of the nine "unparseable" comments on alate#562 were exactly this.
 *
 * 🤖 is deliberately NOT here: since the heading template landed it is an
 * ITEM glyph ("open, agent-runnable"), and matching it as a notice would make
 * every agent-runnable item invisible — the worst failure this parser has.
 * A new bot posting here must pick a heading glyph outside the item set
 * (🤖 🙋 🔧 ⚪ 🔴) and be added to this pattern.
 */
const NOTICE_MARKER = /^###\s*(?:📦|🔒)/m;

/** Placeholders in **Waiting on:** that mean "parked on nothing". */
const NOT_WAITING = /^(?:—|–|-|none|nothing|n\/a)$/i;

function claimField(body, name) {
  const pattern = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`, 'm');
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

function minutesSince(iso) {
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(parsed)
    ? null
    : Math.max(0, Math.floor((Date.now() - parsed) / 60000));
}

/**
 * Parse a claim comment. Returns null for anything that isn't one, so it can
 * be mapped over every comment on the issue.
 */
function parseClaim(comment) {
  const body = comment.body || '';
  if (!CLAIM_MARKER.test(body)) {
    return null;
  }
  const at = claimField(body, 'Claimed at');

  // Claims posted before the heartbeat existed carry only "Claimed at".
  // Falling back to it keeps those readable, instead of making every one of
  // them read as abandoned the moment this shipped.
  const lastTouch = claimField(body, 'Last touch') || at;
  const waitingOn = claimField(body, 'Waiting on');
  const waitingOnHuman = Boolean(waitingOn && !NOT_WAITING.test(waitingOn));
  const idleMinutes = minutesSince(lastTouch);

  return {
    heldBy: claimField(body, 'Claimed by'),
    device: claimField(body, 'Device'),
    at,
    lastTouch,
    ageMinutes: minutesSince(at),
    idleMinutes,
    waitingOn: waitingOnHuman ? waitingOn : null,
    waitingOnHuman,
    released: (claimField(body, 'Claim') || '').toUpperCase() === 'RELEASED',

    // Silence, not elapsed time, is the abandonment signal — and a claim
    // parked on a human is never silent by accident, so it never expires.
    // An unreadable timestamp counts as stale rather than as an indefinite
    // hold: failing open beats wedging the device on a typo.
    stale: waitingOnHuman
      ? false
      : idleMinutes === null || idleMinutes > HEARTBEAT_STALE_MINUTES,
    commentId: comment.id,
    commentUrl: comment.html_url,
  };
}

/**
 * The live holder, or null when the device is free.
 *
 * Resolved PER HOLDER, latest comment wins, rather than by scanning for any
 * un-released claim. The happy path is a session editing its own claim
 * comment in place, which leaves exactly one record — but a session that
 * posts a fresh "RELEASED" comment instead of editing (or that claims twice)
 * would otherwise leave its earlier HELD record standing, and the device
 * would read as claimed forever. Grouping by holder makes both styles
 * converge on the same answer.
 */
function activeClaim(claims) {
  const latestByHolder = new Map();
  for (const claim of claims) {
    const key = claim.heldBy || '(unknown)';
    const seen = latestByHolder.get(key);

    // Comment ids increase monotonically, so the highest is the newest.
    if (!seen || (claim.commentId || 0) >= (seen.commentId || 0)) {
      latestByHolder.set(key, claim);
    }
  }
  const held = [...latestByHolder.values()].filter(
    c => !c.released && !c.stale
  );
  if (held.length === 0) {
    return null;
  }

  // More than one holder should not happen; if it does, report the newest so
  // the message names whoever most recently took it.
  return held.reduce((a, b) =>
    (b.commentId || 0) > (a.commentId || 0) ? b : a
  );
}

/**
 * Render a claim comment body.
 * Keep in sync with standards/workflows.md → "Claiming the device".
 */
function claimBody(opts) {
  const heldBy = opts.heldBy;
  const device = opts.device || 'any';
  const at = opts.at;
  const lastTouch = opts.lastTouch || at;
  const waitingOn = opts.waitingOn || '—';
  const held = opts.held !== false;
  return [
    '### 🔒 Device claim',
    `- **Claimed by:** ${heldBy}`,
    `- **Device:** ${device}`,
    `- **Claimed at:** ${at}`,
    `- **Last touch:** ${lastTouch}`,
    `- **Waiting on:** ${waitingOn}`,
    `- **Claim:** ${held ? 'HELD' : 'RELEASED'}`,
    '',
    '_Written by /forge:device-test. The claim ends when its holder closes it:',
    'edit **Claim:** to RELEASED and minimize this comment. There is no cap on',
    'how long a job may hold the phone — refresh **Last touch:** on every',
    `device action, and only ${HEARTBEAT_STALE_MINUTES} min of total silence`,
    'reads as abandoned. A claim **Waiting on:** a human never expires._',
  ].join('\n');
}

/** One-line summary for the board / hook. Empty string when free. */
function describeClaim(claim) {
  if (!claim) {
    return '';
  }
  const idle = claim.idleMinutes === null ? '?' : claim.idleMinutes;
  const device =
    claim.device && claim.device !== 'any' ? ` ${claim.device}` : '';
  const parked = claim.waitingOnHuman ? `, waiting on ${claim.waitingOn}` : '';
  return `🔒 device${device} claimed by ${claim.heldBy} (last touch ${idle} min ago${parked})`;
}

module.exports = {
  HEARTBEAT_STALE_MINUTES,
  CLAIM_MARKER,
  NOTICE_MARKER,
  parseClaim,
  activeClaim,
  claimBody,
  describeClaim,
};
