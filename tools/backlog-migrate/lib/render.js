// Rendering for backlog-migrate (RFD 004 §5.3–§5.5, §5.7): titles, the
// idempotency marker, issue bodies, the dry-run table and the pointer file.
// Pure — no I/O — so every string that reaches GitHub is unit-testable.

const crypto = require('crypto');
const path = require('path');

const OWNER = 'Tessellate-Studio';
const MARKER_VERSION = 'v1';
const TITLE_MAX = 256;

// GitHub rejects bodies over 65,536 chars with `422 body is too long`; cut
// well under it so the header and the continuation line always fit.
const BODY_CAP = 60000;

const sha1 = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex');

/** Strip inline markdown: links keep their text, emphasis/strike/code marks go. */
function stripMarkdown(s) {
  return String(s)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/~~/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Status suffixes are dropped from the KEY only (the rendered title keeps
// them — they are current state). Keying on the bare title is what lets a
// re-run after a status edit find the issue it already created.
const STATUS_SUFFIXES = [
  /\s+—\s+(NEW|BUILT DARK|PARTIAL|LIVE|CLOSED|RESOLVED|SHIPPED|DONE|SUPERSEDED|DEFERRED)\b.*$/i,
  /\s*\((SHIPPED|DONE|RESOLVED|NEW|CLOSED|decided|pinned|found)\b[^)]*\)\s*$/i,
  /\s+—\s+📌.*$/u,
];

function normalizeTitle(title) {
  let t = stripMarkdown(title).toLowerCase();
  for (let pass = 0; pass < 3; pass++) {
    for (const re of STATUS_SUFFIXES) {
      t = t.replace(re, '');
    }
  }
  return t.replace(/\s+/g, ' ').trim();
}

function entryKey(repo, title) {
  return sha1(`${repo}\n${normalizeTitle(title)}`).slice(0, 12);
}

/**
 * The issue title. An entry written `**Title.**` puts the sentence's full stop
 * inside the bold, so the parsed title ends in "." (the loom pilot fixed two
 * by hand). One trailing full stop is dropped; an ellipsis is kept. The KEY
 * (normalizeTitle) is left alone on purpose: changing it would make a re-run
 * over an already-migrated repo miss its own markers and file duplicates.
 */
function renderTitle(title) {
  const t = stripMarkdown(title).replace(/(?<!\.)\.$/, '');
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

function marker({ repo, key, sha, startLine, endLine, hash }) {
  return (
    `<!-- backlog-migrate ${MARKER_VERSION} repo=${repo} key=${key} ` +
    `src=${sha}:BACKLOG.md#L${startLine}-L${endLine} h=${hash} -->`
  );
}

const MARKER_RE = /<!-- backlog-migrate v\d+ repo=(\S+) key=([0-9a-f]{12})\b/g;

/** Every migration key found in a text (an issue body or comment). */
function markerKeys(text) {
  const out = [];
  for (const m of String(text || '').matchAll(MARKER_RE)) {
    out.push(m[2]);
  }
  return out;
}

function permalink(repo, sha, startLine, endLine) {
  const base = `https://github.com/${OWNER}/${repo}/blob/${sha}/BACKLOG.md`;
  return startLine ? `${base}#L${startLine}-L${endLine}` : base;
}

/** Split into [segment, isCode] so rewrites never touch code spans/fences. */
function mapProse(text, fn) {
  const lines = text.split('\n');
  let fenced = false;
  return lines
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) {
        return line;
      }
      return line
        .split(/(`[^`]*`)/)
        .map((seg, i) => (i % 2 ? seg : fn(seg)))
        .join('');
    })
    .join('\n');
}

/**
 * Make relative links absolute at the source SHA, send in-file anchors to the
 * permalink, and defuse @-mentions so the migration notifies nobody.
 */
function rewriteLinks(text, { repo, sha, link }) {
  return mapProse(text, seg =>
    seg
      .replace(/\]\(([^)\s]+)\)/g, (m, target) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
          return m;
        } // http:, mailto:
        if (target.startsWith('#')) {
          return `](${link})`;
        }
        const [p, frag] = target.split('#');
        const resolved = path.posix.normalize(p.replace(/^\.\//, ''));
        if (resolved.startsWith('..')) {
          return m;
        } // escapes the repo root
        const url = `https://github.com/${OWNER}/${repo}/blob/${sha}/${resolved}`;
        return `](${url}${frag ? `#${frag}` : ''})`;
      })
      .replace(/(^|[^\w`/.-])@([A-Za-z0-9][\w-]*(?:\/[\w.-]+)?)/g, '$1`@$2`')
  );
}

function demoteHeadings(text) {
  let fenced = false;
  return text
    .split('\n')
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
      }
      if (fenced) {
        return line;
      }
      return /^#{1,5}\s/.test(line) ? `#${line}` : line;
    })
    .join('\n');
}

function capBody(body, link) {
  if (body.length <= BODY_CAP) {
    return body;
  }
  const head = body.slice(0, BODY_CAP);
  const cut = head.lastIndexOf('\n#');
  const kept = cut > BODY_CAP / 2 ? head.slice(0, cut) : head;
  return `${kept}\n\n… continued at ${link}`;
}

/**
 * The full issue body. `row` carries the classify output; `date` is injected
 * so the output is deterministic under test.
 */
function renderBody(row, { date }) {
  const { sourceRepo, sourceSha, startLine, endLine } = row;
  const link = permalink(sourceRepo, sourceSha, startLine, endLine);
  const text = demoteHeadings(
    rewriteLinks(row.text, { repo: sourceRepo, sha: sourceSha, link })
  );
  const pre = [];
  if (row.decisionPr) {
    pre.push(`Blocked on decision PR #${row.decisionPr} — merge = approve`, '');
  }
  if (row.deferredUntil) {
    pre.push(`Deferred until: ${row.deferredUntil}`, '');
  }
  const head = [
    marker({
      repo: sourceRepo,
      key: row.key,
      sha: sourceSha,
      startLine,
      endLine,
      hash: row.hash,
    }),
    ...pre,
    `> Migrated from [\`BACKLOG.md\` L${startLine}–${endLine} @ \`${sourceSha}\`](${link})`,
    `> (section "${row.sectionHeading}") on ${date}. Text below is the entry verbatim;`,
    '> only links were made absolute. New progress goes in comments.',
    '',
  ].join('\n');
  return capBody(`${head}\n${text}\n`, link);
}

function bodyHash(text) {
  return sha1(text).slice(0, 8);
}

const cell = s =>
  String(s === null || s === undefined || s === '' ? '—' : s)
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');

function renderTable(rows) {
  const out = [
    '| # | Lines | Section | P | Verdict | Target | Type | Area | Extra labels | Title (≤80) | Body chars | Refs | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  rows.forEach((r, i) => {
    const title = r.title.length > 80 ? `${r.title.slice(0, 79)}…` : r.title;
    out.push(
      `| ${[
        i + 1,
        `${r.startLine}–${r.endLine}`,
        r.sectionHeading,
        r.priority,
        r.linkTo && r.verdict !== 'already-migrated'
          ? `${r.verdict} #${r.linkTo}`
          : r.verdict,
        r.targetRepo,
        r.type,
        r.area,
        r.labels.join(' '),
        title,
        r.bodyChars,
        r.refs.map(x => `${x.repo}#${x.number}`).join(' '),
        r.notes.join('; '),
      ]
        .map(cell)
        .join(' | ')} |`
    );
  });
  return out.join('\n');
}

const VERDICT_ORDER = [
  'create',
  'link',
  'review',
  'device-test',
  'already-migrated',
  'skip-resolved',
  'skip-section',
];

function totals(rows) {
  const n = Object.fromEntries(VERDICT_ORDER.map(v => [v, 0]));
  for (const r of rows) {
    n[r.verdict] = (n[r.verdict] || 0) + 1;
  }
  return n;
}

function renderTotals(rows) {
  const n = totals(rows);
  return `Totals: ${VERDICT_ORDER.map(v => `${v} ${n[v]}`).join(' · ')}`;
}

// The line put on top of a retired WEEKLY_DIGEST.md (RFD 004 §4.6, Q2).
const DIGEST_RETIRED_RE = /^> \*\*Retired [^*]*\(RFD 004 §4\.6\):\*\*/m;

function digestPointer(date, url) {
  const where = url
    ? `the [roadmap Artifact](${url})`
    : 'the roadmap Artifact (its URL is `artifactUrl` in `.roadmap-pulse-state.json`, set by the next pulse run)';
  return `> **Retired ${date} (RFD 004 §4.6):** the digest is now ${where}. This file is no longer appended to; its history stays in git.\n`;
}

function pointerFile(repo, lastSha) {
  const q = encodeURIComponent(
    'is:issue is:open label:P0,P1,P2,P3 sort:created-asc'
  ).replace(/%20/g, '+');
  return (
    `Work items are GitHub issues: [open, by priority](https://github.com/${OWNER}/${repo}/issues?q=${q}) · ` +
    `this file's history: \`git log -p -- BACKLOG.md\` (last full version \`${lastSha}\`). <!-- backlog-retired -->\n`
  );
}

module.exports = {
  OWNER,
  BODY_CAP,
  stripMarkdown,
  normalizeTitle,
  entryKey,
  renderTitle,
  marker,
  markerKeys,
  permalink,
  rewriteLinks,
  demoteHeadings,
  renderBody,
  bodyHash,
  renderTable,
  renderTotals,
  totals,
  pointerFile,
  digestPointer,
  DIGEST_RETIRED_RE,
};
