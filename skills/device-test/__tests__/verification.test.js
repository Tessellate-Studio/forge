const {
  UNVERIFIED_LABEL,
  trackedRepo,
  deviceVerification,
} = require('../scripts/verification');

// REST issue shape, as fetchLabelledIssues receives it. The body line is the
// one `dtq enqueue` writes, so the PR edge is parsed the way real tests carry it.
const test = (number, pr, over = {}) => ({
  number,
  title: `[device-test] test ${number}`,
  state: 'open',
  labels: [{ name: 'device-test' }],
  body: `- **Verifies:** #${pr} (\`8d3ce08\`)\n- **Steps:**\n  - [ ] 1. x`,
  ...over,
});

const alate = trackedRepo('Tessellate-Studio/alate');
const verdict = over =>
  deviceVerification({
    repoDef: alate,
    pr: 752,
    prLabels: [],
    issues: [],
    ...over,
  });

describe('trackedRepo', () => {
  it('knows the four queues and nothing else', () => {
    expect(trackedRepo('Tessellate-Studio/alate').key).toBe('alate');
    expect(trackedRepo('tessellate-studio/LOOM').key).toBe('loom');
    expect(trackedRepo('Tessellate-Studio/forge')).toBeNull();
  });
});

describe('deviceVerification', () => {
  it('refuses a PR an open device test verifies (forge#104 — alate#670 shape)', () => {
    const out = verdict({ issues: [test(784, 752), test(783, 738)] });
    expect(out.status).toBe('pending');
    expect(out.tests).toEqual(['alate#784']);
    expect(out.detail).toBe('alate#784 verifies #752 and is still open');
  });

  it('names every open test that verifies it', () => {
    const out = verdict({ issues: [test(781, 752), test(782, 752)] });
    expect(out.status).toBe('pending');
    expect(out.detail).toBe(
      'alate#781, alate#782 verify #752 and are still open'
    );
  });

  it('clears when the open tests verify other PRs', () => {
    expect(verdict({ issues: [test(783, 738)] }).status).toBe('clear');
  });

  it('does not let #75 match a test that verifies #752', () => {
    const out = deviceVerification({
      repoDef: alate,
      pr: 75,
      prLabels: [],
      issues: [test(784, 752)],
    });
    expect(out.status).toBe('clear');
  });

  it('ignores closed tests and pull requests wearing the label', () => {
    const out = verdict({
      issues: [
        test(780, 752, { state: 'closed', state_reason: 'completed' }),
        test(790, 752, { pull_request: { url: 'x' } }),
      ],
    });
    expect(out.status).toBe('clear');
  });

  it('clears a labelled PR, and the evidence still names what is open', () => {
    const out = verdict({
      issues: [test(784, 752)],
      prLabels: ['enhancement', UNVERIFIED_LABEL],
    });
    expect(out.status).toBe('clear');
    expect(out.detail).toContain('device-unverified');
    expect(out.detail).toContain('alate#784 still open');
  });

  it('is unknown, never clear, when the read failed', () => {
    expect(verdict({ error: 'Command failed' }).status).toBe('unknown');
    expect(verdict({ issues: undefined }).status).toBe('unknown');
    expect(verdict({ prLabels: undefined }).status).toBe('unknown');
  });

  it('clears a repo with no device-test queue without needing a read', () => {
    const out = deviceVerification({ repoDef: null, pr: 1 });
    expect(out.status).toBe('clear');
  });
});
