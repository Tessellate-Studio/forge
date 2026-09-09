// Device claim — the 🔒 variant of the claim protocol: a soft lock so two
// sessions don't drive the same phone at once.
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
// The lock lives as a comment on a GitHub issue, so any session, on any
// machine, and any human can read and release it with the tools they already
// use. No new service, no local state file that a second machine cannot see.
//
// WHICH issue changed on 2026-09-09 (RFD-003, forge#107). It used to be the
// app's own device-test queue issue — which was wrong in a way that only
// showed once there were four queues: the device is not any one app's, so a
// lock on alate's queue was invisible to a drain working mood-layer's, and
// the queue medium itself is being retired. It is now one pinned issue per
// PHYSICAL DEVICE in Tessellate-Studio/litmus. See LOCK_REPO below.
//
// It is advisory, not enforced — nothing can stop a raw `adb` command. It
// removes the ambiguity, which is what actually went wrong.
//
// WHAT LIVES WHERE (changed 2026-09-07). The MECHANISM — heading, fields,
// HELD/RELEASED, the heartbeat, staleness, latest-comment-wins resolution —
// is not specific to a phone, and a second claim (🚧 work claim, which says
// which session owns a piece of WORK) proved it by re-implementing the whole
// thing. Both now share tools/work-claim/lib/protocol.js and this file
// declares only what makes the device claim different: the glyph, the
// 30-minute silence window, `Claimed at` rather than `Started at`, and the
// `Device` field. See that module's header for the two behaviours the merge
// had to reconcile.
//
// HOW A CLAIM ENDS. It used to expire 45 minutes after it was taken. That
// measured the wrong thing: plenty of fixes run longer than 45 minutes, and
// the session still holding the phone had its claim quietly ignored mid-job.
// A claim now ends when its holder CLOSES it — edit `**Claim:**` to RELEASED
// and minimize the comment. The only automatic escape hatch is SILENCE, not
// duration: the holder rewrites `**Last touch:**` every time it drives the
// device, and a claim reads as abandoned only after HEARTBEAT_STALE_MINUTES
// with no touch at all. A claim parked on a human step
// (`**Waiting on:** human — …`) never expires, because a human step
// legitimately takes hours and stealing the device out from under one is the
// exact collision this lock exists to prevent.

const path = require('path');

const { NOT_WAITING, isNotice, createClaimProtocol } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tools',
  'work-claim',
  'lib',
  'protocol.js'
));

/** No touch for this long and the holder is presumed gone — the backstop for
 *  a crashed session, NOT a cap on how long a job may hold the phone. Long
 *  enough to cover an OTA double-relaunch, a cloud-build download, or a human
 *  reading a step; short enough to clear within one sitting. */
const HEARTBEAT_STALE_MINUTES = 30;

/**
 * WHERE THE LOCK LIVES (RFD-003 §3, forge#107).
 *
 * Not in an app repo, because the device is not any one app's — alate,
 * mood-layer and badige all drive the same handset, and a lock that lived on
 * one of their queues would be invisible to a drain working another. Not in
 * forge, which is public, while a claim may legitimately name the unreleased
 * thing being tested. litmus is the private "shared testing utilities for
 * Tessellate mobile apps" repo, and a device is a shared test fixture — its
 * charter exactly. Zero files anywhere, as ADR-003 required.
 */
const LOCK_REPO = 'Tessellate-Studio/litmus';

/**
 * One pinned issue per PHYSICAL device, because they are claimed
 * independently: a drain can hold the Pixel over adb while a human is
 * mid-sitting on the iPhone, and neither should block the other.
 */
const DEVICES = [
  {
    serial: '804KPSL1724518',
    label: 'Pixel, Android',
    repo: LOCK_REPO,
    issue: 43,
    adb: true,
    waitsOnHuman: false,
  },
  {
    serial: 'iphone',
    label: 'iPhone — TestFlight, no adb',
    repo: LOCK_REPO,
    issue: 44,
    adb: false,

    // Every step on this device is someone's hands, so its claim sits
    // permanently at `Waiting on: human` — and a claim parked on a human
    // never expires. That is the honest description of a TestFlight device,
    // not a way around the staleness rule.
    waitsOnHuman: true,
  },
];

/**
 * The device a serial names, defaulting to the adb handset.
 *
 * An unregistered serial is far likelier to be the Pixel re-flashed or
 * re-paired than a second phone nobody told the queue about, and guessing the
 * iPhone would park an agent-runnable drain on a human indefinitely — the
 * expensive direction to be wrong in.
 */
function deviceFor(serial) {
  return DEVICES.find(d => d.serial === serial) || DEVICES.find(d => d.adb);
}

/**
 * The claim that beats mine, or null when mine stands — half of the
 * post-then-re-read rule (RFD-003 §3).
 *
 * LOWEST comment id wins, not the latest. Ids are server-assigned and
 * monotonic, so two racers re-reading the same issue reach the SAME verdict
 * with no clock, no lease and no coordination: the earlier poster keeps the
 * device and the later one releases and stands down. The 16-second collision
 * on 2026-09-07 resolves in one round trip.
 *
 * This does not contradict `activeClaim`'s latest-wins rule. That one groups
 * by holder first and answers "who holds it now" for display; this one
 * arbitrates between DIFFERENT holders during the race window, after which
 * only one HELD claim remains and the two agree again.
 *
 * Released and stale claims are skipped, so a crashed session that posted
 * first cannot wedge the device forever.
 */
function losesRaceTo(claims, myCommentId) {
  const rivals = (claims || []).filter(
    c => c && c.held && !c.stale && c.commentId && c.commentId < myCommentId
  );
  if (rivals.length === 0) {
    return null;
  }
  return rivals.reduce((a, b) => (b.commentId < a.commentId ? b : a));
}

const PROTOCOL = createClaimProtocol({
  heading: 'Device claim',
  glyph: '🔒',
  staleMinutes: HEARTBEAT_STALE_MINUTES,
  startedField: 'Claimed at',
  subjectBefore: c =>
    c.device && c.device !== 'any' ? ` device ${c.device}` : ' device',
  fields: [{ name: 'Device', from: 'device', render: o => o.device || 'any' }],
  footer: ({ staleMinutes }) => [
    '_Written by /forge:device-test. The claim ends when its holder closes it:',
    'edit **Claim:** to RELEASED and minimize this comment. There is no cap on',
    'how long a job may hold the phone — refresh **Last touch:** on every',
    `device action, and only ${staleMinutes} min of total silence`,
    'reads as abandoned. A claim **Waiting on:** a human never expires._',
  ],
});

const CLAIM_MARKER = PROTOCOL.MARKER;

/**
 * Automated notices that post to the queue issue but are NOT tests — the
 * OTA-publish record written by eas-update.yml (📦), this device claim (🔒),
 * and the work claim a session posts when it picks up a tracked item (🚧).
 * They carry a heading and no Status line, so the item parser files them as
 * malformed items and the board nags forever about drift no human caused.
 * Six of the nine "unparseable" comments on alate#562 were exactly this.
 *
 * DERIVED, not hand-written: every claim variant registers its own glyph
 * with the protocol module as it is created. queue-lib.js — the only
 * consumer of this marker — imports the 🚧 variant for its `gh` helpers, so
 * both variants are always registered before the marker is read. There used
 * to be a require here whose only purpose was that registration; it went
 * when the real dependency made it redundant.
 *
 * The rest of the rule still holds: every claim variant registers its glyph
 * the protocol module. Item glyphs (🤖 🙋 🔧 ⚪ 🔴) must never be registered —
 * matching one would make every item carrying it invisible to the board, the
 * worst failure this parser has. 🤖 in particular was once listed here and had
 * to be removed when it became an item glyph.
 */

/**
 * Parse a claim comment. Returns null for anything that isn't one, so it can
 * be mapped over every comment on the issue.
 */
const parseClaim = PROTOCOL.parse;

/**
 * The live holder, or null when the device is free. Resolved per holder,
 * latest comment wins — see the protocol module's header for why.
 */
const activeClaim = PROTOCOL.active;

/**
 * Render a claim comment body.
 * Keep in sync with standards/workflows.md → "Claiming the device".
 */
function claimBody(opts) {
  return PROTOCOL.render({
    ...opts,
    device: opts.device || 'any',
    held: opts.held !== false,
  });
}

/** One-line summary for the board / hook. Empty string when free. */
const describeClaim = PROTOCOL.describe;

module.exports = {
  HEARTBEAT_STALE_MINUTES,
  LOCK_REPO,
  DEVICES,
  deviceFor,
  losesRaceTo,
  PROTOCOL,
  CLAIM_MARKER,
  isNotice,
  NOT_WAITING,
  parseClaim,
  activeClaim,
  claimBody,
  describeClaim,
};
