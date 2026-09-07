const {
  CLAIM_MARKER,
  CLAIM_LABEL,
  STALE_MINUTES,
  claimBody,
  parseClaim,
  activeClaim,
  describeClaim,
  touchBody,
  releaseBody,
  identity,
  slugRepo,
} = require('../lib/claim');

const minutesAgo = n => new Date(Date.now() - n * 60_000).toISOString();

const comment = (lines, extra = {}) => ({
  id: 1,
  html_url: 'https://github.com/o/r/issues/1#issuecomment-1',
  body: ['### 🚧 Work claim', ...lines].join('\n'),
  ...extra,
});

const held = (over = {}) =>
  comment([
    `- **Claimed by:** ${over.heldBy ?? 'session-a'}`,
    `- **Session:** ${over.session ?? '`claude --resume abc-123` on HOST-1'}`,
    `- **Worktree:** ${
      over.worktree ?? 'C:/repos/alate/.claude/worktrees/wt-1 (branch `feat/x`)'
    }`,
    `- **Started at:** ${over.startedAt ?? minutesAgo(120)}`,
    `- **Last touch:** ${over.lastTouch ?? minutesAgo(5)}`,
    `- **Docs:** ${over.docs ?? '—'}`,
    `- **Waiting on:** ${over.waitingOn ?? '—'}`,
    `- **Claim:** ${over.claim ?? 'HELD'}`,
  ]);

describe('claimBody', () => {
  it('renders every field the standard names', () => {
    const body = claimBody({
      heldBy: 'session-a',
      sessionId: 'abc-123',
      host: 'HOST-1',
      worktree: 'C:/repos/alate/wt',
      branch: 'feat/x',
      at: '2026-09-07T10:00:00.000Z',
      docs: ['memory/decisions/rfd-003-x.md'],
    });
    expect(body).toMatch(CLAIM_MARKER);
    expect(body).toContain('- **Claimed by:** session-a');
    expect(body).toContain('claude --resume abc-123');
    expect(body).toContain('HOST-1');
    expect(body).toContain('branch `feat/x`');
    expect(body).toContain('memory/decisions/rfd-003-x.md');
    expect(body).toContain('- **Claim:** HELD');
  });

  it('defaults Last touch to the start time and Docs/Waiting on to a dash', () => {
    const body = claimBody({
      heldBy: 's',
      sessionId: 'i',
      host: 'h',
      worktree: 'w',
      branch: 'b',
      at: '2026-09-07T10:00:00.000Z',
    });
    expect(body).toContain('- **Last touch:** 2026-09-07T10:00:00.000Z');
    expect(body).toContain('- **Docs:** —');
    expect(body).toContain('- **Waiting on:** —');
  });

  it('round-trips through parseClaim', () => {
    const body = claimBody({
      heldBy: 'session-a',
      sessionId: 'abc-123',
      host: 'HOST-1',
      worktree: 'C:/repos/alate/wt',
      branch: 'feat/x',
      at: minutesAgo(3),
      docs: ['memory/decisions/adr-001-y.md'],
    });
    const parsed = parseClaim({ id: 7, html_url: 'u', body });
    expect(parsed.held).toBe(true);
    expect(parsed.heldBy).toBe('session-a');
    expect(parsed.sessionId).toBe('abc-123');
    expect(parsed.branch).toBe('feat/x');
    expect(parsed.docs).toContain('adr-001-y');
    expect(parsed.stale).toBe(false);
  });
});

describe('parseClaim', () => {
  it('ignores comments without the claim heading', () => {
    expect(parseClaim({ id: 1, body: 'just a normal comment' })).toBeNull();
    expect(
      parseClaim({ id: 1, body: '### 🔒 Device claim\n- **Claim:** HELD' })
    ).toBeNull();
  });

  it('reads the session id out of the resume command', () => {
    expect(parseClaim(held()).sessionId).toBe('abc-123');
  });

  it('splits worktree path from branch', () => {
    const p = parseClaim(held());
    expect(p.worktree).toBe('C:/repos/alate/.claude/worktrees/wt-1');
    expect(p.branch).toBe('feat/x');
  });

  it('marks a claim stale only after the silence window', () => {
    expect(
      parseClaim(held({ lastTouch: minutesAgo(STALE_MINUTES - 1) })).stale
    ).toBe(false);
    expect(
      parseClaim(held({ lastTouch: minutesAgo(STALE_MINUTES + 1) })).stale
    ).toBe(true);
  });

  it('never treats a claim parked on a human as stale', () => {
    const p = parseClaim(
      held({
        lastTouch: minutesAgo(STALE_MINUTES * 10),
        waitingOn: 'human — needs the phone',
      })
    );
    expect(p.waitingOnHuman).toBe(true);
    expect(p.stale).toBe(false);
  });

  it('falls back to Started at when Last touch is missing', () => {
    const c = comment([
      '- **Claimed by:** session-a',
      `- **Started at:** ${minutesAgo(STALE_MINUTES + 5)}`,
      '- **Claim:** HELD',
    ]);
    const p = parseClaim(c);
    expect(p.stale).toBe(true);
    expect(p.idleMinutes).toBeGreaterThan(STALE_MINUTES);
  });

  it('reads RELEASED as not held', () => {
    expect(parseClaim(held({ claim: 'RELEASED' })).held).toBe(false);
  });
});

describe('activeClaim', () => {
  it('returns null when every claim is released or stale', () => {
    expect(
      activeClaim([
        parseClaim(held({ claim: 'RELEASED' })),
        parseClaim(held({ lastTouch: minutesAgo(STALE_MINUTES + 30) })),
      ])
    ).toBeNull();
  });

  it('returns the newest live claim when more than one is held', () => {
    const a = parseClaim({ ...held({ heldBy: 'session-a' }), id: 1 });
    const b = parseClaim({ ...held({ heldBy: 'session-b' }), id: 2 });
    expect(activeClaim([a, b]).heldBy).toBe('session-b');
  });

  it('tolerates an empty list', () => {
    expect(activeClaim([])).toBeNull();
  });
});

describe('touchBody / releaseBody', () => {
  it('rewrites only the Last touch line', () => {
    const before = held().body;
    const after = touchBody(before, { lastTouch: '2026-09-07T12:00:00.000Z' });
    expect(after).toContain('- **Last touch:** 2026-09-07T12:00:00.000Z');
    expect(after).toContain('- **Claimed by:** session-a');
    expect(after).toContain('- **Claim:** HELD');
    expect(after.split('\n').length).toBe(before.split('\n').length);
  });

  it('can park the claim on a human in the same edit', () => {
    const after = touchBody(held().body, {
      lastTouch: '2026-09-07T12:00:00.000Z',
      waitingOn: 'human — approve the migration',
    });
    expect(parseClaim({ id: 1, body: after }).waitingOnHuman).toBe(true);
  });

  it('adds a Last touch line when the claim predates the heartbeat', () => {
    const before = comment(['- **Claimed by:** s', '- **Claim:** HELD']).body;
    const after = touchBody(before, { lastTouch: '2026-09-07T12:00:00.000Z' });
    expect(parseClaim({ id: 1, body: after }).lastTouch).toBe(
      '2026-09-07T12:00:00.000Z'
    );
  });

  it('merges docs in rather than replacing them', () => {
    const first = touchBody(
      held({ docs: 'memory/decisions/adr-001-a.md' }).body,
      {
        docs: ['memory/decisions/rfd-003-b.md'],
      }
    );
    expect(parseClaim({ id: 1, body: first }).docs).toBe(
      'memory/decisions/adr-001-a.md, memory/decisions/rfd-003-b.md'
    );

    // A repeat touch must not duplicate a link already there.
    const second = touchBody(first, {
      docs: ['memory/decisions/adr-001-a.md'],
    });
    expect(parseClaim({ id: 1, body: second }).docs).toBe(
      'memory/decisions/adr-001-a.md, memory/decisions/rfd-003-b.md'
    );
  });

  it('replaces the placeholder dash when the first doc arrives', () => {
    const after = touchBody(held().body, {
      docs: ['memory/decisions/rfd-003-b.md'],
    });
    expect(parseClaim({ id: 1, body: after }).docs).toBe(
      'memory/decisions/rfd-003-b.md'
    );
  });

  it('releaseBody flips HELD to RELEASED', () => {
    const after = releaseBody(held().body);
    expect(parseClaim({ id: 1, body: after }).held).toBe(false);
  });
});

describe('describeClaim', () => {
  it('is empty when nothing is claimed', () => {
    expect(describeClaim(null)).toBe('');
  });

  it('names the holder, the branch and how long it has been idle', () => {
    const line = describeClaim(parseClaim(held({ lastTouch: minutesAgo(7) })));
    expect(line).toContain('session-a');
    expect(line).toContain('feat/x');
    expect(line).toMatch(/7 min/);
  });

  it('says what a parked claim is waiting on', () => {
    const line = describeClaim(
      parseClaim(held({ waitingOn: 'human — needs the phone' }))
    );
    expect(line).toContain('waiting on human');
  });
});

describe('identity', () => {
  it('reads the session id from the environment', () => {
    const id = identity({
      env: { CLAUDE_CODE_SESSION_ID: 'sess-9' },
      cwd: 'C:/repos/alate/wt',
      branch: 'feat/x',
      host: 'HOST-1',
    });
    expect(id.sessionId).toBe('sess-9');
    expect(id.heldBy).toContain('feat/x');
    expect(id.worktree).toBe('C:/repos/alate/wt');
  });

  it('degrades to unknown rather than throwing when the env is bare', () => {
    const id = identity({
      env: {},
      cwd: 'C:/repos/alate',
      branch: null,
      host: 'HOST-1',
    });
    expect(id.sessionId).toBe('unknown');
    expect(id.heldBy).toBeTruthy();
  });
});

describe('mapWithLimit', () => {
  const { mapWithLimit } = require('../lib/claim');

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    await mapWithLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('preserves input order regardless of completion order', async () => {
    const out = await mapWithLimit([30, 5, 20, 1], 4, async ms => {
      await new Promise(r => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 5, 20, 1]);
  });

  it('handles an empty list without spawning a worker', async () => {
    expect(await mapWithLimit([], 5, async () => 'never')).toEqual([]);
  });
});

describe('CLAIM_LABEL', () => {
  it('is the label the board filters on', () => {
    expect(CLAIM_LABEL).toBe('claimed');
  });

  it('slugRepo accepts both short keys and owner/name', () => {
    expect(slugRepo('alate')).toBe('Tessellate-Studio/alate');
    expect(slugRepo('Tessellate-Studio/loom')).toBe('Tessellate-Studio/loom');
  });
});

describe('leakedItems — what the sweep acts on', () => {
  const { leakedItems } = require('../lib/claim');

  it('reports an item whose label outlived every claim on it', () => {
    const out = leakedItems([
      {
        key: 'alate',
        repo: 'Tessellate-Studio/alate',
        items: [
          { number: 1, leaked: true, claims: [] },
          { number: 2, leaked: false, claims: [] },
        ],
      },
    ]);
    expect(out.map(i => i.number)).toEqual([1]);
    expect(out[0].repo).toBe('Tessellate-Studio/alate');
  });

  it('never sweeps a repo whose fetch failed — unknown is not leaked', () => {
    expect(
      leakedItems([
        {
          key: 'loom',
          error: 'gh exploded',
          items: [{ number: 9, leaked: true }],
        },
      ])
    ).toEqual([]);
  });

  it('is empty when nothing is claimed anywhere', () => {
    expect(leakedItems([{ key: 'forge', items: [] }])).toEqual([]);
  });
});

describe('protocol decisions shared with the device claim', () => {
  it('an unreadable timestamp fails OPEN, not closed', () => {
    // A typo in Last touch must not hold an item forever. A wrongly-released
    // claim is re-taken in seconds; a wedged one needs a human.
    const p = parseClaim(
      held({ lastTouch: 'not-a-date', startedAt: 'also-bad' })
    );
    expect(p.idleMinutes).toBeNull();
    expect(p.stale).toBe(true);
  });

  it('a fresh RELEASED comment retires the same holder’s earlier HELD one', () => {
    // A session that posts a new comment instead of editing its own would
    // otherwise leave the earlier HELD record standing, and the item would
    // read as claimed forever.
    const earlier = parseClaim({ ...held({ heldBy: 'session-a' }), id: 1 });
    const later = parseClaim({
      ...held({ heldBy: 'session-a', claim: 'RELEASED' }),
      id: 2,
    });
    expect(activeClaim([earlier, later])).toBeNull();
  });

  it('registers 🚧 as a notice glyph so the queue parser skips it', () => {
    const { noticeMarker } = require('../lib/protocol');
    expect(noticeMarker().test('### 🚧 Work claim')).toBe(true);
    expect(noticeMarker().test('### 📦 production OTA published')).toBe(true);

    // Item glyphs must never be swallowed — an invisible item is the worst
    // failure the queue parser has.
    expect(noticeMarker().test('### 🤖 123 — a real test')).toBe(false);
  });
});

describe('a closed item is leaked by definition', () => {
  const { leakedItems } = require('../lib/claim');

  // Found the hard way: forge#95 merged on 2026-09-07 still carrying `claimed`,
  // and the board reported "nothing claimed" because it only queried
  // state=open. The most common leak of all was invisible to the tool built
  // to catch it.
  it('a closed item with a live-looking claim is still leaked', () => {
    const out = leakedItems([
      {
        key: 'forge',
        repo: 'Tessellate-Studio/forge',
        items: [
          { number: 95, closed: true, leaked: true, claims: [{ held: true }] },
        ],
      },
    ]);
    expect(out.map(i => i.number)).toEqual([95]);
  });

  it('an OPEN item with a live claim is left alone', () => {
    expect(
      leakedItems([
        {
          key: 'forge',
          repo: 'Tessellate-Studio/forge',
          items: [
            {
              number: 96,
              closed: false,
              leaked: false,
              claims: [{ held: true }],
            },
          ],
        },
      ])
    ).toEqual([]);
  });
});
