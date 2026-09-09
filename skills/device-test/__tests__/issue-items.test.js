const { STATUS, itemFromIssue, LABELS } = require('../scripts/queue-lib');

// Shapes from the REST issues endpoint (`gh api repos/<r>/issues?labels=…`),
// trimmed to the fields the parser reads. Unlike the comment fixtures next
// door these cannot yet be captured from a live queue — no device-test issue
// exists until the migration runs (RFD-003 step 4) — so they are built to the
// documented response shape and will be re-cut from real issues once there
// are some. That is the one honest gap in this file.
const issue = (over = {}) => ({
  number: 712,
  html_url: 'https://github.com/Tessellate-Studio/alate/issues/712',
  title: '[device-test] budget-column-739 — BUDGET is always the fifth column',
  state: 'open',
  state_reason: null,
  created_at: '2026-09-08T09:00:00Z',
  labels: [{ name: 'device-test' }],
  body: [
    '- **Verifies:** #739 (`8d3ce08`)',
    '- **Delivery:** production OTA once #739 lands · **Needs runtime:** 1.3.1',
    '- **Steps:**',
    '  - [ ] 1. Profile → Price range → clear any budget',
    '- **Expect:**',
    '  1. Five columns, BUDGET an empty ring with a muted em dash',
  ].join('\n'),
  ...over,
});

const withLabels = (...names) =>
  issue({ labels: names.map(name => ({ name })) });

describe('a test is an issue — state comes from GitHub, not from prose', () => {
  it('an open device-test issue is OPEN, and agent-runnable by default', () => {
    const item = itemFromIssue(issue(), 'alate');
    expect(item.state).toBe(STATUS.OPEN);
    expect(item.needsHuman).toBe(false);
  });

  it('needs-human is a label, not a HUMAN: prefix buried in Steps', () => {
    const item = itemFromIssue(
      withLabels(LABELS.ITEM, LABELS.NEEDS_HUMAN),
      'alate'
    );
    expect(item.state).toBe(STATUS.OPEN);
    expect(item.needsHuman).toBe(true);
  });

  it('needs-build keeps the item open and off the daily drain', () => {
    const item = itemFromIssue(
      withLabels(LABELS.ITEM, LABELS.NEEDS_BUILD),
      'alate'
    );
    expect(item.state).toBe(STATUS.NEEDS_BUILD);
  });

  it('a failed test stays OPEN — a failure is open work, not a closed run', () => {
    // RFD-003 §1, resolved with the user 2026-09-08: the item is retired only
    // when a later drain re-runs it after the fix and it passes. Closing it on
    // failure is how a bug stops being re-checked.
    const item = itemFromIssue(withLabels(LABELS.ITEM, LABELS.FAILED), 'alate');
    expect(item.state).toBe(STATUS.FAILED);
    expect(item.open).toBe(true);
  });

  it('parked is open too, but nobody should drain it', () => {
    const item = itemFromIssue(withLabels(LABELS.ITEM, LABELS.PARKED), 'alate');
    expect(item.state).toBe(STATUS.PARKED);
    expect(item.open).toBe(true);
  });

  it('closed as completed is a pass', () => {
    const item = itemFromIssue(
      issue({ state: 'closed', state_reason: 'completed' }),
      'alate'
    );
    expect(item.state).toBe(STATUS.DONE);
    expect(item.open).toBe(false);
  });

  it('closed as not-planned is withdrawn, and is NOT a pass', () => {
    // Superseded, invalid, or withdrawn. Reporting it as done would claim a
    // verification nobody performed.
    const item = itemFromIssue(
      issue({ state: 'closed', state_reason: 'not_planned' }),
      'alate'
    );
    expect(item.state).toBe(STATUS.WITHDRAWN);
    expect(item.state).not.toBe(STATUS.DONE);
  });

  it('a closed issue with no reason reads as done, not as withdrawn', () => {
    // GitHub leaves state_reason null on issues closed before it existed and
    // on some API paths. Defaulting to withdrawn would silently downgrade
    // every historical pass.
    const item = itemFromIssue(issue({ state: 'closed' }), 'alate');
    expect(item.state).toBe(STATUS.DONE);
  });
});

describe('what the board reads off an issue', () => {
  it('ids the test by repo#number — stable from creation, unlike a comment id', () => {
    const item = itemFromIssue(issue(), 'alate');
    expect(item.testId).toBe('alate#712');
    expect(item.commentUrl).toBe(
      'https://github.com/Tessellate-Studio/alate/issues/712'
    );
  });

  it('strips the [device-test] title prefix, which is for skimming not reading', () => {
    const item = itemFromIssue(issue(), 'alate');
    expect(item.title).toBe(
      'budget-column-739 — BUDGET is always the fifth column'
    );
  });

  it('reads Verifies as the PR, not a closing keyword', () => {
    // A test must never be closed by the thing it verifies, so the body says
    // "Verifies", never "closes" (RFD-003 §2).
    expect(itemFromIssue(issue(), 'alate').pr).toBe('739');
  });

  it('still reads Delivery and Needs runtime, which stay free text', () => {
    const item = itemFromIssue(issue(), 'alate');
    expect(item.delivery).toContain('production OTA');
    expect(item.needsRuntime).toBe('1.3.1');
  });

  it('never reports heading drift — there is no glyph left to drift', () => {
    // The whole class of repair this medium deletes.
    expect(itemFromIssue(issue(), 'alate').headingDrift).toBe(false);
  });

  it('still catches two tests stacked in one issue body', () => {
    // An issue body can stack headings exactly as a comment could, so the
    // detection from forge #117 moves rather than dies.
    const stacked = itemFromIssue(
      issue({
        body: [
          '### 🤖 first test',
          '- **Expect:** a',
          '### 🤖 second test',
          '- **Expect:** b',
        ].join('\n'),
      }),
      'alate'
    );
    expect(stacked.itemHeadings).toBe(2);
  });

  it('survives an empty body without inventing fields', () => {
    const item = itemFromIssue(issue({ body: null }), 'alate');
    expect(item.pr).toBeNull();
    expect(item.delivery).toBeNull();
    expect(item.state).toBe(STATUS.OPEN);
  });
});
