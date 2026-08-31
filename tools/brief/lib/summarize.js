'use strict';

// Pure text summarization: keep head + tail, collapse the middle. No
// command-specific parsing — this has to work for arbitrary output (git,
// npm, test runners, build logs, whatever), so it never tries to guess
// what's "important" beyond position. Callers decide when it's safe to
// call this at all (agent-brief.js only does so on a zero exit code —
// failure output is never summarized here).

const DEFAULT_MAX_LINES = 60;
const DEFAULT_MAX_BYTES = 4000;

function byteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

function summarizeOutput(text, opts = {}) {
  const maxLines = opts.maxLines || DEFAULT_MAX_LINES;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;

  if (!text) {
    return { truncated: false, text: '', totalLines: 0, totalBytes: 0, omitted: 0 };
  }

  const lines = text.split('\n');
  const totalLines = lines.length;
  const totalBytes = byteLength(text);

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return { truncated: false, text, totalLines, totalBytes, omitted: 0 };
  }

  const headCount = Math.min(Math.ceil(maxLines / 2), totalLines);
  const tailCount = Math.min(Math.floor(maxLines / 2), totalLines - headCount);
  const head = lines.slice(0, headCount);
  const tail = tailCount > 0 ? lines.slice(totalLines - tailCount) : [];
  const omitted = Math.max(totalLines - head.length - tail.length, 0);

  const body = [...head, `… ${omitted} lines omitted …`, ...tail].join('\n');

  return { truncated: true, text: body, totalLines, totalBytes, omitted };
}

module.exports = { summarizeOutput, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES };
