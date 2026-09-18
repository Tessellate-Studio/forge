// Parser tests over REAL BACKLOG.md snapshots (see __fixtures__/manifest.json).
// The three "measured parser hazards" from RFD 004 → Background are pinned
// here by line number, so a heuristic change that re-breaks one goes red.

const fs = require('fs');
const path = require('path');
const { parseBacklog } = require('../lib/parse');

const fixture = name =>
  fs.readFileSync(
    path.join(__dirname, '..', '__fixtures__', `${name}.BACKLOG.md`),
    'utf8'
  );

const parsed = {};
for (const repo of ['alate', 'badige', 'loom', 'mood-layer']) {
  parsed[repo] = parseBacklog(fixture(repo));
}
const byLine = (repo, line) =>
  parsed[repo].entries.find(e => e.startLine === line);
const titles = repo => parsed[repo].entries.map(e => e.title);

describe('section detection', () => {
  test('maps P0–P3 headings, P4 → P3 with a deferral, Post-launch → P2', () => {
    const alateP4 = parsed.alate.sections.find(s => s.rawPriority === 'P4');
    expect(alateP4.priority).toBe('P3');
    expect(alateP4.deferredUntil).toBe('demand validates');
    const post = parsed['mood-layer'].sections.find(s =>
      /Post-launch/.test(s.heading)
    );
    expect(post.priority).toBe('P2');
    expect(post.kind).toBe('priority');
  });

  test("loom's `P1 — needs the user` is P1 + needs-input and has no entries", () => {
    const s = parsed.loom.sections.find(x => /needs the user/.test(x.heading));
    expect(s.priority).toBe('P1');
    expect(s.needsInput).toBe(true);
    expect(parsed.loom.entries.filter(e => e.section === s)).toHaveLength(0);
  });

  test('Done / Done / retired / Dismissed sections are skip sections', () => {
    const kinds = repo =>
      parsed[repo].sections.filter(s => s.kind === 'skip').map(s => s.heading);
    expect(kinds('loom')).toEqual(['Done']);
    expect(kinds('mood-layer')).toEqual(['Done / retired']);
    expect(kinds('alate')).toEqual(['Dismissed / out of scope']);
  });

  test('heading-as-entry style is detected for badige only', () => {
    expect(parsed.badige.style).toBe('heading');
    for (const r of ['alate', 'loom', 'mood-layer']) {
      expect(parsed[r].style).toBe('section');
    }
  });
});

describe('measured hazard 1 — alate P4 niche-fit sub-sections are body', () => {
  test('the six known sub-sections never become entries', () => {
    const subs = [
      'Data model',
      'Submission flow',
      'Browse flow',
      'Promotion criteria',
      'What to do now',
      'Anti-pattern compliance',
    ];
    for (const s of subs) {
      expect(titles('alate').some(t => t.startsWith(s))).toBe(false);
    }
    const niche = byLine('alate', 1104);
    expect(niche.title).toMatch(/^Niche-fit BRAND collection/);
    expect(niche.endLine).toBeGreaterThan(1186);
    expect(niche.text).toContain('### Data model');
  });

  test('P4 holds exactly three entries', () => {
    const p4 = parsed.alate.entries.filter(e => e.section.rawPriority === 'P4');
    expect(p4.map(e => e.startLine)).toEqual([1104, 1195, 1224]);
  });
});

describe('measured hazard 2 — alate "Restock alerts: push ALONGSIDE email"', () => {
  test('is its own list entry, not swallowed by the entry before it', () => {
    const restock = byLine('alate', 337);
    expect(restock).toBeDefined();
    expect(restock.kind).toBe('list');
    expect(restock.title).toBe(
      "Restock alerts: push ALONGSIDE email — decision + what's left"
    );
    const before = byLine('alate', 304);
    expect(before.endLine).toBeLessThan(337);
    expect(restock.endLine).toBe(371);
  });

  test('col-0 lists that follow a lead-in line or sit inside a block stay body', () => {
    // "**Still open on this front:**" + "- ~~**Trial-credit…" (no blank line)
    expect(byLine('alate', 512)).toBeUndefined();

    // "**Use cases the plugin unlocks …:**" + blank + "- **Brand-defined…"
    expect(byLine('alate', 1031)).toBeUndefined();
    expect(byLine('alate', 1001)).toBeUndefined();
    expect(byLine('alate', 1238)).toBeUndefined();
  });
});

describe('measured hazard 3 — loom read_themes stays one open entry', () => {
  test('is parsed as a P2 list entry carrying its Remaining line', () => {
    const e = byLine('loom', 30);
    expect(e.title).toBe('`read_themes` widget check');
    expect(e.section.priority).toBe('P2');
    expect(e.text).toMatch(/Remaining: the two user steps/);
  });
});

describe('entry boundaries per repo', () => {
  test('alate P0: three leading tombstones, then two ### entries', () => {
    const p0 = parsed.alate.entries.filter(e => e.section.rawPriority === 'P0');
    expect(p0.map(e => [e.startLine, e.kind])).toEqual([
      [41, 'tombstone'],
      [49, 'tombstone'],
      [58, 'tombstone'],
      [77, 'h3'],
      [164, 'h3'],
    ]);

    // The RFD example row says 77–163; line 163 is the blank before the next
    // heading, which the parser trims so the permalink ends on content.
    expect(byLine('alate', 77).endLine).toBe(162);
  });

  test('alate Supabase advisors spans 468–562 (RFD row 2, trailing blank trimmed)', () => {
    const e = byLine('alate', 468);
    expect(e.endLine).toBe(562);
    expect(e.tombstones).toBeGreaterThan(0);
  });

  test('badige: every ## heading is one entry; its ### are body', () => {
    const lines = parsed.badige.entries.map(e => e.startLine);
    expect(lines).toEqual([
      5, 77, 110, 161, 236, 352, 403, 410, 449, 540, 580, 607,
    ]);
    expect(byLine('badige', 5).text).toContain('### Rejected alternatives');
  });

  test('loom: 7 P2 + 3 P3 list entries + 6 Done entries', () => {
    const count = p =>
      parsed.loom.entries.filter(e => e.section.priority === p).length;
    expect(count('P2')).toBe(7);
    expect(count('P3')).toBe(3);
    expect(
      parsed.loom.entries.filter(e => e.section.kind === 'skip')
    ).toHaveLength(6);
  });

  test('mood-layer: list entries separated by blank lines', () => {
    const lines = parsed['mood-layer'].entries.map(e => e.startLine);
    expect(lines).toEqual([
      15, 22, 43, 92, 107, 118, 134, 161, 169, 192, 205, 218, 227, 239, 249,
      261,
    ]);
    expect(byLine('mood-layer', 15).endLine).toBe(20);
  });

  test('headings inside fenced code blocks are ignored', () => {
    const md = [
      '## P1 — do next',
      '',
      '### Real entry',
      '```sh',
      '### not a heading',
      '## P2 — not a section',
      '```',
      'tail',
    ].join('\n');
    const p = parseBacklog(md);
    expect(p.sections).toHaveLength(1);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0].endLine).toBe(8);
  });
});

describe('split suggestions', () => {
  test('alate cross-brand suggests its stages; badige numbered flows are recorded', () => {
    expect(byLine('alate', 77).suggestSplit).toEqual(
      expect.arrayContaining(['Stage 2', 'Stage 3'])
    );
    expect(byLine('badige', 410).suggestSplit).toEqual([
      '1. Inline property creation from Invite Tenant (USER_PATHS **L5a**)',
      '2. Tenant invitation-code acceptance (USER_PATHS **T9** / **E11**)',
    ]);
  });
});
