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

/** A claim older than this is ignored, so a crashed session cannot wedge
 *  the device forever. Chosen to comfortably outlast a normal drain
 *  (minutes) while still clearing within one sitting. */
const CLAIM_TTL_MINUTES = 45;

const CLAIM_MARKER = /^###\s*🔒\s*Device claim\b/m;

/**
 * Automated notices that post to the queue issue but are NOT tests — the
 * OTA-publish record written by eas-update.yml, plus the claim above. They
 * carry a heading and no Status line, so the item parser files them as
 * malformed items and the board nags forever about drift no human caused.
 * Six of the nine "unparseable" comments on alate#562 were exactly this.
 * Add a pattern here when a new bot starts posting to the queue.
 */
const NOTICE_MARKER = /^###\s*(?:📦|🔒|🤖)/m;

function claimField(body, name) {
  const pattern = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`, 'm');
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
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
  const parsedAt = at ? Date.parse(at) : NaN;
  const ageMinutes = Number.isNaN(parsedAt)
    ? null
    : Math.max(0, Math.floor((Date.now() - parsedAt) / 60000));
  return {
    heldBy: claimField(body, 'Claimed by'),
    device: claimField(body, 'Device'),
    at,
    ageMinutes,
    released: (claimField(body, 'Claim') || '').toUpperCase() === 'RELEASED',

    // An unparseable timestamp counts as stale rather than as an indefinite
    // hold — failing open beats wedging the device on a typo.
    stale: ageMinutes === null || ageMinutes > CLAIM_TTL_MINUTES,
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
  const held = opts.held !== false;
  return [
    '### 🔒 Device claim',
    `- **Claimed by:** ${heldBy}`,
    `- **Device:** ${device}`,
    `- **Claimed at:** ${at}`,
    `- **Claim:** ${held ? 'HELD' : 'RELEASED'}`,
    '',
    '_Written by /forge:device-test. Release by editing **Claim:** to',
    `RELEASED. A claim older than ${CLAIM_TTL_MINUTES} min is treated as`,
    'stale and ignored, so a crashed session cannot wedge the device._',
  ].join('\n');
}

/** One-line summary for the board / hook. Empty string when free. */
function describeClaim(claim) {
  if (!claim) {
    return '';
  }
  const age = claim.ageMinutes === null ? '?' : claim.ageMinutes;
  const device =
    claim.device && claim.device !== 'any' ? ` ${claim.device}` : '';
  return `🔒 device${device} claimed by ${claim.heldBy} (${age} min ago)`;
}

module.exports = {
  CLAIM_TTL_MINUTES,
  CLAIM_MARKER,
  NOTICE_MARKER,
  parseClaim,
  activeClaim,
  claimBody,
  describeClaim,
};
