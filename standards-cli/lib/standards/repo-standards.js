// Repository structure and organization standards

const RepoStandards = {
  // Required files in repository root
  requiredFiles: [
    'README.md',
    'CHANGELOG.md', 
    '.gitignore',
    'package.json',
    'LICENSE'
  ],

  // Required directories structure
  structure: {
    src: {
      required: false,
      purpose: 'Source code directory'
    },
    lib: {
      required: true,
      purpose: 'Library/core functionality'
    },
    docs: {
      required: true,
      purpose: 'Documentation files'
    },
    tests: {
      required: true,
      purpose: 'Test files and test utilities'
    },
    examples: {
      required: true,
      purpose: 'Usage examples and demos'
    },
    templates: {
      required: true,
      purpose: 'Project templates and boilerplate'
    }
  },

  // README.md standards
  readme: {
    sections: [
      'Title/Project Name',
      'Description/Overview',
      'Installation Instructions',
      'Usage Examples',
      'API Documentation',
      'Contributing Guidelines',
      'License Information'
    ],
    badges: {
      ciStatus: true,
      coverage: true,
      version: true,
      license: true
    },
    codeExamples: true,
    tableOfContents: false
  },

  // Git configuration standards
  git: {
    branches: {
      main: 'main',
      develop: 'develop',
      feature: 'feature/*',
      hotfix: 'hotfix/*',
      release: 'release/*'
    },
    protection: {
      main: {
        required: true,
        reviews: 1,
        statusChecks: true,
        dismissStaleReviews: true,
        enforceAdmin: true
      }
    },
    hooks: {
      preCommit: true,
      commitMsg: true,
      prePush: false
    }
  },

  // Version management standards
  versioning: {
    scheme: 'semantic', // MAJOR.MINOR.PATCH
    automation: true,
    changelog: {
      required: true,
      format: 'keepachangelog',
      automated: true
    },
    tagging: {
      required: true,
      format: 'v{version}',
      signTags: false
    }
  },

  // License standards
  license: {
    required: true,
    types: ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause'],
    fileLocation: 'LICENSE',
    includeCopyright: true
  },

  // Commit message standards
  commits: {
    format: 'conventional',
    types: [
      'feat',     // New feature
      'fix',      // Bug fix
      'docs',     // Documentation changes
      'style',    // Formatting changes
      'refactor', // Code refactoring
      'perf',     // Performance improvements
      'test',     // Test changes
      'chore'     // Build/tooling changes
    ],
    scope: {
      required: false,
      examples: ['api', 'ui', 'docs', 'config']
    },
    breakingChanges: {
      footer: 'BREAKING CHANGE:',
      exclamation: true // feat!: breaking change
    }
  },

  // Package.json standards
  packageJson: {
    required: [
      'name',
      'version',
      'description',
      'main',
      'scripts',
      'repository',
      'keywords',
      'author',
      'license'
    ],
    scripts: {
      required: [
        'test',
        'lint',
        'start'
      ],
      recommended: [
        'test:unit',
        'test:integration',
        'build',
        'dev',
        'validate'
      ]
    },
    engines: {
      node: '>=16.0.0',
      npm: '>=7.0.0'
    }
  },

  // .gitignore standards
  gitignore: {
    nodeModules: true,
    buildArtifacts: ['dist/', 'build/', 'out/'],
    logs: ['*.log', 'logs/'],
    environment: ['.env', '.env.local'],
    ide: ['.vscode/', '*.swp', '*.swo'],
    os: ['.DS_Store', 'Thumbs.db'],
    coverage: ['coverage/', '*.lcov']
  },

  // Security standards
  security: {
    secretsScanning: true,
    dependencyScanning: true,
    codeScanning: true,
    securityPolicy: false,
    vulnerabilityReporting: true
  },

  // Maintenance standards
  maintenance: {
    dependencies: {
      required: true,
      filename: 'dependencies.md',
      location: 'root',
      purpose: 'Documents SDK dependencies and relationships',
      sections: [
        'Dependencies Overview',
        'Upstream Dependencies',
        'Downstream Dependencies', 
        'Integration Points',
        'Maintenance Notes'
      ]
    },
    sdkMap: {
      required: true,
      filename: 'sdk-map.md',
      location: 'root',
      purpose: 'Lists all SDKs used by the project',
      sections: [
        'SDK Overview',
        'Core SDKs',
        'Development SDKs',
        'Integration SDKs',
        'Version Management'
      ]
    }
  }
};

module.exports = RepoStandards;