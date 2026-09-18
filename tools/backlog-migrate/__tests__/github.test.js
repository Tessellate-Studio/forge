const {
  makeGithub,
  Pacer,
  BudgetExceeded,
  parseVersion,
  versionAtLeast,
} = require('../lib/github');

function recorder(outputs = {}) {
  const calls = [];
  const run = (args, input) => {
    calls.push({ args, input });
    const k = args.slice(0, 2).join(' ');
    const o = outputs[k];
    return typeof o === 'function' ? o(args, input) : o || '';
  };
  return { calls, run };
}

describe('gh wrapper', () => {
  test('version parsing and the 2.94 floor', () => {
    expect(parseVersion('gh version 2.98.0 (2026-08-20)\nhttps://…')).toEqual([
      2, 98, 0,
    ]);
    expect(versionAtLeast([2, 94, 0])).toBe(true);
    expect(versionAtLeast([2, 93, 9])).toBe(false);
    expect(versionAtLeast([3, 0, 0])).toBe(true);
  });

  test('createIssue sends labels in the create call and the body on stdin', () => {
    const { calls, run } = recorder({
      'issue create': () =>
        'https://github.com/Tessellate-Studio/loom/issues/42\n',
    });
    const gh = makeGithub({ run });
    const out = gh.createIssue('loom', {
      title: 'T',
      body: 'B',
      labels: ['P2', 'feature'],
    });
    expect(out).toEqual({
      number: 42,
      url: 'https://github.com/Tessellate-Studio/loom/issues/42',
    });
    expect(calls[0].args).toEqual([
      'issue',
      'create',
      '-R',
      'Tessellate-Studio/loom',
      '--title',
      'T',
      '--body-file',
      '-',
      '--label',
      'P2,feature',
    ]);
    expect(calls[0].input).toBe('B');
  });

  test('list calls always pass -L and refuse a truncated page', () => {
    const { calls, run } = recorder({
      'issue list': () => JSON.stringify([{ number: 1 }]),
    });
    makeGithub({ run }).listIssues('alate');
    expect(calls[0].args).toEqual(
      expect.arrayContaining(['-L', '3000', '--state', 'all'])
    );
    const full = recorder({
      'issue list': () => JSON.stringify(new Array(5).fill({})),
    });
    expect(() =>
      makeGithub({ run: full.run }).listIssues('alate', { limit: 5 })
    ).toThrow(/partial list/);
  });

  test('close uses not-planned and there is no delete method at all', () => {
    const { calls, run } = recorder();
    const gh = makeGithub({ run });
    gh.closeIssue('loom', 7, { comment: 'why' });
    expect(calls[0].args).toEqual([
      'issue',
      'close',
      '7',
      '-R',
      'Tessellate-Studio/loom',
      '--reason',
      'not planned',
      '--comment',
      'why',
    ]);
    expect(Object.keys(gh).filter(k => /delete/i.test(k))).toEqual([]);
  });
});

describe('Pacer', () => {
  function clock() {
    let t = 0;
    const slept = [];
    return {
      now: () => t,
      sleep: async ms => {
        slept.push(ms);
        t += ms;
      },
      slept,
      advance: ms => (t += ms),
    };
  }

  test('keeps ≥3 s between writes', async () => {
    const c = clock();
    const p = new Pacer({ now: c.now, sleep: c.sleep });
    await p.write(() => 1);
    c.advance(1000);
    await p.write(() => 2);
    expect(c.slept).toEqual([2000]);
    expect(p.writes).toBe(2);
  });

  test('stops at the hourly budget instead of pushing past it', async () => {
    const c = clock();
    const p = new Pacer({
      now: c.now,
      sleep: c.sleep,
      hourlyBudget: 3,
      minIntervalMs: 0,
    });
    for (let i = 0; i < 3; i++) {
      await p.write(() => i);
    }
    await expect(p.write(() => 4)).rejects.toBeInstanceOf(BudgetExceeded);
    c.advance(3600001);
    await expect(p.write(() => 5)).resolves.toBe(5);
  });

  test('rate limit: honours retry-after, else backs off 60/120/240 s, then gives up', async () => {
    const c = clock();
    const p = new Pacer({ now: c.now, sleep: c.sleep, minIntervalMs: 0 });
    let n = 0;
    await expect(
      p.write(() => {
        n++;
        const e = new Error(
          'HTTP 403: You have exceeded a secondary rate limit'
        );
        if (n === 1) {
          e.stderr = 'retry-after: 7';
        }
        throw e;
      })
    ).rejects.toThrow(/secondary rate limit/);
    expect(c.slept).toEqual([7000, 120000, 240000]);
    expect(n).toBe(4);
  });

  test('a non-rate-limit error is not retried', async () => {
    const c = clock();
    const p = new Pacer({ now: c.now, sleep: c.sleep });
    let n = 0;
    await expect(
      p.write(() => {
        n++;
        throw new Error('HTTP 422');
      })
    ).rejects.toThrow('422');
    expect(n).toBe(1);
  });
});
