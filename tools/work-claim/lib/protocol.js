// The claim protocol — ONE implementation, parameterised per variant.
//
// WHY THIS EXISTS. Two claims shipped independently: 🔒 device claim
// (skills/device-test/scripts/claim-lib.js, 2026-09-01) locks one physical
// handset; 🚧 work claim (../claim.js, 2026-09-07) says which session owns a
// piece of work. Read side by side they are the same mechanism — heading
// glyph, bold `**Field:**` lines, HELD/RELEASED, a `Last touch` heartbeat,
// "waiting on a human never expires", latest-comment-wins resolution, a
// one-line summary for the board. What differs is the SUBJECT and two
// constants. That is a parameter set, not a second design.
//
// The duplication was already costing: adding 🚧 required hand-editing
// device-test's NOTICE_MARKER (with a comment warning the next author to do it
// again); the same concept was spelled `Claimed at` in one and `Started at` in
// the other; and two deliberate decisions had silently drifted apart. This
// module ends all three — the notice registry is derived, the field name is
// declared per variant, and the two divergences are resolved ONCE, here:
//
//   1. AN UNREADABLE TIMESTAMP FAILS OPEN (reads as stale). The device claim
//      argued this and the work claim had drifted to failing closed, where a
//      typo in `Last touch` would hold an item forever. Failing open beats
//      wedging work on a typo — a wrongly-released claim is re-taken in
//      seconds, a wedged one needs a human.
//   2. RESOLUTION GROUPS BY HOLDER, latest comment wins. The happy path is a
//      session editing its own comment in place, leaving one record. But a
//      session that posts a fresh RELEASED comment instead of editing would
//      otherwise leave its earlier HELD record standing, and the item would
//      read as claimed forever. Grouping makes both styles converge.
//
// Keep in sync with standards/workflows.md → "Work claims" and → "Claiming
// the device".

/** Placeholders in **Waiting on:** that mean "parked on nothing". */
const NOT_WAITING = /^(?:—|–|-|none|nothing|n\/a)$/i;

/**
 * Glyphs that mark an automated NOTICE on a queue issue rather than a queue
 * item. Every claim variant registers its own, so a new claim can never again
 * require hand-editing another module's regex — the failure this registry
 * exists to prevent. 📦 (the OTA-publish record written by eas-update.yml) is
 * seeded because it is a notice with no protocol behind it.
 *
 * Item glyphs (🤖 🙋 🔧 ⚪ 🔴) must NEVER appear here: matching one would make
 * every item carrying it invisible to the board, the worst failure the queue
 * parser has.
 */
const NOTICE_GLYPHS = new Set(['📦']);

/** The live notice pattern. Recomputed on registration, never hand-written. */
function noticeMarker() {
  return new RegExp(`^###\\s*(?:${[...NOTICE_GLYPHS].join('|')})`, 'm');
}

/**
 * Markdown with fenced blocks and inline code spans removed.
 *
 * Anything that scans prose for meaning has to do this first. A PR body
 * that DOCUMENTS a syntax contains that syntax: forge #99 explained the
 * Related field with a fenced example reading `- **Related:** closes #707,
 * #696`, and the reference scanner promptly read its own documentation as a
 * real closing keyword — linking a forge claim to an alate issue number
 * that does not exist in forge at all.
 */
function stripCode(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^ {4,}\S.*$/gm, ' ');
}

/**
 * Idle time in the largest honest unit. Minutes stop being readable within
 * a shift, and a work claim may legitimately be days old.
 */
function humanIdle(minutes) {
  if (minutes === null || minutes === undefined) {
    return '?';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 48 * 60) {
    return `${Math.round(minutes / 60)}h`;
  }
  return `${Math.round(minutes / (24 * 60))}d`;
}

/**
 * One line, clamped to `max` characters. Boards are built from text other
 * people wrote, so a single long title must cost one truncated line and
 * never a word wall.
 */
function clip(text, max) {
  if (!text) {
    return text;
  }
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Is this comment an automated notice rather than a queue item?
 *
 * Ask the question; never hold the regex. The glyph set fills in as claim
 * variants load, so a caller that destructures a marker at import time
 * snapshots whichever variants happened to load first — which is exactly
 * how 🚧 work claims briefly went back to filing as malformed device-test
 * items when the require that had been forcing that order was removed.
 */
function isNotice(body) {
  return noticeMarker().test(String(body || ''));
}

function minutesSince(iso) {
  const parsed = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(parsed)
    ? null
    : Math.max(0, Math.floor((Date.now() - parsed) / 60000));
}

/**
 * Read one `- **Name:** value` line. Anchored to the line start so prose that
 * mentions a field name mid-sentence — the footer of every claim body says
 * "flips **Claim:** to RELEASED" — is never mistaken for the field itself.
 */
function field(body, name) {
  const pattern = new RegExp(
    `^\\s*[-*]?\\s*\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`,
    'm'
  );
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

/** Rewrite one field line in place, or insert it before `before` if absent. */
function setField(body, name, value, before) {
  const line = new RegExp(`^(\\s*[-*]?\\s*\\*\\*${name}:\\*\\*).*$`, 'm');
  if (line.test(body)) {
    return body.replace(line, `$1 ${value}`);
  }
  const anchor = new RegExp(`^(\\s*[-*]?\\s*\\*\\*${before}:\\*\\*.*)$`, 'm');
  if (anchor.test(body)) {
    return body.replace(anchor, `- **${name}:** ${value}\n$1`);
  }
  return body;
}

/**
 * Build a claim variant.
 *
 * @param {object} spec
 * @param {string} spec.heading      e.g. 'Work claim'
 * @param {string} spec.glyph        e.g. '🚧'
 * @param {number} spec.staleMinutes silence after which the holder is presumed gone
 * @param {string} spec.startedField the "when was this taken" field name
 * @param {Array}  spec.fields       ordered extra fields: {name, from, render}
 * @param {function} [spec.footer]   body footer lines, given the variant
 */
function createClaimProtocol(spec) {
  const {
    heading,
    glyph,
    staleMinutes,
    startedField,
    fields = [],
    footer = () => [],
  } = spec;

  NOTICE_GLYPHS.add(glyph);

  const MARKER = new RegExp(`^###\\s*${glyph}\\s*${heading}\\b`, 'm');

  function render(opts) {
    const at = opts.at || new Date().toISOString();
    const lines = [
      `### ${glyph} ${heading}`,
      `- **Claimed by:** ${opts.heldBy}`,
    ];
    fields.forEach(f => {
      lines.push(`- **${f.name}:** ${f.render(opts)}`);
    });
    lines.push(
      `- **${startedField}:** ${at}`,
      `- **Last touch:** ${opts.lastTouch || at}`,
      `- **Waiting on:** ${opts.waitingOn || '—'}`,
      `- **Claim:** ${opts.held === false ? 'RELEASED' : 'HELD'}`
    );
    const tail = footer({ staleMinutes, glyph, heading });
    return tail.length ? [...lines, '', ...tail].join('\n') : lines.join('\n');
  }

  function parse(comment) {
    const body = (comment && comment.body) || '';
    if (!MARKER.test(body)) {
      return null;
    }

    const at = field(body, startedField);

    // Claims posted before the heartbeat existed carry only the started
    // field. Falling back to it keeps those readable instead of making every
    // one read as abandoned the moment the heartbeat shipped.
    const lastTouch = field(body, 'Last touch') || at;
    const waitingOnRaw = field(body, 'Waiting on');
    const waitingOnHuman = Boolean(
      waitingOnRaw && !NOT_WAITING.test(waitingOnRaw)
    );
    const idleMinutes = minutesSince(lastTouch);
    const released = (field(body, 'Claim') || '').toUpperCase() === 'RELEASED';

    const parsed = {
      heldBy: field(body, 'Claimed by'),
      at,
      lastTouch,
      ageMinutes: minutesSince(at),
      idleMinutes,
      waitingOn: waitingOnHuman ? waitingOnRaw : null,
      waitingOnHuman,
      released,
      held: !released,

      // Silence, not elapsed time, is the abandonment signal — and a claim
      // parked on a human is never silent by accident, so it never expires.
      // An unreadable timestamp counts as stale, not as an indefinite hold
      // (decision 1 in the header).
      stale: waitingOnHuman
        ? false
        : idleMinutes === null || idleMinutes > staleMinutes,
      commentId: comment.id || null,
      commentUrl: comment.html_url || null,
    };

    fields.forEach(f => {
      parsed[f.from] = field(body, f.name);
    });
    return parsed;
  }

  /**
   * One-line summary for a board or a hook. Empty string when free.
   *
   * This was the last entry on this module's own list of things the two
   * claims share (see the header) that had NOT been absorbed — and it had
   * already forked: the two copies drifted on units, one printing
   * "last touch 4300 min ago" where the board rendered "3d idle". A comment
   * in hooks/work-claims.mjs argued the phrasing must not fork into two
   * vocabularies; it was arguing against code that made forking the
   * default. `subject` is the only part that legitimately differs.
   */
  function describe(claim) {
    if (!claim) {
      return '';
    }
    const where = spec.subject ? spec.subject(claim) : '';
    const parked = claim.waitingOnHuman
      ? `, waiting on ${claim.waitingOn}`
      : '';
    return `${glyph} claimed by ${claim.heldBy}${where} (last touch ${humanIdle(
      claim.idleMinutes
    )} ago${parked})`;
  }

  /** The live holder, or null when the item is free (decision 2 in the header). */
  function active(claims) {
    const latestByHolder = new Map();
    for (const claim of claims || []) {
      if (!claim) {
        continue;
      }
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
    return held.reduce((a, b) =>
      (b.commentId || 0) > (a.commentId || 0) ? b : a
    );
  }

  /** Rewrite the heartbeat (and optionally the park) leaving every other
   *  field exactly as its holder wrote it. */
  function touch(body, opts = {}) {
    let out = setField(
      body,
      'Last touch',
      opts.lastTouch || new Date().toISOString(),
      'Claim'
    );
    if (opts.waitingOn) {
      out = setField(out, 'Waiting on', opts.waitingOn, 'Claim');
    }
    return out;
  }

  function release(body) {
    return setField(body, 'Claim', 'RELEASED', 'Claim');
  }

  return {
    describe,
    HEADING: heading,
    GLYPH: glyph,
    STALE_MINUTES: staleMinutes,
    STARTED_FIELD: startedField,
    MARKER,
    render,
    parse,
    active,
    touch,
    release,
  };
}

module.exports = {
  NOT_WAITING,
  humanIdle,
  clip,
  stripCode,
  NOTICE_GLYPHS,
  noticeMarker,
  isNotice,
  minutesSince,
  field,
  setField,
  createClaimProtocol,
};
