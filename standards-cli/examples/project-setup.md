# Project Setup with Code Directives SDK

This example shows how to set up a new project using the Code Directives SDK **without duplicating files**.

## Method 1: Using the SDK to Initialize a Project

```bash
# Install SDK globally
npm install -g @company/code-directives

# Initialize new project
bp init my-awesome-project --template web-app
cd my-awesome-project

# Install dependencies (SDK is included as dev dependency)
npm install

# Validate project
bp validate --fix
```

## Method 2: Adding SDK to Existing Project

```bash
cd existing-project

# Install SDK as dev dependency
npm install --save-dev @company/code-directives

# Create configuration file
cat > .bp-config.yml << 'EOF'
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
EOF

# Run validation
npx bp validate --standards code,security,performance --fix

# Generate audit report
npx bp audit --output audit-report.json
```

## Method 3: CI/CD Integration

Create `.github/workflows/ci.yml`:

```yaml
name: CI with Code Directives

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # Use reusable Code Directives validation
  validate:
    uses: ramsaptami/code-directives/.github/workflows/validate.yml@main
    with:
      standards: 'code,security,performance'
      auto_fix: false
      generate_report: true
      node_version: '18'
    secrets: inherit

  # Your regular CI jobs
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run build
```

## Project Structure

With this approach, your project stays clean:

```
my-project/
├── .bp-config.yml          # Small config file (50 lines)
├── package.json            # SDK as devDependency
├── .github/workflows/      # Uses reusable workflows
├── src/                    # Your actual code
└── tests/                  # Your tests

# NO duplication of SDK files!
```

## Key Benefits

1. **No File Duplication**: SDK stays as an npm package
2. **Easy Updates**: `npm update @company/code-directives`
3. **Consistent Standards**: All projects use same validation rules
4. **Reusable Workflows**: CI/CD workflows are shared and maintained centrally
5. **Configuration Over Convention**: Projects only override what they need

## Configuration Examples

### Minimal Configuration
```yaml
# .bp-config.yml
standards:
  code:
    enforceComments: true
    testCoverage: 80
```

### Complete Configuration
```yaml
# .bp-config.yml
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

## Programmatic Usage

```javascript
// In your build scripts or tools
const sdk = require('@company/code-directives');

async function validate() {
    const result = await sdk.validate({
        path: './',
        standards: ['code', 'security', 'performance'],
        autoFix: true
    });
    
    if (!result.passed) {
        console.error(`Validation failed with score: ${result.score}/100`);
        process.exit(1);
    }
    
    console.log(`✅ Validation passed with score: ${result.score}/100`);
}

validate();
```