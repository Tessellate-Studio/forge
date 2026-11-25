'use strict';

// The check under `standards/workflows.md` → "Summary markers". The rule was
// prose in two places (that section and ~/.claude/CLAUDE.md) and nothing read
// it back, so PR bodies shipped without a single marker (forge#212's first
// body, 2026-11-23, owner: "why don't I see emojis being used?"). This turns
// the rule into a refusal for the one place a hook can see a report before it
// is published: the body of `gh pr create` / `gh pr edit`.
//
// Pure functions only: the hook entry point (report-markers.mjs) does the IO.

const MARKERS = ['👀', '⚠️', '✅', '💡', 'ℹ️', '🟣', '🟡', '💤', '🚨', '🐛'];

// The bare symbols too: a body may carry ⚠ / ℹ without the variation
// selector, and that is the same marker to a reader.
const MARKER_PREFIX = /^(👀|⚠️?|✅|💡|ℹ️?|🟣|🟡|💤|🚨|🐛)/u;

/** Is this `gh` call one that publishes a PR body? */
function isPrBodyCommand(command) {
  if (typeof command !== 'string') {
    return false;
  }

  // Statement-level: `gh pr create|edit` with a body flag. Mentioning the words
  // inside a commit message is not a PR body.
  return (
    /(^|[;&|(\n]\s*)gh\s+pr\s+(create|edit)\b/.test(command) &&
    /(\s--body(-file)?\b|\s-[bF]\s)/.test(command)
  );
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The heredoc text this command writes to `target`, or null if it writes none. */
function writtenInCommand(command, target) {
  const t = escapeRe(target);
  const re = new RegExp(
    `>\\s*(?:"${t}"|'${t}'|${t})\\s*<<-?\\s*['"]?(\\w+)['"]?[^\\n]*\\n([\\s\\S]*?)\\n\\s*\\1\\s*(?:\\n|$)`
  );
  const m = command.match(re);
  if (m) {
    return m[2];
  }
  const before = new RegExp(
    `<<-?\\s*['"]?(\\w+)['"]?\\s*>\\s*(?:"${t}"|'${t}'|${t})[^\\n]*\\n([\\s\\S]*?)\\n\\s*\\1\\s*(?:\\n|$)`
  );
  const n = command.match(before);
  return n ? n[2] : null;
}

/** Pull the body text, or a body-file path, out of the command. */
function extractBody(command) {
  const file = command.match(
    /\s(?:--body-file|-F)[\s=]+("([^"]+)"|'([^']+)'|(\S+))/
  );
  if (file) {
    const target = file[2] || file[3] || file[4];

    // The hook runs BEFORE the command, so a body file the same command writes
    // (`cat > "$TEMP/pr.md" <<'EOF' … EOF`) does not exist yet, or is a stale
    // copy another session left there. Judge the text being written instead.
    const written = writtenInCommand(command, target);
    return written === null ? { file: target } : { text: written };
  }
  const heredoc = command.match(
    /\s(?:--body|-b)[\s=]+"\$\(cat <<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\s*\1\s*\n?\)"/
  );
  if (heredoc) {
    return { text: heredoc[2] };
  }
  const dq = command.match(/\s(?:--body|-b)[\s=]+"((?:[^"\\]|\\.)*)"/);
  if (dq) {
    return { text: dq[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') };
  }
  const sq = command.match(/\s(?:--body|-b)[\s=]+'([^']*)'/);
  if (sq) {
    return { text: sq[1] };
  }
  return null;
}

/**
 * Lines of the body that break the rule, and whether any marker is present.
 * A top-level bullet (column 0, `-` or `*`) is a highlighted point, so it must
 * start with a marker. Task-list items, fenced code and quotes are not points.
 */
function checkBody(body) {
  const text = String(body || '');
  const unmarked = [];
  let inFence = false;
  let markerSeen = false;

  text.split(/\r?\n/).forEach(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      return;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const point = bullet[1];
      if (/^\[[ xX]\]/.test(point)) {
        return; // a task list item is state, not a highlighted point
      }
      if (MARKER_PREFIX.test(point)) {
        markerSeen = true;
      } else {
        unmarked.push(line);
      }
      return;
    }
    if (MARKER_PREFIX.test(line.trim())) {
      markerSeen = true;
    }
  });

  return { ok: markerSeen && unmarked.length === 0, markerSeen, unmarked };
}

const REFUSAL = ({ markerSeen, unmarked }) =>
  [
    'Refused: this PR body does not follow "Summary markers" (forge standards/workflows.md).',
    markerSeen ? '' : '\nIt carries no marker at all.',
    unmarked.length
      ? `\nTop-level points without a marker:\n${unmarked
          .slice(0, 8)
          .map(l => `  ${l.slice(0, 100)}`)
          .join('\n')}`
      : '',
    `\n\nStart each highlighted point with exactly one of: ${MARKERS.join(
      ' '
    )}`,
    '\n(👀 needs a human, ⚠️ against a recommendation, ✅ done, 💡 idea, ℹ️ info,',
    ' 🟣 decision, 🟡 watch, 💤 nothing to do, 🚨 urgent/failed, 🐛 bug.)',
    ' A bug fix leads with 🐛 saying what was broken for the user.',
  ].join('');

/**
 * The text of the assistant's final reply this turn, from the transcript JSONL
 * lines: every assistant text block after the last message the user typed (a
 * user entry whose content is a string or has text blocks, not a tool result).
 */
function finalReplyText(lines) {
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // a torn last line while the file is being written; skip it
    }
  }
  let start = 0;
  entries.forEach((e, i) => {
    const c = e && e.type === 'user' && e.message && e.message.content;
    const typed =
      typeof c === 'string' ||
      (Array.isArray(c) && c.some(b => b && b.type === 'text'));
    if (typed) {
      start = i + 1;
    }
  });
  return entries
    .slice(start)
    .filter(e => e && e.type === 'assistant' && e.message)
    .flatMap(e =>
      Array.isArray(e.message.content)
        ? e.message.content.filter(b => b && b.type === 'text').map(b => b.text)
        : []
    )
    .join('\n')
    .trim();
}

/**
 * A chat reply is held to the rule only when it is a report: two or more
 * top-level points. A one-line answer or a conversational paragraph is not a
 * summary, and blocking it would only add noise.
 */
function checkReply(text) {
  const points = String(text || '')
    .split(/\r?\n/)
    .filter(l => /^[-*]\s+/.test(l) && !/^[-*]\s+\[[ xX]\]/.test(l));
  if (points.length < 2) {
    return { ok: true, report: false, unmarked: [] };
  }
  const v = checkBody(text);
  return { ok: v.unmarked.length === 0, report: true, unmarked: v.unmarked };
}

const REPLY_NUDGE = ({ unmarked }) =>
  [
    'Your final reply is a report, and these top-level points have no summary marker',
    ' (forge standards/workflows.md → "Summary markers"):\n',
    unmarked
      .slice(0, 8)
      .map(l => `  ${l.slice(0, 100)}`)
      .join('\n'),
    `\n\nRestate the reply with exactly one of ${MARKERS.join(' ')}`,
    ' at the start of each point, most urgent first. Do not redo any work.',
  ].join('');

module.exports = {
  MARKERS,
  isPrBodyCommand,
  extractBody,
  checkBody,
  REFUSAL,
  finalReplyText,
  checkReply,
  REPLY_NUDGE,
};
