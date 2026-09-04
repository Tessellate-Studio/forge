'use strict';

const {
  routeFix,
  classifyFiles,
  detectDependencyChanges,
  isRevertOfAutoFix,
  summariseChecks,
  CONDITIONS,
} = require('../lib/route');

/**
 * Healthy defaults: a one-file guard fix, CI green, no revert in range.
 * Every test states only what it changes, so the thing under test is the diff
 * from "would merge" rather than a wall of setup.
 */
function at(overrides = {}) {
  return routeFix({
    diff: {
      productionFiles: ['mobile/src/screens/AccountScreen.tsx'],
      testFiles: [],
      docFiles: [],
      manifestChanged: false,
      lockfileChanged: false,
      linesAdded: 6,
      linesRemoved: 0,
      ...(overrides.diff || {}),
    },
    ci: {
      status: 'pass',
      detail: '9/9 checks succeeded',
      ...(overrides.ci || {}),
    },
    cooldown: {
      status: 'clear',
      detail: 'no revert in 14d',
      ...(overrides.cooldown || {}),
    },
    declaredClass:
      'declaredClass' in overrides ? overrides.declaredClass : 'guard',
  });
}

function checkNamed(verdict, name) {
  return verdict.checks.find(check => check.name === name);
}

describe('the happy path actually exists', () => {
  // The first draft of this gate had five fail-closed acceptance tests and zero
  // positive ones. That is how a permanently-refusing gate ships green.
  it('merges a clean single-file guard fix', () => {
    const verdict = at();
    expect(verdict.route).toBe('4a');
    expect(verdict.reasons).toEqual([]);
  });

  it('every condition reports pass on the happy path — no silent gaps', () => {
    const verdict = at();
    expect(verdict.checks).toHaveLength(CONDITIONS.length);
    expect(verdict.checks.every(check => check.status === 'pass')).toBe(true);
    expect(
      verdict.checks.every(
        check => typeof check.evidence === 'string' && check.evidence
      )
    ).toBe(true);
  });
});

describe('the two real crash-monitor fixes in the system history both pass', () => {
  // Regression fixtures, not hypotheticals. A gate calibrated to reject the
  // only real examples is not rigour. Provenance for the condition-5 numbers.

  it('alate #536 — mailto scheme, mobile/app.json, +3/-0', () => {
    const files = classifyFiles(['mobile/app.json']);
    expect(files.production).toEqual(['mobile/app.json']);
    expect(detectDependencyChanges(files.production).manifestChanged).toBe(
      false
    );

    const verdict = at({
      diff: {
        productionFiles: files.production,
        testFiles: files.test,
        docFiles: files.doc,
        linesAdded: 3,
        linesRemoved: 0,
      },
    });
    expect(verdict.route).toBe('4a');
  });

  it('alate #643 — waist display fix, +12/-2 in one source file', () => {
    const files = classifyFiles([
      'memory/project_regression_log.md',
      'mobile/src/__tests__/AccountScreen.measurements.test.tsx',
      'mobile/src/screens/AccountScreen.tsx',
    ]);

    // The mandated regression-log update must not count against the fix.
    expect(files.production).toEqual(['mobile/src/screens/AccountScreen.tsx']);
    expect(files.test).toHaveLength(1);
    expect(files.doc).toEqual(['memory/project_regression_log.md']);

    const verdict = at({
      diff: {
        productionFiles: files.production,
        testFiles: files.test,
        docFiles: files.doc,
        linesAdded: 12,
        linesRemoved: 2,
      },
    });
    expect(verdict.route).toBe('4a');
  });
});

describe('unknown is never "probably fine"', () => {
  // The defect this gate exists to fix: an unverifiable condition that
  // silently passed. Every unknown must block.
  it.each([
    ['ci', { ci: { status: 'unknown', detail: 'gh unreachable' } }],
    ['cooldown', { cooldown: { status: 'unknown', detail: 'git log failed' } }],
  ])('routes 4b when %s is unknown', (_label, overrides) => {
    expect(at(overrides).route).toBe('4b');
  });

  it.each([
    ['ci', 'ci-green'],
    ['cooldown', 'cooldown'],
  ])(
    'surfaces %s as unknown, not fail — the reader must see the difference',
    (key, checkName) => {
      const verdict = at({
        [key]: { status: 'unknown', detail: 'unreachable' },
      });
      expect(checkNamed(verdict, checkName).status).toBe('unknown');
    }
  );

  it('treats a missing observer object as unverifiable, not absent', () => {
    const verdict = routeFix({ diff: null, ci: null, cooldown: null });
    expect(verdict.route).toBe('4b');
    expect(verdict.checks.every(check => check.status !== 'pass')).toBe(true);
  });
});

describe('CI is the load-bearing condition', () => {
  it('refuses on a failing check', () => {
    const verdict = at({
      ci: { status: 'fail', detail: 'lint-mobile failed' },
    });
    expect(verdict.route).toBe('4b');
    expect(checkNamed(verdict, 'ci-green').status).toBe('fail');
  });

  it('refuses when no checks were reported at all — silence is not success', () => {
    const verdict = at({
      ci: { status: 'unknown', detail: 'zero checks reported' },
    });
    expect(verdict.route).toBe('4b');
  });
});

describe('cooldown', () => {
  it('refuses while a revert touching these paths is in range', () => {
    const verdict = at({
      cooldown: { status: 'active', detail: 'Revert "fix(sync): ..." 3d ago' },
    });
    expect(verdict.route).toBe('4b');
  });
});

describe('dependency changes belong to security-sweep, not here', () => {
  it.each([
    ['manifest', { manifestChanged: true }],
    ['lockfile', { lockfileChanged: true }],
  ])('refuses when the %s changed', (_label, diff) => {
    expect(at({ diff }).route).toBe('4b');
  });
});

describe('single production file', () => {
  it('refuses two production files', () => {
    const verdict = at({
      diff: { productionFiles: ['a/one.ts', 'b/two.ts'] },
    });
    expect(verdict.route).toBe('4b');
  });

  it('refuses zero production files — an empty diff is not a safe diff', () => {
    const verdict = at({ diff: { productionFiles: [] } });
    expect(verdict.route).toBe('4b');
  });

  it('allows any number of test and doc files alongside', () => {
    const verdict = at({
      diff: {
        testFiles: ['a.test.ts', 'b.test.ts'],
        docFiles: ['README.md', 'memory/log.md'],
      },
    });
    expect(verdict.route).toBe('4a');
    expect(checkNamed(verdict, 'single-production-file').evidence).toMatch(
      /ignored/
    );
  });
});

describe('the declaration ratchet only ever rejects', () => {
  // It cannot verify a `guard` claim is true — nothing can, that is semantic.
  // It makes a false one expensive. It must NEVER rescue a `rewrite`.
  it('refuses a declared rewrite even with a perfect diff shape', () => {
    const verdict = at({
      declaredClass: 'rewrite',
      diff: { linesAdded: 1, linesRemoved: 0 },
    });
    expect(verdict.route).toBe('4b');
  });

  it.each([
    ['3 removed lines', { linesRemoved: 3 }],
    ['21 added lines', { linesAdded: 21 }],
  ])('rejects a guard claim contradicted by %s', (_label, diff) => {
    expect(at({ diff }).route).toBe('4b');
  });

  it.each([
    ['2 removed lines', { linesRemoved: 2 }],
    ['20 added lines', { linesAdded: 20 }],
  ])('accepts a guard claim at the boundary: %s', (_label, diff) => {
    expect(at({ diff }).route).toBe('4a');
  });

  it('names the measured number, never a bare shape mismatch', () => {
    const verdict = at({ diff: { linesRemoved: 7 } });
    expect(checkNamed(verdict, 'declare-vs-shape').evidence).toMatch(/7/);
    expect(checkNamed(verdict, 'declare-vs-shape').evidence).toMatch(/max 2/);
  });

  it.each([[undefined], [null], ['probably-fine'], ['']])(
    'treats declaredClass %p as unverifiable input',
    declaredClass => {
      const verdict = at({ declaredClass });
      expect(verdict.route).toBe('4b');
      expect(checkNamed(verdict, 'input-integrity').status).toBe('unknown');
    }
  );
});

describe('classifyFiles', () => {
  it('sorts production, test and non-code apart', () => {
    const files = classifyFiles([
      'src/screens/Account.tsx',
      'src/__tests__/Account.test.tsx',
      'src/util.spec.ts',
      'README.md',
      'LICENSE',
      '.github/workflows/ci.yml',
    ]);
    expect(files.production).toEqual(['src/screens/Account.tsx']);
    expect(files.test).toEqual([
      'src/__tests__/Account.test.tsx',
      'src/util.spec.ts',
    ]);
    expect(files.doc).toEqual([
      'README.md',
      'LICENSE',
      '.github/workflows/ci.yml',
    ]);
  });

  it('normalises windows separators and leading ./', () => {
    const files = classifyFiles(['mobile\\src\\a.ts', './b.ts']);
    expect(files.production).toEqual(['mobile/src/a.ts', 'b.ts']);
  });
});

describe('detectDependencyChanges', () => {
  it.each([
    ['package.json', true, false],
    ['mobile/package-lock.json', false, true],
    ['ios/Podfile', true, false],
    ['ios/Podfile.lock', false, true],
    ['android/build.gradle', true, false],
    ['yarn.lock', false, true],
  ])('%s -> manifest=%p lockfile=%p', (path, manifest, lockfile) => {
    const got = detectDependencyChanges([path]);
    expect(got.manifestChanged).toBe(manifest);
    expect(got.lockfileChanged).toBe(lockfile);
  });

  it('does not treat expo app.json as a dependency manifest', () => {
    // alate #536 changed mobile/app.json and was a legitimate 4a.
    const got = detectDependencyChanges(['mobile/app.json']);
    expect(got.manifestChanged).toBe(false);
    expect(got.lockfileChanged).toBe(false);
  });
});

describe('isRevertOfAutoFix', () => {
  it('matches a real revert subject', () => {
    expect(isRevertOfAutoFix(['Revert "fix(ALATE-1F): allow mailto"'])).toBe(
      true
    );
  });

  it('ignores a commit that merely mentions the word', () => {
    expect(isRevertOfAutoFix(['docs: explain how to revert a bad merge'])).toBe(
      false
    );
  });

  it('is false for an empty log', () => {
    expect(isRevertOfAutoFix([])).toBe(false);
  });
});

describe('summariseChecks', () => {
  it('zero checks is unknown, never a vacuous pass', () => {
    // The case the whole command exists to catch: a PR nothing verified.
    expect(summariseChecks([]).status).toBe('unknown');
    expect(summariseChecks([]).detail).toMatch(/zero checks/);
    expect(summariseChecks(null).status).toBe('unknown');
  });

  it('does not treat a skipped check as a failure', () => {
    // alate's own auto-merge job reports 'skipping' on every PR. Treating it
    // as red would refuse every merge in the repo.
    const got = summariseChecks([
      { name: 'mobile', bucket: 'pass' },
      { name: 'auto-merge', bucket: 'skipping' },
    ]);
    expect(got.status).toBe('pass');
    expect(got.detail).toMatch(/1 skipped/);
  });

  it.each([['fail'], ['cancel']])(
    'fails on a %s bucket and names the check',
    bucket => {
      const got = summariseChecks([
        { name: 'lint-mobile', bucket },
        { name: 'mobile', bucket: 'pass' },
      ]);
      expect(got.status).toBe('fail');
      expect(got.detail).toMatch(/lint-mobile/);
    }
  );

  it('is unknown while a check is still running — not yet is not yes', () => {
    const got = summariseChecks([
      { name: 'mobile', bucket: 'pending' },
      { name: 'backend', bucket: 'pass' },
    ]);
    expect(got.status).toBe('unknown');
  });

  it('passes when every check succeeded', () => {
    const got = summariseChecks([
      { name: 'mobile', bucket: 'pass' },
      { name: 'backend', bucket: 'pass' },
    ]);
    expect(got.status).toBe('pass');
    expect(got.detail).toBe('2/2 checks concluded success');
  });
});
