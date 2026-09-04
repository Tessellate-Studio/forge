// Jest config for safe-merge's routing decision. lib/route.js is pure — the
// caller observes gh and git and passes the results in — so the rule that
// decides whether code merges unreviewed is directly testable, which is the
// entire point of extracting it from prose.
//
// testMatch is left at the jest default deliberately, matching
// references/jest.config.js, hooks/jest.config.js and
// skills/device-test/jest.config.js: a `<rootDir>`-prefixed glob breaks on
// this repo's own worktree paths (`…/forge\.claude/…` — micromatch reads the
// `\.` as an escaped dot and matches nothing).
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
