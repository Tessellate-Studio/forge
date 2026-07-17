// Development workflow and process standards

const WorkflowStandards = {
  // Development workflow process
  development: {
    branchingStrategy: 'gitflow',
    featureBranches: {
      naming: 'feature/feature-name',
      shortLived: true,
      reviewRequired: true,
      testsRequired: true
    },
    pullRequests: {
      template: true,
      description: {
        required: true,
        sections: ['Summary', 'Changes', 'Testing', 'Checklist']
      },
      reviews: {
        required: 1,
        codeOwners: false,
        dismissStale: true
      },
      checks: {
        ci: true,
        tests: true,
        lint: true,
        security: true,
        coverage: true
      }
    }
  },

  // Continuous Integration standards
  ci: {
    platform: ['github-actions', 'gitlab-ci', 'circle-ci'],
    triggers: {
      push: ['main', 'develop'],
      pullRequest: ['main'],
      schedule: true
    },
    jobs: {
      test: {
        required: true,
        matrix: ['node16', 'node18', 'node20'],
        coverage: true,
        artifacts: true
      },
      lint: {
        required: true,
        autofix: false,
        fail: true
      },
      security: {
        required: true,
        auditLevel: 'high',
        secretScan: true,
        dependencyScan: true
      },
      build: {
        required: true,
        artifacts: true,
        cache: true
      }
    },
    notifications: {
      slack: false,
      email: false,
      github: true
    }
  },

  // Code review standards
  review: {
    checklist: [
      'Code follows style guidelines',
      'Comments explain complex logic',
      'Tests cover new functionality',
      'No security vulnerabilities',
      'Performance impact considered',
      'Documentation updated',
      'Breaking changes noted'
    ],
    automation: {
      claudeReview: true,
      staticAnalysis: true,
      securityScan: true,
      performanceCheck: true
    },
    response: {
      timeLimit: '24 hours',
      autoApprove: false,
      requireManual: true
    }
  },

  // Release management standards
  release: {
    versioning: 'semantic',
    automation: {
      versionBump: true,
      changelog: true,
      tagging: true,
      publishing: true
    },
    approval: {
      required: false,
      maintainers: true
    },
    testing: {
      fullSuite: true,
      stagingDeploy: false,
      smokeTest: true
    },
    rollback: {
      automated: false,
      plan: true
    }
  },

  // Quality gates standards
  qualityGates: {
    merge: {
      testsPassing: true,
      lintPassing: true,
      coverageThreshold: 80,
      securityScanPassing: true,
      reviewApproved: true
    },
    deployment: {
      allChecks: true,
      manualApproval: false,
      stagingFirst: false
    },
    hotfix: {
      fastTrack: true,
      reducedChecks: false,
      postDeployVerification: true
    }
  },

  // Documentation standards
  documentation: {
    codeComments: {
      functions: true,
      complexLogic: true,
      businessRules: true,
      apis: true
    },
    external: {
      readme: true,
      apiDocs: true,
      examples: true,
      changelog: true,
      contributingGuide: true
    },
    maintenance: {
      keepUpdated: true,
      reviewWithCode: true,
      versionSync: true
    }
  },

  // Testing standards
  testing: {
    types: {
      unit: {
        required: true,
        coverage: 80,
        fast: true,
        isolated: true
      },
      integration: {
        required: true,
        coverage: 70,
        realistic: true,
        external: false
      },
      e2e: {
        required: false,
        coverage: 50,
        critical: true,
        slow: true
      }
    },
    automation: {
      preCommit: false,
      preBuild: true,
      schedule: false,
      onDeploy: true
    },
    reporting: {
      coverage: true,
      results: true,
      trends: true,
      artifacts: true
    }
  },

  // Environment standards
  environments: {
    development: {
      required: true,
      hotReload: true,
      debugging: true,
      mockServices: true
    },
    staging: {
      required: false,
      production: false,
      testing: true,
      deployment: true
    },
    production: {
      required: true,
      monitoring: true,
      logging: true,
      backup: true,
      security: true
    }
  }
};

module.exports = WorkflowStandards;