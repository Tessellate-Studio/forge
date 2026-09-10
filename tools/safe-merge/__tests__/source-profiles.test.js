'use strict';

const { routeFix, isDataIntegrityPath } = require('../lib/route');

// A healthy observation; each test states only what it changes.
const state = (over = {}) => ({
  diff: {
    productionFiles: ['mobile/src/screens/AccountScreen.tsx'],
    testFiles: [],
    docFiles: [],
    manifestChanged: false,
    lockfileChanged: false,
    linesAdded: 6,
    linesRemoved: 0,
    ...(over.diff || {}),
  },
  ci: { status: 'pass', detail: '9/9 checks succeeded', ...(over.ci || {}) },
  cooldown: { status: 'clear', detail: 'no revert in 14d' },
  deviceVerification: { status: 'clear', detail: 'no open device test' },
  declaredClass: 'declaredClass' in over ? over.declaredClass : 'guard',
  source: over.source,
});

const check = (verdict, name) => verdict.checks.find(c => c.name === name);

describe('security-sweep — lockfile-only, through the same gate (forge#86)', () => {
  const lockfilePatch = {
    source: 'security-sweep',
    declaredClass: undefined,
    diff: {
      productionFiles: ['backend/package-lock.json'],
      lockfileChanged: true,
      linesAdded: 412,
      linesRemoved: 380,
    },
  };

  it('merges an npm audit fix that touched only the lockfile, with no --declare', () => {
    const verdict = routeFix(state(lockfilePatch));
    expect(verdict.reasons).toEqual([]);
    expect(verdict.route).toBe('4a');
    expect(check(verdict, 'dependencies').evidence).toContain('lockfile-only');
  });

  it('prints what it did not check, and why, instead of hiding it', () => {
    const verdict = routeFix(state(lockfilePatch));
    for (const name of ['single-production-file', 'declare-vs-shape']) {
      expect(check(verdict, name).status).toBe('skipped');
      expect(check(verdict, name).evidence).toContain('security-sweep');
    }
  });

  it('refuses when app code rides along with the lockfile', () => {
    const verdict = routeFix(
      state({
        ...lockfilePatch,
        diff: {
          productionFiles: ['backend/package-lock.json', 'backend/api/ai.js'],
        },
      })
    );
    expect(verdict.route).toBe('4b');
    expect(check(verdict, 'dependencies').evidence).toContain(
      'backend/api/ai.js'
    );
  });

  it('refuses a manifest bump — that lane goes to a human (alate#203)', () => {
    const verdict = routeFix(
      state({
        ...lockfilePatch,
        diff: { productionFiles: ['package.json', 'package-lock.json'] },
      })
    );
    expect(verdict.route).toBe('4b');
    expect(check(verdict, 'dependencies').status).toBe('fail');
  });

  it('still waits for CI', () => {
    const verdict = routeFix(
      state({ ...lockfilePatch, ci: { status: 'fail' } })
    );
    expect(verdict.route).toBe('4b');
  });
});

describe('roadmap-pulse — a multi-file feature, still gated (forge#86)', () => {
  const feature = {
    source: 'roadmap-pulse',
    declaredClass: undefined,
    diff: {
      productionFiles: [
        'mobile/src/screens/HistoryScreen.tsx',
        'mobile/src/components/StatsHeader.tsx',
        'mobile/src/hooks/useHistoryFilters.ts',
      ],
      linesAdded: 240,
      linesRemoved: 60,
    },
  };

  it('merges a green multi-file feature without --declare', () => {
    const verdict = routeFix(state(feature));
    expect(verdict.reasons).toEqual([]);
    expect(check(verdict, 'single-production-file').status).toBe('skipped');
  });

  it('refuses one that adds a dependency', () => {
    const verdict = routeFix(
      state({
        ...feature,
        diff: { ...feature.diff, manifestChanged: true },
      })
    );
    expect(verdict.route).toBe('4b');
  });

  it('refuses one that touches sync', () => {
    const verdict = routeFix(
      state({
        ...feature,
        diff: {
          ...feature.diff,
          productionFiles: [
            ...feature.diff.productionFiles,
            'mobile/src/services/syncService.ts',
          ],
        },
      })
    );
    expect(verdict.route).toBe('4b');
    expect(check(verdict, 'data-integrity-path').status).toBe('fail');
  });
});

describe('an unknown source never buys a lighter gate', () => {
  it('a typo in --source gets every condition', () => {
    const verdict = routeFix(
      state({
        source: 'roadmap-puls',
        diff: { productionFiles: ['a.ts', 'b.ts'] },
      })
    );
    expect(verdict.checks.some(c => c.status === 'skipped')).toBe(false);
    expect(verdict.route).toBe('4b');
  });

  it('crash-monitor still has to declare', () => {
    const verdict = routeFix(
      state({ source: 'crash-monitor', declaredClass: undefined })
    );
    expect(verdict.route).toBe('4b');
    expect(check(verdict, 'input-integrity').evidence).toContain(
      'declaredClass'
    );
  });
});

describe('data-integrity paths go to a human (forge#87)', () => {
  it.each([
    'mobile/src/services/syncService.ts',
    'mobile/src/hooks/useAuthSync.ts',
    'mobile/src/lib/storage.ts',
    'mobile/src/store/persistence/index.ts',
    'supabase/migrations/20260910_add_fit_index.sql',
    'mobile/src/store/migrate.ts',
  ])('%s', path => {
    expect(isDataIntegrityPath(path)).toBe(true);
  });

  it.each([
    'mobile/src/utils/asyncUtils.ts',
    'mobile/src/screens/AccountScreen.tsx',
    'mobile/app.json',
    'backend/package-lock.json',
    'mobile/src/components/AsyncImage.tsx',
  ])('not %s', path => {
    expect(isDataIntegrityPath(path)).toBe(false);
  });

  it('refuses a one-line crash fix in sync code that passes everything else', () => {
    const verdict = routeFix(
      state({
        source: 'crash-monitor',
        diff: { productionFiles: ['mobile/src/services/syncService.ts'] },
      })
    );
    expect(verdict.reasons).toEqual([
      'data-integrity-path: mobile/src/services/syncService.ts — sync/persistence/migration changes go to a human',
    ]);
  });

  it('judges production files only — a sync TEST alongside a screen fix is fine', () => {
    const verdict = routeFix(
      state({
        diff: {
          productionFiles: ['mobile/src/screens/AccountScreen.tsx'],
          testFiles: ['mobile/src/__tests__/syncService.test.ts'],
        },
      })
    );
    expect(verdict.route).toBe('4a');
  });
});
