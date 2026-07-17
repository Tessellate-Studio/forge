const fs = require('fs');
const path = require('path');
const RepoStandards = require('../standards/repo-standards');

class MaintenanceValidator {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.standards = RepoStandards.maintenance;
  }

  validate() {
    const results = {
      passed: true,
      issues: [],
      warnings: [],
      summary: {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0
      }
    };

    this.validateDependenciesFile(results);
    this.validateSdkMapFile(results);
    
    results.summary.totalChecks = results.summary.passedChecks + results.summary.failedChecks;
    results.passed = results.summary.failedChecks === 0;
    
    return results;
  }

  validateDependenciesFile(results) {
    const { dependencies } = this.standards;
    const filePath = path.join(this.projectPath, dependencies.filename);
    
    results.summary.totalChecks++;
    
    if (!fs.existsSync(filePath)) {
      results.summary.failedChecks++;
      results.issues.push({
        type: 'missing_file',
        severity: 'error',
        file: dependencies.filename,
        message: `Missing required ${dependencies.filename} file`,
        description: dependencies.purpose,
        fix: `Create ${dependencies.filename} in project root with required sections`
      });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    this.validateFileStructure(content, dependencies, results);
    results.summary.passedChecks++;
  }

  validateSdkMapFile(results) {
    const { sdkMap } = this.standards;
    const filePath = path.join(this.projectPath, sdkMap.filename);
    
    results.summary.totalChecks++;
    
    if (!fs.existsSync(filePath)) {
      results.summary.failedChecks++;
      results.issues.push({
        type: 'missing_file',
        severity: 'error', 
        file: sdkMap.filename,
        message: `Missing required ${sdkMap.filename} file`,
        description: sdkMap.purpose,
        fix: `Create ${sdkMap.filename} in project root with required sections`
      });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    this.validateFileStructure(content, sdkMap, results);
    results.summary.passedChecks++;
  }

  validateFileStructure(content, standard, results) {
    const missingSections = [];
    
    standard.sections.forEach(section => {
      const sectionRegex = new RegExp(`#+\\s*${section}`, 'i');
      if (!sectionRegex.test(content)) {
        missingSections.push(section);
      }
    });

    if (missingSections.length > 0) {
      results.warnings.push({
        type: 'missing_sections',
        severity: 'warning',
        file: standard.filename,
        message: `Missing recommended sections in ${standard.filename}`,
        sections: missingSections,
        fix: `Add missing sections: ${missingSections.join(', ')}`
      });
    }

    if (content.trim().length < 100) {
      results.warnings.push({
        type: 'insufficient_content',
        severity: 'warning',
        file: standard.filename,
        message: `${standard.filename} appears to have minimal content`,
        fix: 'Add more detailed information about dependencies/SDKs'
      });
    }
  }

  generateTemplate(type) {
    if (type === 'dependencies') {
      return this.generateDependenciesTemplate();
    } else if (type === 'sdk-map') {
      return this.generateSdkMapTemplate();
    }
    throw new Error(`Unknown template type: ${type}`);
  }

  generateDependenciesTemplate() {
    return `# Dependencies

## Dependencies Overview

This document outlines the dependencies and relationships for this SDK.

## Upstream Dependencies

List SDKs or services that this SDK depends on:

- **SDK Name**: Description and relationship
- **Version**: Minimum required version
- **Purpose**: Why this dependency is needed

## Downstream Dependencies  

List projects or SDKs that depend on this SDK:

- **Project/SDK Name**: Description of how they use this SDK
- **Integration Points**: Key APIs or features they consume
- **Impact**: What breaks if this SDK changes

## Integration Points

Document key integration points and APIs:

- **Public APIs**: Main interfaces exposed by this SDK
- **Events/Hooks**: Event system and extension points  
- **Configuration**: Required configuration and setup
- **Data Flow**: How data moves between dependencies

## Maintenance Notes

- **Update Frequency**: How often dependencies should be reviewed
- **Breaking Changes**: Process for handling breaking changes
- **Testing**: How dependency changes are tested
- **Communication**: How to notify downstream dependencies of changes
`;
  }

  generateSdkMapTemplate() {
    return `# SDK Map

## SDK Overview

This document lists all SDKs used by this project and their purposes.

## Core SDKs

Essential SDKs required for core functionality:

| SDK Name | Version | Purpose | Status |
|----------|---------|---------|---------|
| @company/auth-sdk | ^2.1.0 | Authentication and authorization | Active |
| @company/data-sdk | ^1.5.0 | Data access and persistence | Active |

## Development SDKs

SDKs used for development, testing, and tooling:

| SDK Name | Version | Purpose | Status |
|----------|---------|---------|---------|
| @company/test-sdk | ^1.2.0 | Testing utilities and mocks | Active |
| @company/build-sdk | ^0.8.0 | Build and deployment tools | Active |

## Integration SDKs

SDKs for external service integrations:

| SDK Name | Version | Purpose | Status |
|----------|---------|---------|---------|
| @company/notifications-sdk | ^1.0.0 | Push notifications and alerts | Active |
| @company/analytics-sdk | ^2.0.0 | Usage analytics and tracking | Active |

## Version Management

- **Update Policy**: SDKs are updated monthly unless security fixes are needed
- **Compatibility**: Maintain backward compatibility for at least 2 major versions
- **Testing**: All SDK updates must pass integration tests before deployment
- **Documentation**: Changes documented in CHANGELOG.md and communicated via team channels

## Deprecation Process

1. **Notice**: 90-day notice before deprecating any SDK
2. **Migration Guide**: Provide clear migration path to replacement
3. **Support**: Continue security fixes during deprecation period
4. **Removal**: Remove deprecated SDKs after notice period expires
`;
  }
}

module.exports = MaintenanceValidator;