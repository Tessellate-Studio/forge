const path = require('path');

const {
  summariseQueue,
  unreadableNotice,
} = require('../lib/device-test-summary');
const { STATUS, itemFromIssue } = require(path.join(
  __dirname,
  '..',
  '..',
  'skills',
  'device-test',
  'scripts',
  'queue-lib.js'
));

// Real shapes, not hand-typed ones: the regression this guards was a field
// the hook read (`issueNumber`) that the real result had stopped carrying. A
// fixture typed from memory would have carried it and passed.
const issue = (number, extra = {}) =>
  itemFromIssue(
    {
      number,
      title: `[device-test] test ${number}`,
      state: 'open',
      labels: [{ name: 'device-test' }],
      body: `- **Verifies:** #${number + 1000}`,
      ...extra,
    },
    'alate'
  );

const repo = (key, items) => ({ key, repo: `Tessellate-Studio/${key}`, items });

describe('summariseQueue', () => {
  it('speaks for open tests on the post-RFD-003 result shape (forge#135)', () => {
    // No issueNumber, no issueUrl — exactly what fetchRepoQueue returns now.
    const results = [
      repo('alate', [
        issue(1),
        issue(2, {
          labels: [{ name: 'device-test' }, { name: 'needs-human' }],
        }),
      ]),
      repo('loom', []),
    ];
    expect(results[0].issueNumber).toBeUndefined();

    const out = summariseQueue(results);
    expect(out).not.toBeNull();
    expect(out.systemMessage).toContain('2 open (1 needs-human)');
    expect(out.context).toContain('- alate: 2 open (1 needs-human)');
    expect(out.context).toContain('label%3Adevice-test');
    expect(out.context).not.toContain('loom');
  });

  it('stays quiet when every queue was read and nothing is pending', () => {
    expect(summariseQueue([repo('alate', []), repo('loom', [])])).toBeNull();
  });

  it('does not count closed tests, passed or withdrawn, as pending', () => {
    const passed = issue(3, { state: 'closed', state_reason: 'completed' });
    const withdrawn = issue(4, {
      state: 'closed',
      state_reason: 'not_planned',
    });
    expect(passed.state).toBe(STATUS.DONE);
    expect(withdrawn.state).toBe(STATUS.WITHDRAWN);
    expect(summariseQueue([repo('badige', [passed, withdrawn])])).toBeNull();
  });

  it('counts failed, needs-build and parked — each is still somebody’s work', () => {
    const label = name => ({
      labels: [{ name: 'device-test' }, { name }],
    });
    const out = summariseQueue([
      repo('mood-layer', [
        issue(5, label('failed')),
        issue(6, label('needs-build')),
        issue(7, label('parked')),
      ]),
    ]);
    expect(out.systemMessage).toContain('1 failed');
    expect(out.systemMessage).toContain('1 needs-build');
    expect(out.systemMessage).toContain('1 parked');
  });

  it('names an unreadable repo instead of treating it as empty', () => {
    const out = summariseQueue([
      {
        key: 'alate',
        repo: 'Tessellate-Studio/alate',
        error: 'Command failed',
      },
      repo('loom', []),
    ]);
    expect(out).not.toBeNull();
    expect(out.systemMessage).toContain('could not read alate');
    expect(out.context).toContain('not the same as nothing pending');
  });

  it('treats a result with no items array as unreadable, not empty', () => {
    const out = summariseQueue([
      { key: 'badige', repo: 'Tessellate-Studio/badige' },
    ]);
    expect(out.systemMessage).toContain('could not read badige');
  });
});

describe('unreadableNotice', () => {
  it('says the queue could not be read rather than saying nothing', () => {
    const out = unreadableNotice('did not finish in 12s');
    expect(out.systemMessage).toContain(
      'could not be read (did not finish in 12s)'
    );
    expect(out.context).toContain('not the same as nothing pending');
  });
});
