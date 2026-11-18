const {
  STATUS,
  LABELS,
  itemFromIssue,
  isStaleBuild,
  STALE_BUILD_DAYS,
} = require('../scripts/queue-lib');

const make = (labels, created_at) =>
  itemFromIssue(
    {
      number: 1,
      html_url: 'https://github.com/Tessellate-Studio/alate/issues/1',
      title: 't',
      state: 'open',
      state_reason: null,
      created_at,
      labels: labels.map(name => ({ name })),
      body: '',
    },
    'alate'
  );

const NOW = Date.parse('2026-11-18T00:00:00Z');
const daysAgo = n => new Date(NOW - n * 86400000).toISOString();

describe('isStaleBuild (forge#196)', () => {
  it('uses a 14 day limit', () => expect(STALE_BUILD_DAYS).toBe(14));

  it('flags a needs-build item older than the limit', () => {
    const item = make([LABELS.ITEM, LABELS.NEEDS_BUILD], daysAgo(15));
    expect(item.state).toBe(STATUS.NEEDS_BUILD);
    expect(isStaleBuild(item, NOW)).toBe(true);
  });

  it('does not flag a fresh needs-build item', () => {
    const item = make([LABELS.ITEM, LABELS.NEEDS_BUILD], daysAgo(3));
    expect(isStaleBuild(item, NOW)).toBe(false);
  });

  it('never flags another state, however old', () => {
    const item = make([LABELS.ITEM], daysAgo(90));
    expect(isStaleBuild(item, NOW)).toBe(false);
  });

  it('does not flag an unreadable date', () => {
    const item = make([LABELS.ITEM, LABELS.NEEDS_BUILD], 'garbage');
    expect(isStaleBuild(item, NOW)).toBe(false);
  });
});
