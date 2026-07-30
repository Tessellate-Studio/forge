const { isVersionPinBlocked } = require('../lib/version-pin.js');

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);

const entry = { version: '0.6.1' };

/** The state the worker writes when it hits version-pinned staleness. */
const pinned = {
  ok: false,
  versionPinned: true,
  pinnedAtVersion: '0.6.1',
  pinnedAtCloneHead: HEAD,
};

/** What the hook observes while the pin is in force. */
const stillPinned = { cacheStale: true, behind: 0, head: HEAD };

describe('the latch holds while nothing has changed', () => {
  it('blocks the spawn when version and clone HEAD both still match', () => {
    expect(isVersionPinBlocked(pinned, entry, stillPinned)).toBe(true);
  });

  it('keeps blocking however many sessions ask — this is the loop being fixed', () => {
    for (let i = 0; i < 20; i++) {
      expect(isVersionPinBlocked(pinned, entry, stillPinned)).toBe(true);
    }
  });

  it('treats behind=null (git unreadable) as not-behind rather than as drift', () => {
    expect(
      isVersionPinBlocked(pinned, entry, { ...stillPinned, behind: null })
    ).toBe(true);
  });
});

describe('the latch releases as soon as an input that matters moves', () => {
  it('releases when the forced reinstall clears the stale cache', () => {
    expect(
      isVersionPinBlocked(pinned, entry, { ...stillPinned, cacheStale: false })
    ).toBe(false);
  });

  it('releases when the clone HEAD moves — new commits may carry a version bump', () => {
    expect(
      isVersionPinBlocked(pinned, entry, { ...stillPinned, head: OTHER_HEAD })
    ).toBe(false);
  });

  it('releases when the installed version changed under it', () => {
    expect(isVersionPinBlocked(pinned, { version: '0.7.0' }, stillPinned)).toBe(
      false
    );
  });

  it('releases when the clone falls behind — that drift IS retryable', () => {
    expect(
      isVersionPinBlocked(pinned, entry, { ...stillPinned, behind: 3 })
    ).toBe(false);
  });
});

describe('it never blocks on anything but a confirmed pin', () => {
  it('ignores a healthy last repair', () => {
    expect(
      isVersionPinBlocked({ ...pinned, ok: true }, entry, stillPinned)
    ).toBe(false);
  });

  it('ignores an ordinary retryable failure', () => {
    const ordinary = { ok: false, versionPinned: false };
    expect(isVersionPinBlocked(ordinary, entry, stillPinned)).toBe(false);
  });

  it.each([undefined, null, {}])('ignores absent state (%p)', last => {
    expect(isVersionPinBlocked(last, entry, stillPinned)).toBe(false);
  });

  it('does not latch on state written before the fingerprint shipped', () => {
    const legacy = { ok: false, versionPinned: true }; // no pinnedAt* fields
    expect(isVersionPinBlocked(legacy, entry, stillPinned)).toBe(false);
  });

  it('does not latch when the current HEAD cannot be read', () => {
    expect(
      isVersionPinBlocked(pinned, entry, { ...stillPinned, head: null })
    ).toBe(false);
  });

  it('does not latch when the manifest entry is missing', () => {
    expect(isVersionPinBlocked(pinned, null, stillPinned)).toBe(false);
  });
});
