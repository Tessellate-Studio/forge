const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

class CiIntegration {
  constructor(config = {}) {
    this.config = {
      platform: 'github-actions',
      autoMerge: true,
      runTests: true,
      securityScan: true,
      performanceCheck: true,
      ...config.ci
    };
  }

  // Setup CI/CD pipeline
  async setupPipeline(projectPath) {
    const cwd = projectPath || process.cwd();
    
    try {
      switch (this.config.platform) {
        case 'github-actions':
          return await this._setupGitHubActions(cwd);
        case 'gitlab-ci':
          return await this._setupGitLabCI(cwd);
        default:
          throw new Error(`Unsupported CI platform: ${this.config.platform}`);
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to setup CI pipeline: ${error.message}`,
        error
      };
    }
  }

  // Setup GitHub Actions workflows
  async _setupGitHubActions(projectPath) {
    const workflowsDir = path.join(projectPath, '.github', 'workflows');
    await fs.ensureDir(workflowsDir);

    // Create main CI workflow
    const ciWorkflow = this._generateCIWorkflow();
    await fs.writeFile(path.join(workflowsDir, 'ci.yml'), ciWorkflow);

    // Create release workflow
    const releaseWorkflow = this._generateReleaseWorkflow();
    await fs.writeFile(path.join(workflowsDir, 'release.yml'), releaseWorkflow);

    // Create security workflow
    const securityWorkflow = this._generateSecurityWorkflow();
    await fs.writeFile(path.join(workflowsDir, 'security.yml'), securityWorkflow);

    console.log('✅ GitHub Actions workflows created');

    return {
      success: true,
      message: 'GitHub Actions pipeline configured successfully',
      workflows: ['ci.yml', 'release.yml', 'security.yml']
    };
  }

  // Generate CI workflow YAML
  _generateCIWorkflow() {
    return `name: CI Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run Best Practices SDK validation
      run: standards inspect --fix
    
    - name: Run linting
      run: npm run lint
    
    - name: Run tests
      run: npm test -- --coverage
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        token: \${{ secrets.CODECOV_TOKEN }}

  security:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v4
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run security audit
      run: npm audit --audit-level=high
    
    - name: Run Best Practices security scan
      run: standards inspect --standards security

  performance:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v4
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build project
      run: npm run build
    
    - name: Run performance checks
      run: standards inspect --standards performance
    
    - name: Bundle size analysis
      run: |
        du -sh dist/ || echo "No dist folder found"
        du -sh build/ || echo "No build folder found"
`;
  }

  // Generate release workflow YAML
  _generateReleaseWorkflow() {
    return `name: Release

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  release:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v4
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run Best Practices validation
      run: standards inspect
    
    - name: Build project
      run: npm run build
    
    - name: Generate changelog
      run: |
        if [ ! -f CHANGELOG.md ]; then
          echo "# Changelog" > CHANGELOG.md
          echo "" >> CHANGELOG.md
        fi
    
    - name: Semantic Release
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
      run: |
        # Extract version from package.json
        VERSION=\$(node -p "require('./package.json').version")
        echo "Current version: \$VERSION"
        
        # Create git tag if not exists
        if ! git rev-parse v\$VERSION >/dev/null 2>&1; then
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git tag -a v\$VERSION -m "Release v\$VERSION"
          git push origin v\$VERSION
        fi
    
    - name: Create GitHub Release
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      run: |
        VERSION=\$(node -p "require('./package.json').version")
        gh release create v\$VERSION --generate-notes --title "Release v\$VERSION"
`;
  }

  // Generate security workflow YAML
  _generateSecurityWorkflow() {
    return `name: Security Scan

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 1'  # Weekly security scan

jobs:
  security:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js 18.x
      uses: actions/setup-node@v4
      with:
        node-version: 18.x
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run Best Practices security validation
      run: standards inspect --standards security --report
    
    - name: Run npm audit
      run: npm audit --audit-level=moderate
    
    - name: Run CodeQL Analysis
      uses: github/codeql-action/analyze@v2
      with:
        languages: javascript
    
    - name: Upload security report
      uses: actions/upload-artifact@v3
      with:
        name: security-report
        path: security-report.json
      if: always()
`;
  }

  // Setup GitLab CI
  async _setupGitLabCI(projectPath) {
    const gitlabCIContent = this._generateGitLabCI();
    await fs.writeFile(path.join(projectPath, '.gitlab-ci.yml'), gitlabCIContent);

    console.log('✅ GitLab CI pipeline created');

    return {
      success: true,
      message: 'GitLab CI pipeline configured successfully',
      file: '.gitlab-ci.yml'
    };
  }

  // Generate GitLab CI YAML
  _generateGitLabCI() {
    return `# Best Practices SDK GitLab CI Pipeline

stages:
  - validate
  - test
  - security
  - performance
  - deploy

variables:
  NODE_VERSION: "18"

.node_template: &node_template
  image: node:\${NODE_VERSION}
  before_script:
    - npm ci
  cache:
    paths:
      - node_modules/

validate:
  <<: *node_template
  stage: validate
  script:
    - standards inspect --fix
    - npm run lint
  artifacts:
    reports:
      junit: validation-report.xml
    paths:
      - validation-report.json

test:
  <<: *node_template
  stage: test
  script:
    - npm test -- --coverage
  coverage: '/Lines\\s*:\\s*(\\d+\\.?\\d*)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

security:
  <<: *node_template
  stage: security
  script:
    - npm audit --audit-level=high
    - standards inspect --standards security
  artifacts:
    reports:
      sast: security-report.json

performance:
  <<: *node_template
  stage: performance
  script:
    - npm run build
    - standards inspect --standards performance
  artifacts:
    paths:
      - performance-report.json

deploy:
  <<: *node_template
  stage: deploy
  script:
    - npm run build
    - echo "Deployment script here"
  only:
    - main
`;
  }

  // Setup branch protection rules
  async setupBranchProtection(repositoryPath) {
    try {
      const cwd = repositoryPath || process.cwd();
      
      // Enable branch protection for main branch
      const protectionRules = {
        required_status_checks: {
          strict: true,
          contexts: ['test', 'security', 'performance']
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: true
        },
        restrictions: null
      };

      // Use GitHub CLI to set branch protection
      execSync(`gh api repos/:owner/:repo/branches/main/protection -X PUT --input -`, {
        cwd,
        input: JSON.stringify(protectionRules),
        encoding: 'utf8'
      });

      console.log('✅ Branch protection rules configured');

      return {
        success: true,
        message: 'Branch protection rules configured successfully'
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to setup branch protection: ${error.message}`,
        error
      };
    }
  }

  // Generate status badge for README
  generateStatusBadge(repositoryUrl, branch = 'main') {
    const repoPath = repositoryUrl.replace('https://github.com/', '');
    
    return `[![CI Status](https://github.com/${repoPath}/workflows/CI%20Pipeline/badge.svg?branch=${branch})](https://github.com/${repoPath}/actions)
[![Security](https://github.com/${repoPath}/workflows/Security%20Scan/badge.svg)](https://github.com/${repoPath}/actions)
[![Best Practices](https://img.shields.io/badge/Best%20Practices-SDK-blue)](https://github.com/ramsaptami/best-practices-sdk)`;
  }
}

module.exports = CiIntegration;