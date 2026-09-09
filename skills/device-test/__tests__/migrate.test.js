const { labelsForItem } = require('../scripts/migrate');
const { STATUS } = require('../scripts/queue-lib');

const item = (over = {}) => ({
  state: STATUS.OPEN,
  needsHuman: false,
  statusText: 'OPEN',
  notes: [],
  ...over,
});

describe('what labels a migrated item lands with', () => {
  it('labels every migrated test device-test', () => {
    expect(labelsForItem(item())).toEqual(['device-test']);
  });

  it('carries needs-human across, so an iOS test does not become agent-runnable', () => {
    expect(labelsForItem(item({ needsHuman: true }))).toContain('needs-human');
  });

  it('turns the needs-build Status into the label the weekly task reads', () => {
    expect(labelsForItem(item({ state: STATUS.NEEDS_BUILD }))).toContain(
      'needs-build'
    );
  });

  it('keeps a failed test failed — and it will be migrated OPEN', () => {
    expect(labelsForItem(item({ state: STATUS.FAILED }))).toContain('failed');
  });

  it('recovers parked from the Status text the old parser could not read', () => {
    // `🅿️ PARKED` was never a defined Status value, so these arrive as
    // UNPARSEABLE. The intent is still legible in the text, and dropping it
    // would silently re-queue a test the user parked on purpose.
    const parked = item({
      state: STATUS.UNPARSEABLE,
      statusText: '🅿️ PARKED — the Insights checks are being rethought',
    });
    expect(labelsForItem(parked)).toContain('parked');
  });

  it('does not invent parked from an ordinary Status line', () => {
    expect(
      labelsForItem(item({ statusText: 'OPEN — routed elsewhere' }))
    ).toEqual(['device-test']);
  });
});
