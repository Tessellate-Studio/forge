// Jest config for the workflow-payload suite. The scripts under
// references/workflows/ can't be require()d (injected globals, top-level
// await/return), so these tests load them through a vm harness — see
// __tests__/helpers/run-workflow.js. No coverage gate: the code under test runs
// inside a vm, which jest's instrumentation doesn't see, so a threshold here
// would measure only the harness. rootDir defaults to this file's directory.
//
// testMatch is left at the jest default deliberately: a `<rootDir>`-prefixed
// glob breaks on this repo's own worktree paths (`…/forge\.claude/worktrees/…`
// — micromatch reads the `\.` as an escaped dot and matches nothing). The
// default patterns would otherwise sweep up the harness under __tests__/helpers
// as a suite, so that directory is ignored by path regex instead.
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
};
