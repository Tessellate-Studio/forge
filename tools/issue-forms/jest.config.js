// Jest config for an RFD 004 work-item tool. Every test is offline: the gh
// runner is injected, so nothing here can reach GitHub.
//
// testMatch is left at the jest default deliberately, matching
// tools/work-claim/jest.config.js: a `<rootDir>`-prefixed glob breaks on this
// repo's own worktree paths (`…/forge\.claude/…` — micromatch reads the `\.`
// as an escaped dot and matches nothing).
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
