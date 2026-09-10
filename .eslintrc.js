module.exports = {
  // Stop config resolution here. Without it, ESLint keeps walking up past this
  // file — and forge's own worktrees live INSIDE the checkout, at
  // `.claude/worktrees/<name>/`, so linting from a worktree loaded the parent
  // checkout's copy of this config and then failed to resolve its
  // `extends: ['prettier']` against a `node_modules/` the parent may not have
  // installed. That broke `lint-staged`, so every commit from a worktree hit
  // "ESLint couldn't find the config prettier" and the only ways forward were
  // installing deps twice or `--no-verify`. A gate whose normal failure mode is
  // "bypass it" trains people to bypass it.
  root: true,
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
    jest: true,
  },
  // eslint-config-prettier MUST be last: it switches off every formatting rule
  // prettier already owns (indent, quotes, semi, brace-style, …).
  //
  // Without it the two tools fight on every commit. lint-staged runs
  // `eslint --fix` then `prettier --write`, so prettier reformats what eslint
  // just "fixed" and the error comes straight back — 1081 errors across the
  // repo, none of them about code quality, all of them noise that trained
  // everyone to ignore `lint:check`. A rule nobody can satisfy is not a rule.
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    // FORMATTING RULES LIVE IN PRETTIER, NOT HERE. indent / quotes / semi /
    // brace-style / no-trailing-spaces / eol-last were all declared in this
    // block, which meant they overrode eslint-config-prettier above and the
    // two tools fought on every commit — lint-staged runs `eslint --fix` then
    // `prettier --write`, so prettier reformatted what eslint had just
    // "fixed" and the error came straight back. 1081 errors repo-wide, none
    // about code quality. A rule nobody can satisfy is not a rule; it is noise
    // that teaches everyone to ignore the linter.
    //
    // Code quality rules aligned with Best Practices SDK
    // NOTE: no 'linebreak-style' rule on purpose. Line endings are owned by
    // .gitattributes (`* text=auto eol=lf`), which normalizes them in the index
    // and on checkout for every platform. Re-adding the eslint rule duplicates
    // that machinery and only ever fires on Windows checkouts.

    // Enforce meaningful variable names
    'id-length': ['warn', { min: 2, exceptions: ['i', 'j', 'k', '_'] }],

    // Function and complexity rules
    'max-lines-per-function': ['warn', { max: 50 }],
    complexity: ['warn', 10],
    'max-depth': ['warn', 4],

    // Error handling
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',

    // Security-related rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // Performance-related rules
    'no-loop-func': 'error',
    'no-caller': 'error',
    'no-extend-native': 'error',

    // Best practices
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],

    // eslint-config-prettier switches these three off with the formatting
    // rules, but they are not formatting — they catch real bugs prettier
    // neither fixes nor flags. no-unexpected-multiline is the ASI trap
    // (`const a = b` newline `(c)()` silently becomes a call); the other
    // two are genuine syntax smells. Re-enabled deliberately, the same way
    // curly is.
    'no-unexpected-multiline': 'error',
    'no-extra-semi': 'error',
    'no-mixed-spaces-and-tabs': 'error',

    // Async/await best practices
    'prefer-promise-reject-errors': 'error',
    'no-return-await': 'error',

    // Modern JavaScript features
    'prefer-const': 'error',
    'no-var': 'error',
    'prefer-arrow-callback': 'warn',
    'prefer-template': 'warn',

    // Documentation requirements (comments)
    'spaced-comment': ['error', 'always'],
    'lines-around-comment': [
      'warn',
      {
        beforeBlockComment: true,
        afterBlockComment: false,
        beforeLineComment: true,
        afterLineComment: false,
        allowBlockStart: true,
        allowObjectStart: true,
        allowArrayStart: true,
      },
    ],
  },

  // Override rules for test files
  overrides: [
    {
      // The hook executables are ES modules. Without this they parse as
      // scripts and fail on `import` — and before `--ext .js,.mjs` was added to
      // the lint scripts they were never linted at all, because ESLint 8 only
      // expands a directory to `*.js`. That hid all four hooks, including the
      // merge gate, behind a green lint:check (forge#115).
      files: ['**/*.mjs'],
      parserOptions: { sourceType: 'module' },
      env: { node: true },
    },
    {
      files: ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js'],
      env: {
        jest: true,
      },
      rules: {
        // Allow longer test functions
        'max-lines-per-function': 'off',

        // Allow console.log in tests
        'no-console': 'off',

        // Allow magic numbers in tests
        'no-magic-numbers': 'off',
      },
    },
    {
      files: ['cli/**/*.js'],
      rules: {
        // CLI scripts can use console.log
        'no-console': 'off',

        // CLI scripts may need process.exit
        'no-process-exit': 'off',
      },
    },
  ],
};
