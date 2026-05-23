// Tests for the autonomous-scoring path.
//
// The roadmap-pulse skill consumes this path. The skill's contract is
// documented in roadmap-pulse/references/scoring-contract.md; this
// test file mirrors that contract.

const { evaluateFromContext, bandForTotal } = require('../../lib/evaluate-from-context');

describe('evaluateFromContext — contract', () => {
  test('returns the full output shape', () => {
    const out = evaluateFromContext({
      title: 'Set up email aliases on tessellate.co.in',
      description: 'Compliance gap — privacy policy already published with privacy@ as the data-deletion address; emails bounce today.',
      context: {
        goals: [
          'Closed beta live — acquisition gates loom',
          'Privacy policy published; data-deletion email must resolve',
        ],
        dependencies: {
          this_task_depends_on: [],
          this_task_unblocks: ['Reddit launch posts', 'Get in touch on BrandIntegration'],
        },
      },
    });

    expect(out).toEqual(
      expect.objectContaining({
        impact: expect.any(Number),
        complexity: expect.any(Number),
        reusability: expect.any(Number),
        strategic: expect.any(Number),
        total: expect.any(Number),
        band: expect.stringMatching(/^(Must|Nice|Low|Reject)$/),
        reasoning: expect.objectContaining({
          impact: expect.any(String),
          complexity: expect.any(String),
          reusability: expect.any(String),
          strategic: expect.any(String),
        }),
      })
    );
  });

  test('total equals the sum of the four axes', () => {
    const out = evaluateFromContext({
      title: 'Anything',
      description: 'Doesn\'t matter what; just check the math.',
      context: { goals: ['random goal text'], dependencies: {} },
    });
    expect(out.total).toBe(out.impact + out.complexity + out.reusability + out.strategic);
  });

  test('each axis is an integer in [0, 3]', () => {
    const out = evaluateFromContext({
      title: 'X',
      description: 'Y',
      context: {},
    });
    for (const axis of ['impact', 'complexity', 'reusability', 'strategic']) {
      expect(Number.isInteger(out[axis])).toBe(true);
      expect(out[axis]).toBeGreaterThanOrEqual(0);
      expect(out[axis]).toBeLessThanOrEqual(3);
    }
  });
});

describe('evaluateFromContext — band mapping', () => {
  test('9-12 maps to Must', () => {
    expect(bandForTotal(9)).toBe('Must');
    expect(bandForTotal(12)).toBe('Must');
  });
  test('6-8 maps to Nice', () => {
    expect(bandForTotal(6)).toBe('Nice');
    expect(bandForTotal(8)).toBe('Nice');
  });
  test('3-5 maps to Low', () => {
    expect(bandForTotal(3)).toBe('Low');
    expect(bandForTotal(5)).toBe('Low');
  });
  test('0-2 maps to Reject', () => {
    expect(bandForTotal(0)).toBe('Reject');
    expect(bandForTotal(2)).toBe('Reject');
  });
});

describe('evaluateFromContext — heuristic signals', () => {
  test('high-impact keywords push the impact score up', () => {
    const high = evaluateFromContext({
      title: 'Critical compliance gating launch',
      description: 'P0 security blocker for the production launch — auth is broken.',
      context: { goals: [], dependencies: {} },
    });
    const low = evaluateFromContext({
      title: 'Polish footer spacing',
      description: 'Minor visual tweak on the footer; not visible to most users.',
      context: { goals: [], dependencies: {} },
    });
    expect(high.impact).toBeGreaterThan(low.impact);
  });

  test('low-complexity keywords push the complexity score up (inverse)', () => {
    const simple = evaluateFromContext({
      title: 'Fix typo in docs',
      description: 'One-liner doc copy fix.',
      context: {},
    });
    const complex = evaluateFromContext({
      title: 'Rearchitect auth subsystem',
      description: 'A'.repeat(900) + ' This is a multi-week rewrite that requires external partnership and a database migration.',
      context: { dependencies: { this_task_depends_on: ['A', 'B', 'C'] } },
    });
    expect(simple.complexity).toBeGreaterThan(complex.complexity);
  });

  test('reusability keywords drive the reusability axis', () => {
    const reusable = evaluateFromContext({
      title: 'Build a shared validation library',
      description: 'Create a reusable infrastructure-grade plugin shared across services.',
      context: {},
    });
    const oneoff = evaluateFromContext({
      title: 'One-off fix for this brand',
      description: 'A bespoke fix specific to this user.',
      context: {},
    });
    expect(reusable.reusability).toBeGreaterThan(oneoff.reusability);
  });

  test('strategic fit reflects goal overlap', () => {
    const aligned = evaluateFromContext({
      title: 'Set up partner email aliases',
      description: 'Set up partner email aliases for closed-beta launch.',
      context: {
        goals: [
          'Closed-beta launch acquisition gates',
          'Partner inquiries must resolve',
        ],
        dependencies: {},
      },
    });
    const unrelated = evaluateFromContext({
      title: 'Refactor internal logging utility',
      description: 'Tidy up a logging utility nobody depends on directly.',
      context: {
        goals: [
          'Closed-beta launch acquisition gates',
          'Partner inquiries must resolve',
        ],
        dependencies: {},
      },
    });
    expect(aligned.strategic).toBeGreaterThan(unrelated.strategic);
  });

  test('dependency-unblock potential pushes impact up', () => {
    const unblocker = evaluateFromContext({
      title: 'Set up the thing',
      description: 'Do the thing.',
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
    expect(unblocker.impact).toBeGreaterThan(leaf.impact);
  });
});

describe('evaluateFromContext — input validation', () => {
  test('throws when input is missing', () => {
    expect(() => evaluateFromContext()).toThrow(/input must be an object/);
  });
  test('throws when title is missing', () => {
    expect(() => evaluateFromContext({ description: 'x' })).toThrow(/title is required/);
  });
  test('throws when description is missing', () => {
    expect(() => evaluateFromContext({ title: 'x' })).toThrow(/description is required/);
  });
  test('throws when context is not an object', () => {
    expect(() => evaluateFromContext({ title: 'x', description: 'y', context: 'not-an-object' })).toThrow(/context must be an object/);
  });
});

describe('evaluateFromContext — reasoning is non-empty', () => {
  test('each axis reasoning is a non-trivial string', () => {
    const out = evaluateFromContext({
      title: 'Set up email aliases',
      description: 'Compliance gap for closed beta.',
      context: { goals: ['Closed beta'], dependencies: {} },
    });
    for (const axis of ['impact', 'complexity', 'reusability', 'strategic']) {
      expect(out.reasoning[axis].length).toBeGreaterThan(10);
    }
  });
});
