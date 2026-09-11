// Jest config for checks-gate's decision logic. lib/gate.js is pure — the CLI
// reads gh and passes the output in, and the clock and sleep are injected — so
// the rule that decides "green enough to merge" is testable without waiting on
// a real CI run.
//
// testMatch is left at the jest default deliberately, matching the other tools'
// configs: a `<rootDir>`-prefixed glob breaks on this repo's own worktree paths
// (`…/forge\.claude/…` — micromatch reads the `\.` as an escaped dot).
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
