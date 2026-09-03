// Jest config for the device-test queue's parsing libs (queue-lib, claim-lib).
// Both are pure functions over comment bodies — no gh, no network — so they
// are directly testable, and they encode the ONLY machine-readable contract
// the queue has. Every rule in them was paid for by an item that fell off the
// board; the tests are what stop it happening twice.
//
// testMatch is left at the jest default deliberately, matching
// references/jest.config.js and hooks/jest.config.js: a `<rootDir>`-prefixed
// glob breaks on this repo's own worktree paths (`…/forge\.claude/…` —
// micromatch reads the `\.` as an escaped dot and matches nothing).
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
