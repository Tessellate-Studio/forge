const { STATUS, parseComment, expectedGlyph } = require('../scripts/queue-lib');

// Every comment the parser sees was typed by a different session on a
// different day. These fixtures are real shapes taken off alate#562 and
// mood-layer#66, not invented ones.
const comment = (body, overrides = {}) => ({
  id: 5462960191,
  html_url:
    'https://github.com/Tessellate-Studio/alate/issues/562#issuecomment-5462960191',
  created_at: '2026-09-01T09:00:00Z',
  body,
  ...overrides,
});

const ITEM_FIELDS = [
  '- **PR:** #80 · **SHA:** 67f61ce',
  '- **Delivery:** Expo Go',
  '- **Needs runtime:** any',
  '- **Steps:**',
  '  1. Open the app',
  '- **Expect:** the sheet closes cleanly',
].join('\n');

describe('heading — status glyph + test ID', () => {
  it('reads the glyph, the test ID and the intent out of the heading', () => {
    const item = parseComment(
      comment(
        [
          '### 🤖 5462960191 — Sheet drag-dismiss no longer crashes',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item.glyph).toBe('🤖');
    expect(item.testId).toBe('5462960191');
    expect(item.title).toBe('Sheet drag-dismiss no longer crashes');
    expect(item.state).toBe(STATUS.OPEN);
    expect(item.headingDrift).toBe(false);
  });

  it('still parses a legacy heading with no glyph and no ID, and flags the drift', () => {
    const item = parseComment(
      comment(
        [
          '### Sheet drag-dismiss no longer crashes',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item.title).toBe('Sheet drag-dismiss no longer crashes');
    expect(item.testId).toBeNull();
    expect(item.glyph).toBeNull();
    expect(item.state).toBe(STATUS.OPEN);

    // Drift is a stamp-me marker for the drain, never a reason to drop the
    // item — an invisible item is the failure this parser exists to prevent.
    expect(item.headingDrift).toBe(true);
  });

  it('flags a heading whose glyph contradicts the Status line', () => {
    const item = parseComment(
      comment(
        [
          '### ⚪ 5462960191 — Sheet drag-dismiss no longer crashes',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item.state).toBe(STATUS.OPEN);
    expect(item.headingDrift).toBe(true);
  });

  it('flags a test ID that is not this comment’s id', () => {
    const item = parseComment(
      comment(
        [
          '### 🤖 9999999999 — Sheet drag-dismiss no longer crashes',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item.testId).toBe('9999999999');
    expect(item.headingDrift).toBe(true);
  });

  it('does not mistake a date or a small number for a test ID', () => {
    // A looser rule read "2026" as the id and left the title as
    // "09-02 — drain results" — which the restamp would then write back as
    // the item's intent, quietly rewriting what the test is for.
    const dated = parseComment(
      comment(
        [
          '### 2026-09-02 — drain results',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(dated.testId).toBeNull();
    expect(dated.title).toBe('2026-09-02 — drain results');

    const numbered = parseComment(
      comment(
        ['### 3 - retest the sheet', ITEM_FIELDS, '- **Status:** OPEN'].join(
          '\n'
        )
      )
    );
    expect(numbered.testId).toBeNull();
    expect(numbered.title).toBe('3 - retest the sheet');
  });

  it('maps every state to its glyph, splitting OPEN by who is needed', () => {
    expect(expectedGlyph({ state: STATUS.OPEN, needsHuman: false })).toBe('🤖');
    expect(expectedGlyph({ state: STATUS.OPEN, needsHuman: true })).toBe('🙋');
    expect(expectedGlyph({ state: STATUS.NEEDS_BUILD })).toBe('🔧');
    expect(expectedGlyph({ state: STATUS.DONE })).toBe('⚪');
    expect(expectedGlyph({ state: STATUS.FAILED })).toBe('🔴');
  });

  it('an agent-runnable item is an ITEM, not a bot notice', () => {
    // 🤖 used to be in NOTICE_MARKER. Now it is an item glyph — if the notice
    // check still swallowed it, every agent-runnable item would silently
    // vanish from the board.
    const item = parseComment(
      comment(
        [
          '### 🤖 5462960191 — Something',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item).not.toBeNull();
    expect(item.state).toBe(STATUS.OPEN);
  });

  it('still skips the OTA and claim notices', () => {
    expect(
      parseComment(
        comment(
          '### 📦 production OTA published — abc123\n- **Update group:** x'
        )
      )
    ).toBeNull();
    expect(
      parseComment(
        comment(
          '### 🔒 Device claim\n- **Claimed by:** someone\n- **Claim:** HELD'
        )
      )
    ).toBeNull();
  });
});

describe('notes below the rule', () => {
  const withNotes = [
    '### ⚪ 5462960191 — Sheet drag-dismiss no longer crashes',
    ITEM_FIELDS,
    '- **Status:** ✅ done 2026-09-02',
    '',
    '---',
    '',
    '**Note — 2026-09-01 · drain:** not runnable, blocked on the pre-req.',
    'Quoting the item it refers to: **Status:** OPEN was left as-is.',
    '',
    '---',
    '',
    '**Note — 2026-09-02 · drain:** pre-req cleared, retested and passed.',
  ].join('\n');

  it('does not let a note override the item’s own fields', () => {
    const item = parseComment(comment(withNotes));

    // The note quotes "**Status:** OPEN". Before the rule split, the last
    // Status match in the body won and a closed item read as open.
    expect(item.state).toBe(STATUS.DONE);
  });

  it('collects each note as its own entry', () => {
    const item = parseComment(comment(withNotes));
    expect(item.notes).toHaveLength(2);
    expect(item.notes[0]).toContain('blocked on the pre-req');
    expect(item.notes[1]).toContain('retested and passed');
  });

  it('an item with no notes has none', () => {
    const item = parseComment(
      comment(
        [
          '### 🤖 5462960191 — Something',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item.notes).toEqual([]);
  });

  it('keeps the Status line of a legacy item whose rule sits ABOVE it', () => {
    // Real shape, alate#562 comment 5361359352: a `---` + "Generated by
    // Claude Code" footer, with the Status appended underneath at drain time.
    // Splitting on the FIRST rule in the body threw that Status away and made
    // a done item read as malformed — an invisible item, which is the one
    // failure this parser must never have.
    const item = parseComment(
      comment(
        [
          '### Product image on The Collective fit check renders (was blank)',
          '**App:** alate (consumer) · **PR:** #586',
          '',
          '**What to check:** paste that URL into a fit check.',
          '',
          '---',
          '_Generated by [Claude Code](https://claude.ai/code)_',
          '',
          '- **Status:** ✅ done 2026-08-25 — fixed in PR #594',
        ].join('\n')
      )
    );
    expect(item.state).toBe(STATUS.DONE);
    expect(item.notes).toEqual([]);
  });
});

describe('regressions the parser already paid for', () => {
  it('OPEN with a trailing note is still OPEN', () => {
    const item = parseComment(
      comment(
        [
          '### 🤖 5462960191 — Something',
          ITEM_FIELDS,
          '- **Status:** OPEN — routed to another agent',
        ].join('\n')
      )
    );
    expect(item.state).toBe(STATUS.OPEN);
  });

  it('ignores plain commentary with neither title nor Status', () => {
    expect(
      parseComment(comment('Just a reply about the item above.'))
    ).toBeNull();
  });

  it('surfaces a real test that lost its Status line', () => {
    const item = parseComment(
      comment(['### 🤖 5462960191 — Something', ITEM_FIELDS].join('\n'))
    );
    expect(item.state).toBe(STATUS.UNPARSEABLE);
  });
});
