const {
  STATUS,
  parseComment,
  expectedGlyph,
  statusState,
} = require('../scripts/queue-lib');

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

    // A work claim (tools/work-claim) can land on the queue issue like any
    // other tracked item. It carries no Status line, so without the notice
    // rule it would file as a malformed item and nag the board forever.
    expect(
      parseComment(
        comment(
          '### 🚧 Work claim\n- **Claimed by:** feat/x (abc12345)\n- **Claim:** HELD'
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

describe('DEPENDS: — a step ordering marker, not a who-is-needed one', () => {
  // forge #100: steps are independent probes unless the item says otherwise.
  // `DEPENDS: step N` is that declaration. It says nothing about WHO runs the
  // step, so it must not flip an item to needs-human — and it must not mask a
  // real HUMAN: prefix sitting on the same line.
  const withSteps = steps =>
    comment(
      [
        '### 🤖 5462960191 — Something',
        '- **PR:** #80 · **SHA:** 67f61ce',
        '- **Delivery:** Expo Go',
        '- **Needs runtime:** any',
        '- **Steps:**',
        ...steps,
        '- **Expect:** the sheet closes cleanly',
        '- **Status:** OPEN',
      ].join('\n')
    );

  it('a DEPENDS: step stays agent-runnable', () => {
    const item = parseComment(
      withSteps([
        '  1. Open a fit result',
        '  2. DEPENDS: step 1 · dismiss the tip',
      ])
    );
    expect(item.needsHuman).toBe(false);
    expect(expectedGlyph(item)).toBe('🤖');
  });

  it('a DEPENDS: step that is also HUMAN: still needs a human', () => {
    const item = parseComment(
      withSteps([
        '  1. Open a fit result',
        '  2. DEPENDS: step 1 · HUMAN: judge the rubber-band feel',
      ])
    );
    expect(item.needsHuman).toBe(true);
    expect(expectedGlyph(item)).toBe('🙋');
  });
});

describe('notice detection does not depend on module load order', () => {
  // The 🚧 glyph is registered by the work-claim variant as it loads. A caller
  // that grabbed the notice REGEX at import time snapshotted whichever
  // variants had loaded by then — so removing an unrelated require silently
  // put 🚧 work claims back into the "malformed item" bucket, which is the one
  // failure this parser must never have. Asking isNotice() at parse time is
  // what makes the answer independent of order.
  it('skips a work claim even with a cold module registry', () => {
    jest.resetModules();
    const fresh = require('../scripts/queue-lib');
    expect(
      fresh.parseComment(
        comment(
          '### 🚧 Work claim\n- **Claimed by:** feat/x\n- **Claim:** HELD'
        )
      )
    ).toBeNull();
    expect(
      fresh.parseComment(comment('### 🔒 Device claim\n- **Claim:** HELD'))
    ).toBeNull();
  });

  it('still treats an agent-runnable item as an item', () => {
    jest.resetModules();
    const fresh = require('../scripts/queue-lib');
    const item = fresh.parseComment(
      comment(
        [
          '### 🤖 5462960191 — Something',
          ITEM_FIELDS,
          '- **Status:** OPEN',
        ].join('\n')
      )
    );
    expect(item).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The bookkeeping the queue writes about ITSELF is not a queue item.
//
// This is the failure mode the flag exists to survive. Every deploy appends an
// OTA notice, every drain appends a claim and its corrections — so a rule that
// mistakes any of them for a malformed item produces a warning that GROWS with
// use. On alate#562 it reached 27 (30 by the next morning), and at that size
// nobody reads it, which is exactly when a genuinely dropped test hides in it.
// The bar for each fixture below: would a human have to do something about it?
// ---------------------------------------------------------------------------
describe('bookkeeping the board must not report as a violation', () => {
  const fx = require('../__fixtures__/queue-comments');

  it('skips the 📦 OTA-publish notice eas-update.yml writes on every deploy', () => {
    expect(parseComment(fx.otaNotice)).toBeNull();
  });

  it('skips the 🔒 device claim every drain writes', () => {
    expect(parseComment(fx.deviceClaim)).toBeNull();
  });

  it('skips a correction whose first words are "Expect correction"', () => {
    // alate#562 5575634751, posted the morning after the first pass of this
    // fix. `**Expect` without the colon matched its opening bold run, so a
    // note correcting ANOTHER item's Expect was promoted to a malformed
    // item — the same bug this file exists to close, one comment later.
    expect(parseComment(fx.expectCorrectionNote)).toBeNull();
  });

  it('skips a drain correction written like a document', () => {
    // alate#562 5571959196: two `###` headings and a closing sentence opening
    // `**Status:**` that says, in prose, why ANOTHER item is blocked. It has
    // the furniture of an item and none of the substance — no item glyph, no
    // Steps, no Expect, and a Status naming no state.
    expect(parseComment(fx.correctionNote)).toBeNull();
  });

  it('reads a legacy bold-opener item instead of calling it malformed', () => {
    // alate#562 5469277783. Written before Steps/Expect were fields, so the
    // "a bold opener is a title only when the body looks like a test" rule
    // refused it a title and reported an already-CLOSED test as malformed —
    // one of the false positives burying the real ones.
    const item = parseComment(fx.legacyBoldItem);
    expect(item.state).toBe(STATUS.DONE);
    expect(item.title).toBe('HUMAN: re-verify');

    // Its heading carries neither glyph nor ID: drift for the drain to stamp,
    // never a reason to drop or flag the item.
    expect(item.headingDrift).toBe(true);
  });
});

describe('violations that still deserve a human', () => {
  const fx = require('../__fixtures__/queue-comments');

  it('flags a real test that has no Status line, and says so', () => {
    // alate#562 5523648406 — a full test (Steps, Expect, PR, Delivery) that
    // no drain can close because there is no Status line to edit.
    const item = parseComment(fx.itemMissingStatus);
    expect(item.state).toBe(STATUS.UNPARSEABLE);
    expect(item.unparseableReason).toMatch(/no `\*\*Status:\*\*` line/);
  });

  it('does not read a note DOCUMENTING the missing Status as supplying one', () => {
    // Same comment. Its drain note reads: No `**Status:**` line on this
    // comment (format drift). Matched as a field, that mention made the item
    // look like it had a Status — a paragraph of prose — so the board
    // reported the wrong defect and no drain would ever have appended one.
    const item = parseComment(fx.itemMissingStatus);
    expect(item.statusText).toBeUndefined();
    expect(item.unparseableReason).not.toMatch(/format drift/);
  });

  it('flags a Status value the format defines no state for', () => {
    // alate#562 5424307372 (`CLOSED`) and mood-layer#66 5521503000
    // (`🅿️ PARKED`). Both are real tests; neither value is one of the four
    // states, so the board genuinely cannot say where they stand. Guessing
    // would be worse than asking.
    const closed = parseComment(fx.itemUndefinedStatus);
    expect(closed.state).toBe(STATUS.UNPARSEABLE);
    expect(closed.unparseableReason).toContain('names no state');

    const parked = parseComment(fx.itemParkedStatus);
    expect(parked.state).toBe(STATUS.UNPARSEABLE);
    expect(parked.unparseableReason).toContain('names no state');
  });

  it('clips a long Status in the reason instead of printing the paragraph', () => {
    // The reason is a nudge, not a transcript. A drifted Status routinely
    // runs to a paragraph, and one row printing all of it pushes every other
    // row off the screen — the same "nobody reads it" failure, differently
    // caused.
    const parked = parseComment(fx.itemParkedStatus);
    expect(parked.unparseableReason).toContain('🅿️ PARKED');
    expect(parked.unparseableReason).toContain('…');
    expect(parked.unparseableReason).not.toContain('2026-09-03');

    const wordy = parseComment(
      comment(
        [
          '### 🤖 5462960191 — Something',
          ITEM_FIELDS,
          `- **Status:** blocked because ${'and so on '.repeat(40)}`,
        ].join('\n')
      )
    );
    expect(wordy.unparseableReason.length).toBeLessThan(140);
  });
});

describe('what counts as an item at all', () => {
  it('an item glyph in the heading outranks every other signal', () => {
    // A declared item with a typo'd Status must stay ON the board as a
    // violation. Skipping it as commentary would be the invisible-item
    // failure wearing the new rule's clothes.
    const item = parseComment(
      comment('### 🤖 5462960191 — Something\n- **Status:** OPNE')
    );
    expect(item).not.toBeNull();
    expect(item.state).toBe(STATUS.UNPARSEABLE);
  });

  it('a heading with no glyph, no test shape and no state is commentary', () => {
    expect(
      parseComment(
        comment('### Re: the two items above\nBoth were run this morning.')
      )
    ).toBeNull();
  });

  it('a heading plus Steps is an item even with no Status at all', () => {
    const item = parseComment(
      comment(['### Something to check', ITEM_FIELDS].join('\n'))
    );
    expect(item.state).toBe(STATUS.UNPARSEABLE);
  });

  it('maps each defined Status value to its state, and nothing else', () => {
    expect(statusState('OPEN — routed to another agent')).toBe(STATUS.OPEN);
    expect(statusState('✅ done 2026-09-02')).toBe(STATUS.DONE);
    expect(statusState('❌ failed → #694')).toBe(STATUS.FAILED);
    expect(statusState('🔧 needs build — no OTA reaches it')).toBe(
      STATUS.NEEDS_BUILD
    );
    expect(statusState('CLOSED— iOS/TestFlight')).toBeNull();
    expect(statusState('🅿️ PARKED — being rethought')).toBeNull();
  });
});

describe('the Expect field, not a sentence that starts with "Expect"', () => {
  it('accepts both spellings of the field', () => {
    const modern = parseComment(
      comment('### Something\n- **Expect:** it renders')
    );
    const legacy = parseComment(
      comment('### Something\n- **Expected:** it renders')
    );
    expect(modern.state).toBe(STATUS.UNPARSEABLE);
    expect(legacy.state).toBe(STATUS.UNPARSEABLE);
  });

  it('does not read a bold run merely opening with the word', () => {
    expect(
      parseComment(comment('**Expect correction for item 123** — see below.'))
    ).toBeNull();
    expect(
      parseComment(comment('### Re: 123\n**Expectations here were wrong.**'))
    ).toBeNull();
  });
});
