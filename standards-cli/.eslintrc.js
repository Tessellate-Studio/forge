module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    // Code quality rules aligned with Best Practices SDK
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    
    // Enforce meaningful variable names
    'id-length': ['warn', { min: 2, exceptions: ['i', 'j', 'k', '_'] }],
    
    // Function and complexity rules
    'max-lines-per-function': ['warn', { max: 50 }],
    'complexity': ['warn', 10],
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
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    
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
    'lines-around-comment': ['warn', {
      beforeBlockComment: true,
      afterBlockComment: false,
      beforeLineComment: true,
      afterLineComment: false,
      allowBlockStart: true,
      allowObjectStart: true,
      allowArrayStart: true
    }]
  },
  
  // Override rules for test files
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js'],
      env: {
        jest: true
      },
      rules: {
        // Allow longer test functions
        'max-lines-per-function': 'off',
        // Allow console.log in tests
        'no-console': 'off',
        // Allow magic numbers in tests
        'no-magic-numbers': 'off'
      }
    },
    {
      files: ['cli/**/*.js'],
      rules: {
        // CLI scripts can use console.log
        'no-console': 'off',
        // CLI scripts may need process.exit
        'no-process-exit': 'off'
      }
    }
  ]
};