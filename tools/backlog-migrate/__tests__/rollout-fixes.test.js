// Two tool bugs found during the RFD 004 rollout (outcome in the RFD), fixed
// in step 6: an explicit `**Repo:**` line was ignored by target-repo
// inference, and dates were stamped in UTC instead of the owner's local day.

const fs = require('fs');
const path = require('path');
const { parseBacklog } = require('../lib/parse');
const { classifyEntries } = require('../lib/classify');
const { localDate } = require('../lib/commands');

const classify = (md, repo = 'alate') =>
  classifyEntries(parseBacklog(md), { repo, sourceSha: 'abc1234' });

const entry = body =>
  `# Backlog\n\n## P2\n\n### Redesign the opt-out pages\n${body}\n`;

describe('target repo from an explicit **Repo:** line', () => {
  test.each([
    ['**Repo:** `Tessellate-Studio/tessellate-pages`', 'tessellate-pages'],
    ['**Repo:** Tessellate-Studio/loom', 'loom'],
    ['**Repo:** litmus — the harness lives there', 'litmus'],
    ['**Repo**: `badige`', 'badige'],
  ])('%s → %s', (line, want) => {
    const [row] = classify(entry(`${line}\n\nSome description of the work.`));
    expect(row.targetRepo).toBe(want);
    expect(row.notes).toContain(`target inferred: ${want}`);
  });

  test('it outranks a "(x repo)" mention', () => {
    const [row] = classify(
      entry(
        '**Repo:** `Tessellate-Studio/tessellate-pages`\n\nFollows the (loom repo) pattern.'
      )
    );
    expect(row.targetRepo).toBe('tessellate-pages');
  });

  test('an unknown repo name is ignored, not guessed', () => {
    const [row] = classify(entry('**Repo:** someone-else/elsewhere\n\nText.'));
    expect(row.targetRepo).toBe('alate');
  });

  test('no Repo line → the source repo, as before', () => {
    const [row] = classify(entry('Plain description.'));
    expect(row.targetRepo).toBe('alate');
  });

  test('the alate fixture entry that motivated it now targets tessellate-pages', () => {
    const md = fs.readFileSync(
      path.join(__dirname, '..', '__fixtures__', 'alate.BACKLOG.md'),
      'utf8'
    );
    const rows = classify(md);
    const r = rows.find(x =>
      /v2 themed redesign of the privacy/i.test(x.title)
    );
    expect(r).toBeDefined();
    expect(r.targetRepo).toBe('tessellate-pages');
  });
});

describe('dates are the local calendar day, not UTC', () => {
  test('formats a local date as YYYY-MM-DD', () => {
    // Constructed in local time, so this holds in every TZ: 00:30 on the
    // 20th locally is the 20th, even where toISOString() would say the 19th.
    expect(localDate(new Date(2026, 8, 20, 0, 30))).toBe('2026-09-20');
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  test('defaults to now', () => {
    expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    expect(localDate()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
    );
  });

  test('no UTC date stamping is left in the tool', () => {
    for (const f of [
      'cli.js',
      'lib/commands.js',
      'lib/render.js',
      'lib/ledger.js',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect(src).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
    }
  });
});
