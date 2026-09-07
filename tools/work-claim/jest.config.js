// Jest config for the work-claim lib. lib/claim.js is pure over comment
// bodies and an injected env — no gh, no network in the tested surface — so
// the rule that decides "is someone already on this?" is directly testable,
// which is the whole reason it is a module and not prose in a skill.
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
