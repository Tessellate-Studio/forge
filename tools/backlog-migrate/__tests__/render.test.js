const fs = require('fs');
const path = require('path');
const { parseBacklog } = require('../lib/parse');
const { classifyEntries } = require('../lib/classify');
const R = require('../lib/render');

describe('keys and titles', () => {
  test('the key ignores status suffixes and markdown, so a re-run after a status edit dedupes', () => {
    const a = R.entryKey(
      'alate',
      'Colour: decide whether the server sees the garment colour at all — NEW (2026-09-13)'
    );
    const b = R.entryKey(
      'alate',
      '**Colour**: decide whether the server sees the garment colour at all'
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(R.entryKey('loom', 'x')).not.toBe(R.entryKey('alate', 'x'));
    expect(
      R.normalizeTitle(
        'Size-range demand capture — alate#700 (SHIPPED 2026-09-16)'
      )
    ).toBe('size-range demand capture — alate#700');
  });

  test('rendered titles strip markdown, keep status, and cap at 256', () => {
    expect(R.renderTitle('`read_themes` widget check')).toBe(
      'read_themes widget check'
    );
    expect(R.renderTitle('Dark mode — palette decided (2026-09-07)')).toBe(
      'Dark mode — palette decided (2026-09-07)'
    );
    expect(R.renderTitle('x'.repeat(400))).toHaveLength(256);
  });

  test('markerKeys reads back every key in a body', () => {
    const m = R.marker({
      repo: 'loom',
      key: 'abcdefabcdef',
      sha: 'abc1234',
      startLine: 3,
      endLine: 9,
      hash: '12345678',
    });
    expect(m).toBe(
      '<!-- backlog-migrate v1 repo=loom key=abcdefabcdef src=abc1234:BACKLOG.md#L3-L9 h=12345678 -->'
    );
    expect(R.markerKeys(`hello\n${m}\n`)).toEqual(['abcdefabcdef']);
    expect(R.markerKeys(null)).toEqual([]);
  });
});

describe('body rendering', () => {
  const md = fs.readFileSync(
    path.join(__dirname, '..', '__fixtures__', 'alate.BACKLOG.md'),
    'utf8'
  );
  const rows = classifyEntries(parseBacklog(md), {
    repo: 'alate',
    sourceSha: '35a69e1',
  });
  const byLine = n => rows.find(r => r.startLine === n);

  test('starts with the marker and a permalink to the exact source lines', () => {
    const body = R.renderBody(byLine(77), { date: '2026-09-19' });
    const [first, , third] = body.split('\n');
    expect(first).toMatch(
      /^<!-- backlog-migrate v1 repo=alate key=[0-9a-f]{12} src=35a69e1:BACKLOG.md#L77-L162 h=[0-9a-f]{8} -->$/
    );
    expect(body).toContain(
      '(https://github.com/Tessellate-Studio/alate/blob/35a69e1/BACKLOG.md#L77-L162)'
    );
    expect(third).toMatch(
      /section "P0 — pre-App-Store launch"\) on 2026-09-19/
    );
  });

  test('relative links become absolute at the source SHA; http links are untouched', () => {
    const out = R.rewriteLinks(
      'see [brief](./docs/backlog/fit-graph.md#s2), [x](memory/a.md), [y](../outside.md), [z](https://e.com/a), [w](#p1)',
      { repo: 'alate', sha: '35a69e1', link: 'PERMA' }
    );
    expect(out).toBe(
      'see [brief](https://github.com/Tessellate-Studio/alate/blob/35a69e1/docs/backlog/fit-graph.md#s2), ' +
        '[x](https://github.com/Tessellate-Studio/alate/blob/35a69e1/memory/a.md), ' +
        '[y](../outside.md), [z](https://e.com/a), [w](PERMA)'
    );
  });

  test('@-mentions are defused outside code; emails and code are left alone', () => {
    const out = R.rewriteLinks(
      'ping @saptami and @Tessellate-Studio/core; mail a@b.co; `@sentry/nextjs`',
      { repo: 'r', sha: 's', link: 'L' }
    );
    expect(out).toBe(
      'ping `@saptami` and `@Tessellate-Studio/core`; mail a@b.co; `@sentry/nextjs`'
    );
  });

  test('headings are demoted one level, fenced code is not', () => {
    expect(R.demoteHeadings('### A\n```\n## not\n```\n#### B')).toBe(
      '#### A\n```\n## not\n```\n##### B'
    );
  });

  test('P4 entries carry a Deferred-until line; decision refs a blocked line', () => {
    const body = R.renderBody(byLine(1104), { date: 'd' });
    expect(body).toContain('Deferred until: demand validates');
    const withDecision = R.renderBody(
      { ...byLine(420), decisionPr: 926 },
      { date: 'd' }
    );
    expect(withDecision).toContain(
      'Blocked on decision PR #926 — merge = approve'
    );
  });

  test('bodies over the cap are cut at a heading with a continuation link', () => {
    const big = {
      ...byLine(77),
      text: `### A\n${'x'.repeat(40000)}\n### B\n${'y'.repeat(40000)}`,
    };
    const body = R.renderBody(big, { date: 'd' });
    expect(body.length).toBeLessThanOrEqual(R.BODY_CAP + 200);
    expect(body).toMatch(
      /… continued at https:\/\/github\.com\/Tessellate-Studio\/alate\/blob\/35a69e1\/BACKLOG\.md#L77-L162$/
    );
    expect(body).not.toContain('y'.repeat(10));
  });

  test('every real entry fits under the cap unchanged (largest measured ~8 KB)', () => {
    for (const r of rows) {
      expect(R.renderBody(r, { date: 'd' })).not.toMatch(/continued at/);
    }
  });
});

describe('table and pointer', () => {
  test('the table has one row per entry and a totals line', () => {
    const rows = classifyEntries(
      parseBacklog(
        fs.readFileSync(
          path.join(__dirname, '..', '__fixtures__', 'loom.BACKLOG.md'),
          'utf8'
        )
      ),
      { repo: 'loom', sourceSha: 'abc1234' }
    );
    const table = R.renderTable(rows).split('\n');
    expect(table).toHaveLength(rows.length + 2);
    expect(table[0]).toMatch(
      /^\| # \| Lines \| Section \| P \| Verdict \| Target \| Type \| Area \|/
    );
    expect(R.renderTotals(rows)).toBe(
      'Totals: create 9 · link 0 · review 0 · device-test 0 · already-migrated 0 · skip-resolved 1 · skip-section 6'
    );
  });

  test('pointer file is one line carrying the retired marker', () => {
    const p = R.pointerFile('loom', 'abc1234');
    expect(p.trim().split('\n')).toHaveLength(1);
    expect(p).toContain('<!-- backlog-retired -->');
    expect(p).toContain(
      'https://github.com/Tessellate-Studio/loom/issues?q=is%3Aissue+is%3Aopen+label%3AP0%2CP1%2CP2%2CP3+sort%3Acreated-asc'
    );
    expect(p).toContain('`abc1234`');
  });
});
