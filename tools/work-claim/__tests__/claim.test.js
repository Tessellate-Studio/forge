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

    // One vocabulary for idle across the board, the hook and both claim
    // variants: humanIdle in protocol.js. It used to be raw minutes here and
    // "3d" on the board — the same state, said two ways.
    expect(line).toMatch(/7m ago/);
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

  it('reports NO session id rather than throwing when the env is bare', () => {
    const id = identity({
      env: {},
      cwd: 'C:/repos/alate',
      branch: null,
      host: 'HOST-1',
    });

    // null, not the string 'unknown' — parseClaim already yields null for an
    // unidentified claim, and two spellings of the same state were being
    // tested inconsistently across two modules.
    expect(id.sessionId).toBeNull();
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

describe('a reconstructed claim admits what it does not know', () => {
  it('never prints a resume command it cannot back up', () => {
    const body = claimBody({
      heldBy: 'fix/x (HOST-1)',
      sessionId: null,
      host: 'HOST-1',
      worktree: 'C:/repos/alate/wt',
      branch: 'fix/x',
      at: '2026-09-07T10:00:00.000Z',
    });
    expect(body).toContain('session not identified');
    expect(body).not.toContain('claude --resume');

    // The parts it DOES know are still the point of the claim.
    const p = parseClaim({ id: 1, body });
    expect(p.branch).toBe('fix/x');
    expect(p.worktree).toBe('C:/repos/alate/wt');
    expect(p.sessionId).toBeNull();
  });

  it('still renders a resume command when the session IS known', () => {
    const body = claimBody({
      heldBy: 'x',
      sessionId: 'abc-123',
      host: 'H',
      worktree: 'W',
      branch: 'b',
      at: '2026-09-07T10:00:00.000Z',
    });
    expect(body).toContain('claude --resume abc-123');
  });
});

describe('repo scope', () => {
  it('covers litmus — it carries real in-flight work', () => {
    const { REPOS } = require('../lib/claim');
    expect(REPOS).toContain('litmus');
  });
});

describe('isLeaked — what the label is allowed to outlive', () => {
  const { isLeaked } = require('../lib/claim');

  // The closed-item rule shipped counting every claim COMMENT, so an item
  // whose holder released it properly still reported as leaked. A sweep that
  // cries leak on correct behaviour is a sweep people learn to ignore.
  it('a closed item whose claims were all released is clean', () => {
    expect(
      isLeaked({ closed: true }, [{ held: false }, { held: false }], null)
    ).toBe(false);
  });

  it('a closed item with a claim still HELD is leaked', () => {
    expect(
      isLeaked({ closed: true }, [{ held: false }, { held: true }], null)
    ).toBe(true);
  });

  it('an open item is leaked only when nothing resolves as active', () => {
    const live = { heldBy: 'x' };
    expect(isLeaked({ closed: false }, [{ held: true }], live)).toBe(false);
    expect(isLeaked({ closed: false }, [{ held: true }], null)).toBe(true);
  });

  it('a closed item with no claims at all is clean', () => {
    expect(isLeaked({ closed: true }, [], null)).toBe(false);
  });
});

describe('a claim survives work spread over days', () => {
  const { withItemActivity, QUIET_MINUTES } = require('../lib/claim');

  // Reported 2026-09-07: "I sometimes work on an issue for 2 days or more.
  // It's not necessary that the issue is continuously worked on." The first
  // window was 90 minutes, copied from the device lock without re-deriving
  // it — which called a normal working pattern abandoned before lunch.
  it('is not stale after a night away', () => {
    const overnight = parseClaim(held({ lastTouch: minutesAgo(14 * 60) }));
    expect(overnight.stale).toBe(false);
  });

  it('is not stale after two days', () => {
    expect(parseClaim(held({ lastTouch: minutesAgo(2 * 24 * 60) })).stale).toBe(
      false
    );
  });

  it('IS stale after eight days of total silence', () => {
    expect(parseClaim(held({ lastTouch: minutesAgo(8 * 24 * 60) })).stale).toBe(
      true
    );
  });

  it('marks a long-idle claim quiet without calling it abandoned', () => {
    const [claim] = withItemActivity(
      [parseClaim(held({ lastTouch: minutesAgo(2 * 24 * 60) }))],
      new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
    );
    expect(claim.quiet).toBe(true);
    expect(claim.stale).toBe(false);
    expect(QUIET_MINUTES).toBeLessThan(STALE_MINUTES);
  });
});

describe('activity on the item counts as a heartbeat', () => {
  const { withItemActivity } = require('../lib/claim');

  // `wip touch` is a thing a session has to remember, and the long-running
  // sessions this window protects are the likeliest to forget. A push on the
  // branch is better evidence than a heartbeat nobody ran.
  it('revives a claim whose own heartbeat is old but whose item just moved', () => {
    const old = parseClaim(held({ lastTouch: minutesAgo(6 * 24 * 60) }));
    const [revived] = withItemActivity(
      [old],
      new Date(Date.now() - 30 * 60_000).toISOString()
    );
    expect(revived.idleMinutes).toBeLessThanOrEqual(30);
    expect(revived.liveness).toBe('item activity');
    expect(revived.stale).toBe(false);
  });

  it('keeps the heartbeat when it is the fresher of the two', () => {
    const fresh = parseClaim(held({ lastTouch: minutesAgo(5) }));
    const [out] = withItemActivity(
      [fresh],
      new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
    );
    expect(out.idleMinutes).toBeLessThanOrEqual(5);
    expect(out.liveness).toBe('heartbeat');
  });

  it('leaves a claim parked on a human alone whatever the dates say', () => {
    const parked = parseClaim(
      held({
        lastTouch: minutesAgo(30 * 24 * 60),
        waitingOn: 'human — needs the phone',
      })
    );
    const [out] = withItemActivity(
      [parked],
      new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
    );
    expect(out.stale).toBe(false);
  });

  it('an item with no updated_at is left exactly as parsed', () => {
    const claim = parseClaim(held());
    expect(withItemActivity([claim], null)).toEqual([claim]);
  });
});

describe('Related — a claim is not a dead end', () => {
  // alate #696 merged while #707 carried the same work forward, and nothing
  // on either named the other.
  it('renders and round-trips the linked refs', () => {
    const body = claimBody({
      heldBy: 'x',
      sessionId: 's1',
      host: 'H',
      worktree: 'W',
      branch: 'b',
      at: '2026-09-07T10:00:00.000Z',
      related: ['closes #707', '#696'],
    });
    expect(body).toContain('- **Related:** closes #707, #696');
    expect(parseClaim({ id: 1, body }).related).toBe('closes #707, #696');
  });

  it('is a dash, not a broken line, when nothing is linked', () => {
    const body = claimBody({
      heldBy: 'x',
      sessionId: 's1',
      host: 'H',
      worktree: 'W',
      branch: 'b',
      at: '2026-09-07T10:00:00.000Z',
    });
    expect(body).toContain('- **Related:** —');
    expect(parseClaim({ id: 1, body }).related).toBe('');
  });
});

describe('sweep stays off open work', () => {
  const { isLeaked } = require('../lib/claim');

  // Stripping the label off an open item mid-job recreates the exact
  // collision the claim exists to prevent, and nobody is waiting on it.
  it('an open item with a live claim is never leaked, however quiet', () => {
    expect(isLeaked({ closed: false }, [{ held: true }], { quiet: true })).toBe(
      false
    );
  });
});

describe('stripCode — documentation is not data', () => {
  const { stripCode } = require('../lib/protocol');

  // forge #99 documented the Related field with a fenced example reading
  // "- **Related:** closes #707, #696". The reference scanner read its own
  // documentation as a real closing keyword and linked a forge claim to an
  // alate number that does not exist in forge.
  it('drops fenced blocks so an example is not read as a keyword', () => {
    const body = [
      'before',
      '```markdown',
      '- **Related:** closes #707',
      '```',
      'after',
    ].join('\n');
    const out = stripCode(body);
    expect(out).toContain('before');
    expect(out).toContain('after');
    expect(/closes\s+#707/i.test(out)).toBe(false);
  });

  it('drops inline code spans', () => {
    expect(/fixes\s+#12/i.test(stripCode('use `Fixes #12` in the body'))).toBe(
      false
    );
  });

  it('leaves a real closing keyword in prose alone', () => {
    expect(/closes\s+#42/i.test(stripCode('This closes #42 at last.'))).toBe(
      true
    );
  });

  it('survives empty and missing input', () => {
    expect(stripCode('')).toBe('');
    expect(stripCode(null)).toBe('');
  });
});

describe('a claim without a local worktree', () => {
  // An agent-opened PR nobody has pulled still deserves a claim. Naming an
  // unrelated directory that happens to sit on disk would be worse than
  // saying plainly that there is no local checkout.
  it('says so instead of naming a path that is not on the branch', () => {
    const body = claimBody({
      heldBy: 'security-sweep/x (HOST)',
      sessionId: 'unknown',
      host: 'HOST',
      worktree: null,
      branch: 'security-sweep/x',
      at: '2026-09-08T10:00:00.000Z',
    });
    expect(body).toContain('no local worktree');
    expect(body).toContain('branch `security-sweep/x`');

    const parsed = parseClaim({ id: 1, body });
    expect(parsed.worktree).toBeNull();
    expect(parsed.branch).toBe('security-sweep/x');
  });

  it('still reads a real worktree path back unchanged', () => {
    const body = claimBody({
      heldBy: 'x',
      sessionId: 's',
      host: 'H',
      worktree: 'C:/repos/alate/wt',
      branch: 'feat/x',
      at: '2026-09-08T10:00:00.000Z',
    });
    expect(parseClaim({ id: 1, body }).worktree).toBe('C:/repos/alate/wt');
  });
});

describe('an unread repo is not a clean repo', () => {
  const { failedRepos, leakedItems } = require('../lib/claim');

  // mood-layer#112 sat merged and still labelled through a sweep that
  // announced "nothing to sweep": its repo fetch had failed, leakedItems
  // skips errored repos, and the caller read that silence as clean.
  it('names the repos that could not be read', () => {
    const results = [
      { key: 'alate', items: [] },
      { key: 'mood-layer', error: 'gh timed out', items: [] },
    ];
    expect(failedRepos(results).map(f => f.key)).toEqual(['mood-layer']);
    expect(leakedItems(results)).toEqual([]); // still silent on its own
  });

  it('is empty when every repo was read', () => {
    expect(failedRepos([{ key: 'alate', items: [] }])).toEqual([]);
  });

  it('tolerates junk in the results list', () => {
    expect(failedRepos([null, undefined])).toEqual([]);
    expect(failedRepos(null)).toEqual([]);
  });
});
