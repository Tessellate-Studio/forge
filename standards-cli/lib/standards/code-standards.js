// Code quality standards and rules for the Best Practices SDK

const CodeStandards = {
  // Function and method standards
  functions: {
    maxLines: 50,
    requireComments: true,
    naming: {
      style: 'camelCase',
      descriptive: true,
      minLength: 3
    },
    errorHandling: {
      required: true,
      gracefulFallbacks: true,
      logErrors: true
    }
  },

  // Code structure standards
  structure: {
    fileSize: {
      maxLines: 300,
      warnAt: 200
    },
    imports: {
      grouping: true,
      sorting: 'alphabetical',
      noUnused: true
    },
    exports: {
      explicit: true,
      namedPreferred: true
    }
  },

  // Comment and documentation standards
  documentation: {
    functions: {
      requireComments: true,
      includeParams: true,
      includeReturns: true,
      includeExamples: false
    },
    files: {
      requireHeader: true,
      includeDescription: true,
      includeAuthor: false
    },
    inline: {
      complexLogic: true,
      businessRules: true,
      performance: true
    }
  },

  // Testing standards
  testing: {
    coverage: {
      minimum: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    structure: {
      unitTests: true,
      integrationTests: true,
      e2eTests: false
    },
    naming: {
      descriptive: true,
      includeShould: true
    }
  },

  // Security standards
  security: {
    secrets: {
      noHardcoded: true,
      useEnvVars: true,
      noCommit: true
    },
    validation: {
      inputSanitization: true,
      outputEncoding: true,
      sqlInjectionPrevention: true
    },
    dependencies: {
      auditRegularly: true,
      updateFrequently: true,
      trustworthy: true
    }
  },

  // Performance standards
  performance: {
    bundleSize: {
      maxKb: 500,
      warnAt: 300
    },
    asyncOperations: {
      usePromises: true,
      handleErrors: true,
      timeouts: true
    },
    memory: {
      avoidLeaks: true,
      cleanupListeners: true,
      releaseResources: true
    }
  },

  // Code style standards
  style: {
    indentation: {
      type: 'spaces',
      size: 2
    },
    semicolons: {
      required: true,
      trailing: false
    },
    quotes: {
      type: 'single',
      consistent: true
    },
    lineLength: {
      max: 100,
      wrap: true
    }
  }
};

module.exports = CodeStandards;