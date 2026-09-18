// Parse a BACKLOG.md into sections and entries (RFD 004 §5.1).
//
// Pure: text in, structure out. Line numbers are 1-based and inclusive, so
// they drop straight into a `BACKLOG.md#L<a>-L<b>` permalink.
//
// The four repos use three different entry shapes, and the precedence below
// is what reconciles them. Each rule exists because a naive pass got one
// real file wrong — the fixture tests pin every case by line number:
//
//   1. heading style (badige): every `## P<n> — title` IS an entry, and its
//      `###` / `####` are body.
//   2. `###` style (alate): each `###` is an entry. A column-0 `- **Title**`
//      after a blank line also starts one, unless it is part of a list block
//      or follows a lead-in line ending in ":" — alate's "Restock alerts" is
//      the first kind, its "Use cases the plugin unlocks:" list the second.
//   3. list style (loom, mood-layer): each column-0 `- **…**` / `- ~~…` item.
//   4. a column-0 `~~…` paragraph before a section's first real entry is a
//      tombstone entry (alate P0). After an entry it is that entry's body.
//   5. a `###` whose title is a known sub-section name never starts an entry
//      once the current entry's body has begun (alate's niche-fit P4 entry).

const KNOWN_SUBSECTION =
  /^(Data model|Submission flow|Browse flow|Promotion criteria|What to do now|Anti-pattern compliance|Progress|What was fixed|Reconciled|Follow-ups|Rejected alternatives|Where this was left|The order|Shared blocker|Yes —)/i;

const SKIP_SECTION = /^(done|dismissed|retired|archive)\b/i;
const POST_LAUNCH = /^post-launch\b/i;
const P_HEADING = /^(~~)?P([0-4])(~~)?(?=\s|$|—|-)/;

const FENCE = /^\s*(```|~~~)/;
const LIST_ENTRY_ANY = /^- (\*\*|~~)/; // list style: bold or struck item
const LIST_ENTRY_BOLD = /^- (~~)?\*\*/; // ### style: bold (maybe struck) item
const LISTISH = /^\s*([-*+]|\d+\.)\s|^\s{2,}\S|^\|/;
const LEAD_IN = /:\s*(\*{1,2}|_{1,2})?\s*$/;

function fenceMap(lines) {
  const inFence = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence[i] = true;
      open = !open;
      continue;
    }
    inFence[i] = open;
  }
  return inFence;
}

function classifySection(heading) {
  const m = heading.match(P_HEADING);
  if (m) {
    const raw = `P${m[2]}`;
    const section = {
      kind: 'priority',
      rawPriority: raw,
      priority: raw === 'P4' ? 'P3' : raw,
      struckPriority: Boolean(m[1] && m[3]),
      needsInput: /needs the user|needs input/i.test(heading),
    };
    if (raw === 'P4') {
      const d = heading.match(/deferred until ([^)]+)\)?/i);
      section.deferredUntil = d
        ? d[1].trim()
        : heading
            .replace(P_HEADING, '')
            .replace(/^\s*—\s*/, '')
            .trim();
    }
    return section;
  }
  if (POST_LAUNCH.test(heading)) {
    return { kind: 'priority', rawPriority: 'Post-launch', priority: 'P2' };
  }
  if (SKIP_SECTION.test(heading)) {
    return { kind: 'skip' };
  }
  return { kind: 'unknown' };
}

/** badige writes one `## P1 — title` per entry, so a priority repeats. The
 *  section-style repos never repeat one; that is the whole signal. */
function detectStyle(sections) {
  const seen = new Map();
  for (const s of sections) {
    if (s.kind !== 'priority' || !/^P\d$/.test(s.rawPriority)) {
      continue;
    }
    seen.set(s.rawPriority, (seen.get(s.rawPriority) || 0) + 1);
  }
  return [...seen.values()].some(n => n > 1) ? 'heading' : 'section';
}

function textBetween(text, open, close) {
  const a = text.indexOf(open);
  if (a < 0) {
    return null;
  }
  const b = text.indexOf(close, a + open.length);
  if (b < 0) {
    return null;
  }
  return text.slice(a + open.length, b);
}

function listTitle(firstLines) {
  const joined = firstLines
    .map(l => l.trim())
    .join(' ')
    .replace(/^- /, '');
  if (joined.startsWith('~~**')) {
    return { title: textBetween(joined, '~~**', '**~~'), struck: true };
  }
  if (joined.startsWith('~~')) {
    return { title: textBetween(joined, '~~', '~~'), struck: true };
  }
  return { title: textBetween(joined, '**', '**'), struck: false };
}

function suggestSplits(entry, lines, inFence) {
  const out = [];
  for (let i = entry.startLine; i < entry.endLine; i++) {
    if (inFence[i]) {
      continue;
    }
    const h4 = lines[i].match(/^####\s+(.*)$/);
    if (h4 && /^((stage|phase)\s*\d|\d+\.)/i.test(h4[1])) {
      out.push(h4[1]);
    }
    const h3 = lines[i].match(/^###\s+(\d+\.\s.*)$/);
    if (h3 && entry.kind === 'heading') {
      out.push(h3[1]);
    }
  }
  if (out.length) {
    return out;
  }
  const stages = new Set(
    (entry.text.match(/\b(Stage|Phase) \d\b/g) || []).map(s => s)
  );
  return stages.size >= 2 ? [...stages].sort() : [];
}

function parseBacklog(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const inFence = fenceMap(lines);
  const blank = i => i < 0 || lines[i].trim() === '';

  // Pass 1: `## ` headings delimit sections.
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) {
      continue;
    }
    const m = lines[i].match(/^##\s+(.*)$/);
    if (m) {
      heads.push({ index: i, heading: m[1].trim() });
    }
  }
  const sections = heads.map((h, n) => ({
    heading: h.heading,
    startLine: h.index + 1,
    endLine: n + 1 < heads.length ? heads[n + 1].index : lines.length,
    ...classifySection(h.heading),
  }));
  const style = detectStyle(sections);

  const entries = [];
  const push = (section, kind, i) => {
    const e = { section, kind, startLine: i + 1, endLine: null, tombstones: 0 };
    entries.push(e);
    return e;
  };

  for (const section of sections) {
    const first = section.startLine; // 0-based index of the first body line
    const last = section.endLine - 1; // 0-based index of the last line

    // Rule 1: the heading is the entry. A struck `## ~~P0~~ RESOLVED …` is an
    // entry in any style — there is no section it could be the heading of.
    if (
      section.kind === 'priority' &&
      (style === 'heading' || section.struckPriority)
    ) {
      push(section, 'heading', section.startLine - 1);
      continue;
    }

    let hasH3 = false;
    for (let i = first; i <= last; i++) {
      if (!inFence[i] && /^###\s/.test(lines[i])) {
        hasH3 = true;
      }
    }

    let cur = null;
    let bodyStarted = false;
    const start = (kind, i) => {
      cur = push(section, kind, i);
      bodyStarted = false;
    };

    // In a `###` section a bold item is an entry only when it is not the
    // continuation of a list or of a "…:" lead-in — see rule 2 above.
    const listStartOk = i => {
      if (!cur || cur.kind === 'list') {
        return true;
      }
      let p = i - 1;
      while (p >= first && blank(p)) {
        p--;
      }
      if (p < first) {
        return true;
      }
      return !LISTISH.test(lines[p]) && !LEAD_IN.test(lines[p]);
    };
    for (let i = first; i <= last; i++) {
      const line = lines[i];
      if (inFence[i]) {
        bodyStarted = true;
        continue;
      }
      const h3 = line.match(/^###\s+(.*)$/);
      if (h3) {
        if (cur && bodyStarted && KNOWN_SUBSECTION.test(h3[1].trim())) {
          continue;
        }
        start('h3', i);
        continue;
      }
      if (line.startsWith('~~') && blank(i - 1)) {
        if (!cur || cur.kind === 'tombstone') {
          start('tombstone', i);
          continue;
        }
        cur.tombstones++;
      }
      if (hasH3) {
        if (LIST_ENTRY_BOLD.test(line) && blank(i - 1) && listStartOk(i)) {
          start('list', i);
          continue;
        }
      } else if (LIST_ENTRY_ANY.test(line)) {
        start('list', i);
        continue;
      }
      if (cur && line.trim()) {
        bodyStarted = true;
      }
    }
  }

  // Close each entry at the next entry or its section's end, then trim
  // trailing blank lines and `---` rules.
  entries.forEach((e, n) => {
    const next = entries[n + 1];
    let end =
      next && next.section === e.section
        ? next.startLine - 1
        : e.section.endLine;
    while (end > e.startLine && /^\s*(---+)?\s*$/.test(lines[end - 1])) {
      end--;
    }
    e.endLine = end;
    e.text = lines.slice(e.startLine - 1, e.endLine).join('\n');
    e.firstLine = lines[e.startLine - 1];

    if (e.kind === 'h3' || e.kind === 'heading') {
      const heading = e.firstLine.replace(/^#+\s+/, '').trim();
      e.statusLine = heading;
      e.title =
        e.kind === 'heading'
          ? heading
              .replace(/^P[0-4]\s*—\s*/, '')
              .replace(/^~~(P[0-4])~~\s*/, '')
          : heading;
      e.struck = /^~~/.test(heading);
    } else {
      const head = lines.slice(e.startLine - 1, e.startLine + 4);
      const t =
        e.kind === 'tombstone'
          ? {
              title: textBetween(head.map(l => l.trim()).join(' '), '~~', '~~'),
              struck: true,
            }
          : listTitle(head);
      e.title = (t.title || e.firstLine.replace(/^- /, '')).trim();
      e.struck = t.struck;
      e.statusLine = e.firstLine;
    }
    e.suggestSplit = suggestSplits(e, lines, inFence);
  });

  return { lines, sections, style, entries };
}

module.exports = { parseBacklog, KNOWN_SUBSECTION, classifySection };
