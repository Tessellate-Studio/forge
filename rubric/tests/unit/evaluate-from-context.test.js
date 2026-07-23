// Tests for the autonomous RICE scoring path.
//
// The roadmap-pulse skill consumes this path. The skill's contract is
// documented in roadmap-pulse/references/scoring-contract.md; this
// test file mirrors that contract.

const { evaluateFromContext } = require('../../lib/evaluate-from-context');

describe('evaluateFromContext — RICE contract', () => {
  test('returns the full RICE output shape', () => {
    const out = evaluateFromContext({
      title: 'Set up email aliases on tessellate.co.in',
      description:
        'Compliance gap — privacy policy already published with privacy@ as the data-deletion address; emails bounce today.',
      context: {
        goals: [
          'Closed beta live — acquisition gates loom',
          'Privacy policy published; data-deletion email must resolve',
        ],
        dependencies: {
          this_task_depends_on: [],
          this_task_unblocks: [
            'Reddit launch posts',
            'Get in touch on BrandIntegration',
          ],
        },
      },
    });

    expect(out).toEqual(
      expect.objectContaining({
        reach: expect.any(Number),
        impact: expect.any(Number),
        confidence: expect.any(Number),
        effort: expect.any(Number),
        rice_score: expect.any(Number),
        reasoning: expect.objectContaining({
          reach: expect.any(String),
          impact: expect.any(String),
          confidence: expect.any(String),
          effort: expect.any(String),
        }),
      })
    );
  });

  test('rice_score equals (reach * impact * confidence) / effort', () => {
    const out = evaluateFromContext({
      title: 'Anything',
      description: 'Check the math.',
      context: { goals: ['random goal text'], dependencies: {} },
    });
    const expected =
      Math.round(
        ((out.reach * out.impact * out.confidence) / out.effort) * 100
      ) / 100;
    expect(out.rice_score).toBe(expected);
  });

  test('reach is one of the valid scale values', () => {
    const out = evaluateFromContext({
      title: 'X',
      description: 'Y',
      context: {},
    });
    expect([1, 10, 100, 1000]).toContain(out.reach);
  });

  test('impact is one of the valid scale values', () => {
    const out = evaluateFromContext({
      title: 'X',
      description: 'Y',
      context: {},
    });
    expect([0.25, 0.5, 1, 2, 3]).toContain(out.impact);
  });

  test('confidence is one of the valid scale values', () => {
    const out = evaluateFromContext({
      title: 'X',
      description: 'Y',
      context: {},
    });
    expect([0.5, 0.8, 1.0]).toContain(out.confidence);
  });

  test('effort is one of the valid scale values', () => {
    const out = evaluateFromContext({
      title: 'X',
      description: 'Y',
      context: {},
    });
    expect([0.5, 1, 2, 3, 5, 10, 20]).toContain(out.effort);
  });
});

describe('evaluateFromContext — heuristic signals', () => {
  test('high-impact keywords produce higher impact', () => {
    const high = evaluateFromContext({
      title: 'Critical compliance gating launch',
      description:
        'P0 security blocker for the production launch — auth is broken.',
      context: { goals: [], dependencies: {} },
    });
    const low = evaluateFromContext({
      title: 'Polish footer spacing',
      description:
        'Minor visual tweak on the footer; not visible to most users.',
      context: { goals: [], dependencies: {} },
    });
    expect(high.impact).toBeGreaterThan(low.impact);
  });

  test('low-effort keywords produce lower effort estimate', () => {
    const simple = evaluateFromContext({
      title: 'Fix typo in docs',
      description: 'One-liner doc copy fix.',
      context: {},
    });
    const complex = evaluateFromContext({
      title: 'Rearchitect auth subsystem',
      description: `${'A'.repeat(
        900
      )} This is a multi-week rewrite that requires external partnership and a database migration.`,
      context: { dependencies: { this_task_depends_on: ['A', 'B', 'C'] } },
    });
    expect(simple.effort).toBeLessThan(complex.effort);
  });

  test('high-reach keywords produce higher reach', () => {
    const broad = evaluateFromContext({
      title: 'Fix onboarding flow for all users',
      description: 'Production app-wide bug affecting every user on launch.',
      context: {},
    });
    const narrow = evaluateFromContext({
      title: 'Fix internal debugging tool',
      description: 'Admin-only dev tooling fix.',
      context: {},
    });
    expect(broad.reach).toBeGreaterThan(narrow.reach);
  });

  test('tasks with goals and specific descriptions get higher confidence', () => {
    const confident = evaluateFromContext({
      title: 'Set up email aliases',
      description:
        'Compliance gap — privacy policy already published with privacy@ address; emails bounce today. Need MX records on tessellate.co.in pointed to Google Workspace.',
      context: {
        goals: ['Closed beta live'],
        dependencies: {},
      },
    });
    const vague = evaluateFromContext({
      title: 'Something',
      description: 'Do it.',
      context: {},
    });
    expect(confident.confidence).toBeGreaterThan(vague.confidence);
  });

  test('dependency-unblock potential boosts reach', () => {
    const unblocker = evaluateFromContext({
      title: 'Set up the thing',
      description: 'Do the thing for production launch for all users.',
      context: {
        goals: [],
        dependencies: {
          this_task_depends_on: [],
          this_task_unblocks: ['Task A', 'Task B', 'Task C'],
        },
      },
    });
    const leaf = evaluateFromContext({
      title: 'Set up the thing',
      description: 'Do the thing.',
      context: {
        goals: [],
        dependencies: { this_task_depends_on: [], this_task_unblocks: [] },
      },
    });
    expect(unblocker.reach).toBeGreaterThanOrEqual(leaf.reach);
  });

  test('high-impact + low-effort produces higher RICE score than low-impact + high-effort', () => {
    const quickWin = evaluateFromContext({
      title: 'Critical compliance fix',
      description: 'One-liner config fix for production security gate.',
      context: { goals: ['Security compliance'], dependencies: {} },
    });
    const slog = evaluateFromContext({
      title: 'Polish footer spacing',
      description: `${'A'.repeat(
        900
      )} Multi-week rewrite of the layout system that requires external partnership.`,
      context: {
        goals: [],
        dependencies: { this_task_depends_on: ['X', 'Y', 'Z'] },
      },
    });
    expect(quickWin.rice_score).toBeGreaterThan(slog.rice_score);
  });
});

describe('evaluateFromContext — input validation', () => {
  test('throws when input is missing', () => {
    expect(() => evaluateFromContext()).toThrow(/input must be an object/);
  });
  test('throws when title is missing', () => {
    expect(() => evaluateFromContext({ description: 'x' })).toThrow(
      /title is required/
    );
  });
  test('throws when description is missing', () => {
    expect(() => evaluateFromContext({ title: 'x' })).toThrow(
      /description is required/
    );
  });
  test('throws when context is not an object', () => {
    expect(() =>
      evaluateFromContext({
        title: 'x',
        description: 'y',
        context: 'not-an-object',
      })
    ).toThrow(/context must be an object/);
  });
});

describe('evaluateFromContext — reasoning is non-empty', () => {
  test('each axis reasoning is a non-trivial string', () => {
    const out = evaluateFromContext({
      title: 'Set up email aliases',
      description: 'Compliance gap for closed beta.',
      context: { goals: ['Closed beta'], dependencies: {} },
    });
    for (const axis of ['reach', 'impact', 'confidence', 'effort']) {
      expect(out.reasoning[axis].length).toBeGreaterThan(10);
    }
  });
});
