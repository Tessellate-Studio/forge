# Best Practices SDK - Implementation Guide

## Quick Start

### Installation

```bash
npm install -g @company/best-practices-sdk
```

### Initialize New Project

```bash
bp init my-project
cd my-project
npm install
```

### Validate Existing Project

```bash
bp validate
```

## Project Templates

### Web Application Template
Full-stack web application with Express backend and frontend.

```bash
bp init my-web-app --template web-app
```

**Includes:**
- Express.js server with security middleware
- Frontend HTML/CSS/JS with modern practices  
- Environment configuration
- Health check endpoints
- Error handling and logging

### API Template
RESTful API with comprehensive validation and documentation.

```bash
bp init my-api --template api
```

**Includes:**
- Express.js REST API
- Request validation with express-validator
- Rate limiting and security headers
- Swagger documentation setup
- CRUD operations example

### Library Template
NPM package template for creating reusable libraries.

```bash
bp init my-library --template library
```

**Includes:**
- Modern JavaScript/TypeScript structure
- Build and bundling configuration
- Testing framework setup
- NPM publishing configuration

## Standards and Validation

### Code Quality Standards

#### In-line Comments
Every function must have a descriptive comment:

```javascript
// Calculate user engagement score based on activity metrics
function calculateEngagement(userData) {
  // Validate input parameters
  if (!userData || !userData.activities) {
    throw new Error('Invalid user data provided');
  }
  
  // Calculate weighted score
  const score = userData.activities.length * 10;
  return Math.min(score, 100);
}
```

#### Function Length
Maximum 50 lines per function for readability:

```javascript
// ✅ Good - concise and focused
function processUser(user) {
  validateUser(user);
  return formatUserData(user);
}

// ❌ Bad - too long, should be split
function processUserBad(user) {
  // ... 60+ lines of code
}
```

#### Error Handling
All functions must handle errors gracefully:

```javascript
// ✅ Good - proper error handling
async function fetchUserData(userId) {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch user:', error.message);
    throw new Error('User data unavailable');
  }
}
```

### Security Standards

#### No Hardcoded Secrets
Use environment variables for sensitive data:

```javascript
// ❌ Bad - hardcoded secret
const apiKey = "AKIA1234567890123456";

// ✅ Good - environment variable
const apiKey = process.env.API_KEY;
```

#### Input Validation
Validate and sanitize all user inputs:

```javascript
// ✅ Good - input validation
app.post('/users', [
  body('email').isEmail().normalizeEmail(),
  body('name').isLength({ min: 2, max: 50 }).trim().escape()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Process valid input
});
```

### Performance Standards

#### Bundle Size Optimization
Keep bundle sizes under 500KB:

```javascript
// ✅ Good - lazy loading
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// ✅ Good - tree shaking
import { specificFunction } from 'large-library';

// ❌ Bad - importing entire library
import * as library from 'large-library';
```

#### Avoid Performance Anti-patterns

```javascript
// ❌ Bad - console.log in production
console.log('Debug info:', data);

// ❌ Bad - nested loops
for (let i = 0; i < data.length; i++) {
  for (let j = 0; j < data[i].items.length; j++) {
    // Process item
  }
}

// ✅ Good - efficient processing
data.forEach(item => {
  item.items.forEach(subItem => {
    // Process item
  });
});
```

## CLI Commands

### Initialize Project
```bash
bp init <project-name> [options]

Options:
  -t, --template <type>  Project template (web-app, api, library)
  --no-github           Skip GitHub repository creation
  --no-ci               Skip CI/CD setup
```

### Validate Project
```bash
bp validate [options]

Options:
  -p, --path <path>     Project path to validate (default: ./)
  --fix                 Automatically fix issues where possible
  --report              Generate validation report
  --standards <list>    Standards to check (code,security,performance)
```

### Generate Audit Report
```bash
bp audit [options]

Options:
  -o, --output <file>   Output file for audit report
  --format <type>       Report format (json, html, markdown)
```

## Configuration

### .bp-config.yml
Project-specific configuration:

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
  
  performance:
    bundleSize: "500KB"
    loadTime: "2s"

automation:
  github:
    autoPR: true
    claudeReview: true
    autoMerge: true
```

### Package.json Integration
Add Best Practices SDK to your existing project:

```json
{
  "scripts": {
    "validate": "bp validate",
    "audit": "bp audit",
    "precommit": "bp validate --fix"
  },
  "bestPractices": {
    "standards": ["code", "security", "performance"],
    "autoFix": true
  }
}
```

## GitHub Integration

### Automated Workflow
The SDK sets up automated GitHub workflows:

1. **Push to Feature Branch** → Auto-creates PR
2. **PR Created** → Requests Claude code review  
3. **All Checks Pass + Claude Approves** → Auto-merges to main

### Manual Setup
If you need to set up GitHub integration manually:

```bash
# Ensure GitHub CLI is installed and authenticated
gh auth login

# Create repository
gh repo create my-project --public

# Set up branch protection
gh api repos/:owner/:repo/branches/main/protection \
  -X PUT --input protection-rules.json
```

## Testing Integration

### Unit Tests
SDK validators can be tested:

```javascript
const { CodeValidator } = require('@company/best-practices-sdk');

test('should validate code with comments', async () => {
  const validator = new CodeValidator({
    enforceComments: true,
    maxFunctionLines: 50
  });

  const result = await validator.validate('./src');
  expect(result.passed).toBe(true);
});
```

### Integration with Jest
Add to your Jest configuration:

```json
{
  "setupFilesAfterEnv": ["<rootDir>/tests/setup.js"],
  "collectCoverageFrom": [
    "src/**/*.js",
    "!src/**/*.test.js"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80
    }
  }
}
```

## Continuous Integration

### GitHub Actions Integration
The SDK automatically creates GitHub Actions workflows:

```yaml
# .github/workflows/ci.yml
name: CI Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run Best Practices validation
        run: npx bp validate --fix
```

### Pre-commit Hooks
Set up automatic validation before commits:

```bash
npm install --save-dev husky lint-staged

# Add to package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.js": [
      "bp validate --fix",
      "eslint --fix"
    ]
  }
}
```

## Troubleshooting

### Common Issues

#### "Command not found: bp"
Make sure the SDK is installed globally:
```bash
npm install -g @company/best-practices-sdk
```

#### "Validation failed: No package.json found"
Ensure you're running the command in a Node.js project directory.

#### "GitHub CLI not authenticated"
Authenticate with GitHub:
```bash
gh auth login
```

#### "Claude integration not working"
Verify GitHub CLI is set up and the repository has Claude integration enabled.

### Performance Issues

#### Large Bundle Size Warnings
- Use dynamic imports for large dependencies
- Implement code splitting
- Remove unused dependencies
- Use tree shaking

#### Slow Validation
- Exclude `node_modules` and build directories
- Use `.gitignore` patterns to skip unnecessary files
- Run validation on specific directories: `bp validate --path src/`

## Best Practices Summary

### Code Organization
- Keep functions under 50 lines
- Use meaningful variable names
- Add comments for all public functions
- Implement proper error handling

### Security
- Never commit secrets to version control
- Use environment variables for configuration
- Validate and sanitize all inputs
- Regular dependency updates

### Performance  
- Monitor bundle sizes
- Avoid performance anti-patterns
- Use efficient algorithms and data structures
- Implement proper caching strategies

### Development Workflow
- Use feature branches for all changes
- Let CI/CD handle testing and validation
- Allow Claude to review code automatically
- Keep dependencies up to date

## Support

- **Documentation**: https://github.com/ramsaptami/best-practices-sdk
- **Issues**: https://github.com/ramsaptami/best-practices-sdk/issues  
- **Examples**: See `/examples` directory in the repository