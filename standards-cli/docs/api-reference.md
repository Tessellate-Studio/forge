# API Reference

## Core SDK Functions

### `bp.init(options)`

Initialize a new project with best practices.

**Parameters:**
- `options` (Object)
  - `projectName` (string) - Name of the project
  - `template` (string) - Template to use ('web-app', 'api', 'library')
  - `autoSetupCI` (boolean) - Automatically configure GitHub Actions

**Returns:** Promise resolving to initialization result

**Example:**
```javascript
const bp = require('@company/code-directives');

await bp.init({
    projectName: 'my-awesome-app',
    template: 'web-app',
    autoSetupCI: true
});
```

### `bp.validate(options)`

Validate existing project against best practices standards.

**Parameters:**
- `options` (Object)
  - `path` (string) - Path to project directory
  - `standards` (Array) - Standards to check ['code', 'security', 'performance']
  - `autoFix` (boolean) - Automatically fix issues where possible

**Returns:** Promise resolving to validation results

**Example:**
```javascript
const result = await bp.validate({
    path: './my-project',
    standards: ['code', 'security', 'performance'],
    autoFix: true
});

console.log('Score:', result.score);
console.log('Issues:', result.issues);
console.log('Fixed:', result.fixed);
```

### `bp.generateDocs(options)`

Generate documentation with diagrams.

**Parameters:**
- `options` (Object)
  - `source` (string) - Source directory to document
  - `output` (string) - Output directory for documentation
  - `includeDiagrams` (boolean) - Generate Mermaid diagrams

**Returns:** Promise resolving to documentation generation result

**Example:**
```javascript
await bp.generateDocs({
    source: './src',
    output: './docs',
    includeDiagrams: true
});
```

## CLI Commands

### `cd init`

Initialize new project with best practices.

```bash
cd init --name my-project --template web-app --ci github-actions
```

**Options:**
- `--name` - Project name
- `--template` - Template type (web-app, api, library)
- `--ci` - CI platform (github-actions, gitlab-ci)

### `cd validate`

Run validation checks on current project.

```bash
cd validate --fix --standards code,security --report
```

**Options:**
- `--fix` - Automatically fix issues where possible
- `--standards` - Comma-separated list of standards to check
- `--report` - Generate detailed report

### `cd audit`

Generate comprehensive compliance audit report.

```bash
cd audit --output ./audit-report.json --format json
```

**Options:**
- `--output` - Output file path
- `--format` - Report format (json, html, markdown)

## Validation Results

### Result Object Structure

```javascript
{
    score: 85,              // Overall score (0-100)
    passed: true,           // Whether validation passed
    issues: [               // Array of issues found
        {
            file: 'src/app.js',
            line: 42,
            type: 'missing-comment',
            severity: 'warning',
            message: 'Function lacks descriptive comment',
            rule: 'enforce-comments'
        }
    ],
    fixed: [                // Array of auto-fixed issues
        {
            file: 'src/utils.js',
            line: 15,
            fix: 'Added error handling'
        }
    ],
    metrics: {              // Detailed metrics
        codeQuality: {
            score: 88,
            commentedFunctions: 45,
            totalFunctions: 52,
            longFunctions: 3
        },
        security: {
            score: 95,
            vulnerabilities: 0,
            secretsExposed: 0,
            dependenciesSecure: true
        },
        performance: {
            score: 78,
            bundleSize: '387KB',
            loadTime: '1.8s',
            apiResponseTime: '245ms'
        }
    }
}
```

## Configuration

### `.bp-config.yml`

Project configuration file for customizing standards and automation.

```yaml
version: "1.0.0"
project:
  name: "my-project"
  type: "web-app"

standards:
  code:
    enforceComments: true
    maxFunctionLines: 50
    testCoverage: 80
  
  security:
    scanSecrets: true
    vulnerabilityScan: true
    dependencyCheck: true
  
  performance:
    bundleSize: "500KB"
    loadTime: "2s"
    apiTimeout: "5s"

automation:
  github:
    autoPR: true
    claudeReview: true
    autoMerge: true
    branchProtection: true
  
  hooks:
    preCommit: true
    prePush: false
    commitMsg: true

reporting:
  format: "json"
  includeMetrics: true
  saveToDisk: true
```

## Validators

### CodeValidator

Validates code quality standards including comments, function length, and structure.

```javascript
const { CodeValidator } = require('@company/code-directives');

const validator = new CodeValidator({
    enforceComments: true,
    maxFunctionLines: 50,
    testCoverage: 80
});

const result = await validator.validate('./src');
```

### SecurityValidator

Scans for security vulnerabilities, exposed secrets, and dependency issues.

```javascript
const { SecurityValidator } = require('@company/code-directives');

const validator = new SecurityValidator({
    scanSecrets: true,
    auditDependencies: true,
    checkVulnerabilities: true
});

const result = await validator.validate('./project');
```

### PerformanceValidator

Checks bundle size, load times, and performance benchmarks.

```javascript
const { PerformanceValidator } = require('@company/code-directives');

const validator = new PerformanceValidator({
    maxBundleSize: '500KB',
    maxLoadTime: '2s',
    maxApiResponse: '500ms'
});

const result = await validator.validate('./build');
```

## Integrations

### GitHub Actions

Automated CI/CD integration with GitHub Actions.

```javascript
const { CiIntegration } = require('@company/code-directives');

const ci = new CiIntegration({
    platform: 'github-actions',
    autoMerge: true,
    runTests: true,
    securityScan: true
});

await ci.setupPipeline('./project');
```

### Claude Integration

Integration with Claude for automated code reviews.

```javascript
const { ClaudeIntegration } = require('@company/code-directives');

const claude = new ClaudeIntegration({
    autoReview: true,
    standards: ['code', 'security', 'performance'],
    feedback: 'detailed'
});

await claude.setupIntegration('./project');
```

## Templates

### Available Templates

- **web-app**: Full-stack web application
- **api**: REST API service
- **library**: Reusable library/package
- **cli**: Command-line interface tool

### Template Structure

Each template includes:
- Configured `package.json`
- ESLint and Prettier setup
- Jest testing configuration
- GitHub Actions workflows
- Documentation templates
- Example code

## Error Handling

### Common Error Types

- `ValidationError`: Standards validation failed
- `ConfigError`: Configuration file invalid
- `TemplateError`: Template not found or corrupted
- `IntegrationError`: CI/CD setup failed

### Error Example

```javascript
try {
    await bp.validate('./project');
} catch (error) {
    if (error.type === 'ValidationError') {
        console.log('Validation failed:', error.details);
    } else if (error.type === 'ConfigError') {
        console.log('Config invalid:', error.message);
    }
}
```

## Events and Hooks

### Available Events

- `validation:start` - Validation process started
- `validation:complete` - Validation process finished
- `fix:applied` - Auto-fix was applied
- `ci:setup` - CI/CD pipeline configured

### Event Example

```javascript
bp.on('validation:complete', (result) => {
    console.log('Validation completed with score:', result.score);
});
```