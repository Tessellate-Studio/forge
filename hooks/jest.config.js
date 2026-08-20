// Jest config for the SessionStart hook's testable pieces. forge-freshness.mjs itself runs
// on import (it is an executable, not a module), so only the pure predicates extracted under
// hooks/lib/ are covered here. rootDir defaults to this file's directory.
//
// testMatch is left at the jest default deliberately, matching references/jest.config.js: a
// `<rootDir>`-prefixed glob breaks on this repo's own worktree paths (`…/forge\.claude/…` —
// micromatch reads the `\.` as an escaped dot and matches nothing).
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
