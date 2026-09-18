// Classification over the real snapshots. The per-repo open counts are the
// RFD 004 "Measured starting point" table; the four `review` rows are its
// "needs a human call" cases; area inference follows the 2026-09-19 owner
// amendment to Q6 (loom + alate only, confident matches only).

const fs = require('fs');
const path = require('path');
const { parseBacklog } = require('../lib/parse');
const {
  classifyEntries,
  inferArea,
  inferType,
  extractRefs,
  AREA_SETS,
} = require('../lib/classify');

const load = repo =>
  parseBacklog(
    fs.readFileSync(
      path.join(__dirname, '..', '__fixtures__', `${repo}.BACKLOG.md`),
      'utf8'
    )
  );
const rowsFor = (repo, remote) =>
  classifyEntries(load(repo), { repo, sourceSha: 'abc1234', remote });

const OPEN = new Set(['create', 'link', 'device-test']);
function tally(rows) {
  const t = { open: {}, verdicts: {} };
  for (const r of rows) {
    t.verdicts[r.verdict] = (t.verdicts[r.verdict] || 0) + 1;
    if (OPEN.has(r.verdict)) {
      t.open[r.rawPriority] = (t.open[r.rawPriority] || 0) + 1;
    }
  }
  t.openTotal = Object.values(t.open).reduce((a, b) => a + b, 0);
  return t;
}
const row = (rows, line) => rows.find(r => r.startLine === line);

describe('RFD 004 measured counts', () => {
  test('alate: 32 open (P0 2 · P1 18 · P2 5 · P3 4 · P4 3), 4 resolved, 1 review', () => {
    const t = tally(rowsFor('alate'));
    expect(t.open).toEqual({ P0: 2, P1: 18, P2: 5, P3: 4, P4: 3 });
    expect(t.openTotal).toBe(32);
    expect(t.verdicts['skip-resolved']).toBe(4);
    expect(t.verdicts.review).toBe(1);
  });

  test('badige: 9 open (P0 1 · P1 4 · P2 3 · P3 1), 3 resolved, 0 review', () => {
    const t = tally(rowsFor('badige'));
    expect(t.open).toEqual({ P0: 1, P1: 4, P2: 3, P3: 1 });
    expect(t.verdicts['skip-resolved']).toBe(3);
    expect(t.verdicts.review).toBeUndefined();
  });

  test('loom: 9 open (P2 7 · P3 2), 1 resolved + 6 in Done', () => {
    const t = tally(rowsFor('loom'));
    expect(t.open).toEqual({ P2: 7, P3: 2 });
    expect(t.verdicts['skip-resolved']).toBe(1);
    expect(t.verdicts['skip-section']).toBe(6);
    expect(t.verdicts.review).toBeUndefined();
  });

  test('mood-layer: 9 open (P1 3 · P2 1 · Post-launch 1 · P3 4), 3 resolved + 1 Done, 3 review', () => {
    const t = tally(rowsFor('mood-layer'));
    expect(t.open).toEqual({ P1: 3, P2: 1, 'Post-launch': 1, P3: 4 });
    expect(t.verdicts['skip-resolved']).toBe(3);
    expect(t.verdicts['skip-section']).toBe(1);
    expect(t.verdicts.review).toBe(3);
  });
});

describe('the four resolved-with-residual cases become review (Q3)', () => {
  test.each([
    ['mood-layer', 15, /Circle: scheduled-share reminders/],
    ['mood-layer', 22, /Circle: true auto-deliver/],
    ['mood-layer', 43, /Hold-to-learn/],
    ['alate', 468, /Supabase security advisors/],
  ])('%s L%d', (repo, line, title) => {
    const r = row(rowsFor(repo), line);
    expect(r.title).toMatch(title);
    expect(r.verdict).toBe('review');
    expect(r.notes.join(' ')).toMatch(/resolved \+ residual/);
  });
});

describe('status-word hazard', () => {
  test('loom "code half DONE" is not a resolved marker', () => {
    const r = row(rowsFor('loom'), 30);
    expect(r.verdict).toBe('create');
  });

  test('a SHIPPED heading with no residual is skip-resolved (alate size-range)', () => {
    expect(row(rowsFor('alate'), 774).verdict).toBe('skip-resolved');
  });
});

describe('routing and inferred fields', () => {
  test('manual device checks route to device-test', () => {
    expect(row(rowsFor('badige'), 410).verdict).toBe('device-test');
    expect(row(rowsFor('mood-layer'), 192).verdict).toBe('device-test');
  });

  test('P4 → P3 with a Deferred until line (Q1)', () => {
    const r = row(rowsFor('alate'), 1104);
    expect(r.priority).toBe('P3');
    expect(r.deferredUntil).toBe('demand validates');
  });

  test("loom's alate-repo entry targets alate (Q5)", () => {
    const r = row(rowsFor('loom'), 41);
    expect(r.targetRepo).toBe('alate');
    expect(row(rowsFor('loom'), 38).targetRepo).toBe('loom');
  });

  test('needs-input from "Blocking on the user"', () => {
    expect(row(rowsFor('mood-layer'), 118).labels).toContain('needs-input');
  });

  test('type inference is conservative', () => {
    expect(
      inferType('`fast-xml-parser` advisory (CVE-2026-41650), pinned')
    ).toBe('chore');
    expect(inferType('Retire `HeadingImage` component')).toBe('refactor');
    expect(inferType('`reminderService.ts` is broken')).toBe('bug');
    expect(inferType('Dark mode — palette decided')).toBe('feature');

    // Both a bug and a chore signal → no guess, left to triage.
    expect(inferType('CI runner crash')).toBeNull();
  });
});

describe('area inference — owner amendment to Q6 (2026-09-19)', () => {
  test('area sets exist only for loom and alate', () => {
    expect(Object.keys(AREA_SETS).sort()).toEqual(['alate', 'loom']);
    expect(AREA_SETS.alate).toEqual([
      'mobile',
      'backend',
      'scraper',
      'fit-engine',
      'infra',
    ]);
    expect(AREA_SETS.loom).toEqual([
      'admin-ui',
      'api',
      'sdk',
      'extension',
      'supabase',
      'infra',
    ]);
  });

  test('mood-layer and badige never get an area, whatever the text says', () => {
    for (const repo of ['mood-layer', 'badige']) {
      for (const r of rowsFor(repo)) {
        expect(r.area).toBeNull();
      }
    }
    expect(
      inferArea('mood-layer', 'Fix the CI runner', '`.github/x.yml`')
    ).toBeNull();
  });

  test('confident title / path matches set an area in loom and alate', () => {
    const loom = rowsFor('loom');
    expect(row(loom, 38).area).toBe('admin-ui'); // Instrument `admin/` with Sentry
    expect(row(loom, 48).area).toBe('infra'); // Tighten CI timeout-minutes
    expect(row(loom, 41).area).toBe('backend'); // targets alate → alate's set
    const alate = rowsFor('alate');
    expect(row(alate, 373).area).toBe('infra'); // Self-hosted runners …
    expect(row(alate, 878).area).toBe('mobile'); // Dark mode
  });

  test('no confident match → area left empty', () => {
    const loom = rowsFor('loom');
    expect(row(loom, 30).area).toBeNull(); // read_themes: one api/ path only
    expect(row(loom, 63).area).toBeNull(); // Webhook dead-letter persistence
    // Two areas named in one title is a tie, not a guess.
    expect(inferArea('loom', 'Move the admin UI onto the SDK', '')).toBeNull();

    // Body paths need ≥2 mentions and a 75% majority.
    expect(
      inferArea('alate', 'Tidy things', '`mobile/a.ts` `backend/b.ts`')
    ).toBeNull();
    expect(
      inferArea('alate', 'Tidy things', '`mobile/a.ts` and `mobile/src/b.tsx`')
    ).toBe('mobile');
  });
});

describe('references, links and decision PRs', () => {
  test('extractRefs finds bare, cross-repo and URL refs but not log rows', () => {
    const refs = extractRefs(
      'PR #232, loom#93, regression log #74, AP#21, ' +
        'https://github.com/Tessellate-Studio/litmus/issues/37',
      'alate'
    );
    expect(refs).toEqual([
      { repo: 'alate', number: 232 },
      { repo: 'loom', number: 93 },
      { repo: 'litmus', number: 37 },
    ]);
  });

  const remote = {
    alate: {
      issues: [
        {
          number: 825,
          title: 'Push when a background scrape is ready',
          state: 'OPEN',
          body: '',
        },
        { number: 900, title: 'Unrelated thing', state: 'OPEN', body: '' },
      ],
      prs: [
        {
          number: 926,
          title: 'decision: colour',
          state: 'OPEN',
          labels: [{ name: 'decision' }],
        },
      ],
    },
  };

  test('an entry naming an open issue as its own → link', () => {
    const r = row(rowsFor('alate', remote), 671);
    expect(r.verdict).toBe('link');
    expect(r.linkTo).toBe(825);
  });

  test('an open decision PR ref → create + needs-input + blocked line', () => {
    const md = [
      '## P1 — do next',
      '',
      '### Colour: decide whether the server sees the garment colour',
      'Decision PR alate#926 is open.',
    ].join('\n');
    const [r] = classifyEntries(parseBacklog(md), {
      repo: 'alate',
      sourceSha: 'abc1234',
      remote,
    });
    expect(r.verdict).toBe('create');
    expect(r.decisionPr).toBe(926);
    expect(r.labels).toContain('needs-input');
  });

  test('a similar open issue title → review, never a silent duplicate', () => {
    const md = '## P2\n\n- **Push when a background scrape is ready** — x\n';
    const [r] = classifyEntries(parseBacklog(md), {
      repo: 'alate',
      sourceSha: 'abc1234',
      remote,
    });
    expect(r.verdict).toBe('review');
    expect(r.notes.join(' ')).toMatch(/#825/);
  });

  test('a key already in an issue marker → already-migrated', () => {
    const rows = rowsFor('loom');
    const target = row(rows, 38);
    const r2 = rowsFor('loom', {
      loom: {
        issues: [
          {
            number: 5,
            title: 'x',
            state: 'OPEN',
            body: `<!-- backlog-migrate v1 repo=loom key=${target.key} src=a:BACKLOG.md#L1-L2 h=1 -->`,
          },
        ],
        prs: [],
      },
    });
    expect(row(r2, 38).verdict).toBe('already-migrated');
    expect(row(r2, 38).linkTo).toBe(5);
  });
});

describe('open decision PRs matched by title (RFD 004 §5.3 examples)', () => {
  // The open `decision` PRs on 2026-09-19. None is cited by number in the
  // pinned BACKLOG text, so only the title match can find them.
  const decision = (number, title) => ({
    number,
    title,
    state: 'OPEN',
    labels: [{ name: 'decision' }],
  });
  const remote = {
    alate: {
      issues: [],
      prs: [
        decision(
          926,
          'decision: ADR 011: Does the server read the garment colour, or does the phone keep it?'
        ),
        decision(
          925,
          'decision: ADR 007 (deferred half): hold puppeteer-core 25 / @sparticuz/chromium 149'
        ),
        decision(
          924,
          'decision: Pitch 003: Post-purchase "did it fit?" feedback loop'
        ),
        decision(
          923,
          "decision: RFD 003: The recommendation speaks the brand's size vocabulary"
        ),
        decision(
          922,
          'decision: Pitch 007: Cradle tab bar (raised active tab in a notched bar)'
        ),
      ],
    },
    badige: {
      issues: [],
      prs: [
        decision(
          85,
          'decision: biometric login — ship the Settings toggle or remove the dormant path'
        ),
        decision(
          84,
          'decision: reconcile Kotlin with Detox — bump Kotlin, pin Detox, or defer'
        ),
        decision(
          83,
          'decision: fate of the notification / reminder subsystem — finish it or remove it'
        ),
      ],
    },
    loom: {
      issues: [],
      prs: [
        decision(
          164,
          'decision: collection-scoped size charts — build a picker or drop the scope'
        ),
      ],
    },
  };

  test.each([
    ['badige', 352, 83],
    ['alate', 420, 926],
    ['alate', 247, 924],
    ['loom', 25, 164],
  ])('%s L%d waits on #%d → create + needs-input', (repo, line, pr) => {
    const r = row(rowsFor(repo, remote), line);
    expect(r.verdict).toBe('create');
    expect(r.decisionPr).toBe(pr);
    expect(r.labels).toContain('needs-input');
  });

  test('no other entry is tied to a decision PR', () => {
    const tied = ['alate', 'badige', 'loom'].flatMap(repo =>
      rowsFor(repo, remote)
        .filter(r => r.decisionPr)
        .map(r => `${repo}:${r.startLine}`)
    );
    expect(tied.sort()).toEqual([
      'alate:247',
      'alate:420',
      'badige:352',
      'loom:25',
    ]);
  });
});

describe('overrides', () => {
  test('change verdict/priority/labels by key; mergeInto glues an entry back', () => {
    const base = rowsFor('loom');
    const a = row(base, 45);
    const b = row(base, 48);
    const rows = classifyEntries(load('loom'), {
      repo: 'loom',
      sourceSha: 'abc1234',
      overrides: {
        [a.key]: { priority: 'P1', labels: ['infra'] },
        [b.key]: { mergeInto: a.key },
      },
    });
    const merged = row(rows, 45);
    expect(merged.priority).toBe('P1');
    expect(merged.labels).toContain('infra');
    expect(merged.endLine).toBe(49);
    expect(row(rows, 48)).toBeUndefined();
  });

  test('an override naming an unknown key fails loudly', () => {
    expect(() =>
      classifyEntries(load('loom'), {
        repo: 'loom',
        sourceSha: 'abc1234',
        overrides: { deadbeefcafe: { verdict: 'create' } },
      })
    ).toThrow(/unknown key/);
  });
});
