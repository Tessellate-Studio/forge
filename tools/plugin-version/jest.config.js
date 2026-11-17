// Jest config for the plugin-version bump check. lib/ is pure (the manifest
// reader is injected); the CLI test drives a throwaway git repo.
//
// testMatch is left at the jest default deliberately, matching the other tools'
// configs: a `<rootDir>`-prefixed glob breaks on this repo's own worktree paths.
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
