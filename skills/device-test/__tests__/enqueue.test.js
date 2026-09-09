const {
  renderTestBody,
  labelsFor,
  intentSlug,
  matchesIntent,
} = require('../scripts/enqueue');

const FIELDS = {
  verifies: '739',
  sha: '8d3ce08',
  delivery: 'production OTA once #739 lands. Both platforms.',
  needsRuntime: '1.3.1',
  steps: [
    'Profile → Price range → clear any budget. Open a fit check.',
    'HUMAN: judge whether the ring reads as empty rather than broken.',
  ],
  expect: ['Five columns, BUDGET an empty ring with a muted em dash.'],
};

describe('the body forge generates for a new test', () => {
  it('writes Verifies, never a closing keyword', () => {
    // A test must NOT be closed by the very PR it exists to verify, and
    // GitHub closes an issue on "closes #n" in a merged PR. RFD-003 §2.
    const body = renderTestBody(FIELDS);
    expect(body).toContain('**Verifies:** #739');
    expect(body).not.toMatch(/\b(closes|fixes|resolves)\s+#739/i);
  });

  it('carries no Status line — state is the issue now', () => {
    expect(renderTestBody(FIELDS)).not.toContain('**Status:**');
  });

  it('writes Steps as a task list so "never ran" is visible', () => {
    // forge#100: a single ❌ on an item hid that steps 2-5 were never looked
    // at. An unticked box records that natively, with no prose to read.
    const body = renderTestBody(FIELDS);
    expect(body).toContain('- [ ] 1.');
    expect(body).toContain('- [ ] 2.');
  });

  it('keeps Expect numbered, because an expectation is not a checkbox', () => {
    // Steps get ticked as they are RUN; expectations are judged, not
    // performed. Making them checkboxes invites ticking one that failed.
    const body = renderTestBody(FIELDS);
    expect(body).toMatch(/- \*\*Expect:\*\*/);
    expect(body).toContain('  1. Five columns');
  });

  it('survives missing optional fields without printing "undefined"', () => {
    const body = renderTestBody({
      steps: ['do a thing'],
      expect: ['it works'],
    });
    expect(body).not.toMatch(/undefined|null/);
    expect(body).toContain('- [ ] 1. do a thing');
  });
});

describe('which labels a new test gets', () => {
  it('labels device-test always', () => {
    expect(labelsFor(FIELDS)).toContain('device-test');
  });

  it('derives needs-human from a HUMAN: step, as the old format did', () => {
    expect(labelsFor(FIELDS)).toContain('needs-human');
  });

  it('leaves an all-agent test unlabelled beyond device-test', () => {
    const agentOnly = { ...FIELDS, steps: ['adb shell input tap 100 200'] };
    expect(labelsFor(agentOnly)).toEqual(['device-test']);
  });

  it('does not invent needs-human from the word "human" in prose', () => {
    // The marker is the `HUMAN:` step prefix, not the word appearing in a
    // sentence — otherwise "no human needed here" would flip the label.
    const prose = { ...FIELDS, steps: ['no human needed here, adb does it'] };
    expect(labelsFor(prose)).not.toContain('needs-human');
  });
});

describe('not enqueueing the same test twice', () => {
  it('slugs an intent down to something comparable', () => {
    expect(
      intentSlug('budget-column-739 — BUDGET is always the fifth column')
    ).toBe('budget-column-739-budget-is-always-the-fifth-column');
  });

  it('matches an existing issue whatever its title decoration', () => {
    // The dedup lookup has to survive the `[device-test]` prefix and any
    // later retitling that kept the slug.
    const existing = {
      title:
        '[device-test] budget-column-739 — BUDGET is always the fifth column',
    };
    expect(
      matchesIntent(
        existing,
        'budget-column-739 — BUDGET is always the fifth column'
      )
    ).toBe(true);
  });

  it('does not match a different test that shares a few words', () => {
    const existing = {
      title: '[device-test] budget-column-739 — something else entirely',
    };
    expect(
      matchesIntent(
        existing,
        'gender-unisex-739 — the third chip stores unisex'
      )
    ).toBe(false);
  });
});
