'use strict';

const { routeFix } = require('../lib/route');

// Condition 6 (forge#104). The healthy state is the same one route.test.js
// uses; each test changes only the device observation.
const state = deviceVerification => ({
  diff: {
    productionFiles: ['mobile/src/screens/AccountScreen.tsx'],
    testFiles: [],
    docFiles: [],
    manifestChanged: false,
    lockfileChanged: false,
    linesAdded: 6,
    linesRemoved: 0,
  },
  ci: { status: 'pass', detail: '9/9 checks succeeded' },
  cooldown: { status: 'clear', detail: 'no revert in 14d' },
  deviceVerification,
  declaredClass: 'guard',
});

const device = verdict =>
  verdict.checks.find(c => c.name === 'device-verified');

describe('device-verified — an open device test sends the fix to a human', () => {
  it('passes when no open test verifies the PR', () => {
    const verdict = routeFix(
      state({ status: 'clear', detail: 'no open device test verifies #643' })
    );
    expect(verdict.route).toBe('4a');
    expect(device(verdict).status).toBe('pass');
  });

  it('refuses when an open test verifies it, and says which', () => {
    const verdict = routeFix(
      state({
        status: 'pending',
        detail: 'alate#784 verifies #752 and is still open',
      })
    );
    expect(verdict.route).toBe('4b');
    expect(device(verdict).status).toBe('fail');
    expect(verdict.reasons).toContain(
      'device-verified: alate#784 verifies #752 and is still open'
    );
  });

  it('routes an unreadable queue to a human, never to a merge', () => {
    const verdict = routeFix(
      state({ status: 'unknown', detail: 'device tests could not be read' })
    );
    expect(verdict.route).toBe('4b');
    expect(device(verdict).status).toBe('unknown');
  });

  it('treats a missing observation as missing input, not as clear', () => {
    const verdict = routeFix(state(undefined));
    expect(verdict.route).toBe('4b');
    const integrity = verdict.checks.find(c => c.name === 'input-integrity');
    expect(integrity.evidence).toContain('deviceVerification');
  });
});
