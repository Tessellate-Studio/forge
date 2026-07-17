// Jest config for the rubric suite (moved verbatim from the old rubric-sdk
// package.json inline block — same 80% gates). rootDir defaults to this
// file's directory, so all patterns are rubric/-relative.
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['lib/**/*.js', 'cli/**/*.js', '!**/node_modules/**'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
