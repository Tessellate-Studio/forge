# Code Standards SDK

> **Repository:** this package lives at `git@github.com:Tessellate-Studio/code-standards.git`
> (formerly `ramsaptami/code-directives` — old paths redirect).

Automated best practices enforcement for development projects with standardized workflows across all team repositories.

## Installation

```bash
# Install the CLI straight from GitHub (no npm publish needed)
npm install -g github:Tessellate-Studio/code-standards

# Then:
standards init my-app --template react-native
standards inspect --fix
standards audit --output report.json
```

## Clean Architecture & Dependency Model

This SDK follows a **clean dependency model** where:

### ✅ Proper Architecture
- **Generated projects contain only unique business logic**
- **SDKs are imported as npm dependencies, not copied**
- **No duplication of framework code in new projects**
- **Template files provide structure, not duplicate implementations**

### 🏗️ Project Structure
When you create a new project, it contains:
```
my-new-project/
├── src/                    # Your unique business logic
├── tests/                  # Your project tests
├── package.json           # Dependencies reference SDKs
├── .bp-config.yml         # Your project configuration  
├── README.md              # Project-specific documentation
└── .env.example           # Environment template
```

### 📦 Dependencies in Generated Projects
```json
{
  "devDependencies": {
    "@company/code-directives": "^1.0.0",  // Development standards
    "@company/rubric-sdk": "^1.0.0"        // Task tracking
  }
}
```

### 🚫 What's NOT Included
- ❌ Copied SDK source files
- ❌ Duplicated validation logic
- ❌ Cloned utility functions
- ❌ Template boilerplate in production code

## 🤝 Integration with Rubric SDK

Code Directives works seamlessly with `@company/rubric-sdk` for comprehensive project management:

### Separation of Concerns
- **Code Directives**: Development standards, validation, project generation
- **Rubric SDK**: Task scoring, prioritization, decision tracking

### Usage in Generated Projects
```javascript
// Use both SDKs as imported dependencies
const bp = require('@company/code-directives');
const rubric = require('@company/rubric-sdk');

// Validate project quality
const validation = await bp.validate({ autoFix: true });

// Score and prioritize tasks
const taskScores = await rubric.compare([
  { description: "Add authentication", impact: 5, complexity: 4 },
  { description: "Optimize queries", impact: 4, complexity: 3 }
]);
```

### Benefits of Clean Integration
✅ **No version conflicts** - Each SDK manages its own dependencies  
✅ **Easy updates** - `npm update` pulls latest versions  
✅ **Smaller projects** - No duplicated code  
✅ **Clear boundaries** - Each SDK has distinct responsibilities

## Repository Information

- **Primary Repository**: `git@github.com:ramsaptami/code-directives.git`
- **Package Name**: `@ramsaptami/code-directives`
- **Development**: Always commit changes to the dedicated repository
- **Usage**: Install as dependency in other projects

## 🔄 Automated Development Workflow

This repository uses a comprehensive automated workflow system to ensure code quality, consistency, and streamlined development across all team projects.

### Branch Protection & Naming Conventions
- **Protected Branch**: `main` (direct commits blocked by pre-commit hooks)
- **All changes** must go through feature branches and pull requests
- **Standardized naming** ensures automated workflow triggers and proper PR categorization

### Supported Branch Types & Auto-PR Features

| Branch Pattern | Purpose | Auto-PR Title | Labels | Examples |
|----------------|---------|---------------|--------|----------|
| `feature/description` | New features and enhancements | ✨ Feature: [description] | `enhancement`, `auto-created` | `feature/accessibility-validator` |
| `fix/description` | Bug fixes and corrections | 🐛 Fix: [description] | `bug`, `auto-created` | `fix/performance-check-timeout` |
| `refactor/description` | Code restructuring without changing functionality | ♻️ Refactor: [description] | `refactoring`, `auto-created` | `refactor/validation-engine` |
| `docs/description` | Documentation updates | 📚 Docs: [description] | `documentation`, `auto-created` | `docs/validation-api-guide` |
| `hotfix/description` | Critical production fixes | 🚨 Hotfix: [description] | `hotfix`, `auto-created`, `priority-high` | `hotfix/security-vulnerability` |

### Complete Automated Process
1. **Create Feature Branch**: `git checkout -b feature/your-feature-name`
2. **Push Changes**: Triggers automatic PR creation with proper titles and labels
3. **Automated Checks**: Dependencies validation, tests, security audit
4. **Code Review**: Manual review with auto-generated checklist
5. **Auto-Merge**: Approved PRs merge automatically with cleanup

### Quick Start Commands
```bash
# Feature development
git checkout main && git pull
git checkout -b feature/new-validation-rule
# Make changes, commit, and push
git push -u origin feature/new-validation-rule
# PR created automatically!

# Bug fix
git checkout -b fix/timeout-handling-error
# Fix issue and push - auto-PR created with bug labels

# Documentation update  
git checkout -b docs/api-reference-update
# Update docs and push - fast-track merge for docs
```

### Integration Setup for New Team Members

1. **Clone Repository**:
   ```bash
   git clone git@github.com:ramsaptami/code-directives.git
   cd code-directives
   npm install
   ```

2. **Verify Pre-commit Hooks**:
   ```bash
   # Hooks should be installed automatically
   # Test branch protection
   echo "test" > test.txt && git add test.txt
   git commit -m "test"  # Should be blocked with helpful message
   ```

3. **Configure Git Aliases** (Optional):
   ```bash
   git config alias.newfeature '!git checkout main && git pull && git checkout -b feature/$1'
   git config alias.newfix '!git checkout main && git pull && git checkout -b fix/$1'
   ```

4. **First Feature Branch**:
   ```bash
   git checkout -b feature/setup-complete
   echo "Setup completed by [your-name]" >> CONTRIBUTORS.md
   git add CONTRIBUTORS.md
   git commit -m "Add contributor setup completion"
   git push -u origin feature/setup-complete
   ```

### Troubleshooting Common Workflow Issues

#### Issue: Branch not triggering auto-PR
**Symptoms**: Pushed branch but no PR created
**Solutions**:
- Verify branch name matches pattern: `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `hotfix/*`
- Check GitHub Actions are enabled in repository settings
- Ensure you have proper repository permissions

#### Issue: Pre-commit hook not blocking direct commits
**Solutions**:
```bash
# Verify hook exists and is executable
ls -la .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Reinstall hooks if needed
npm install  # Hooks should reinstall automatically
```

#### Issue: Auto-merge not working
**Symptoms**: PR approved but not merging
**Checklist**:
- [ ] All status checks passed
- [ ] No merge conflicts
- [ ] Required approvals received
- [ ] No requested changes pending
- [ ] Branch is up to date with main

#### Issue: Wrong target branch
**Solution**:
```bash
# Verify repository default branch
git remote show origin
# Should show: HEAD branch: main
```

For detailed workflow examples and advanced scenarios, see [../../docs/PR_WORKFLOW_EXAMPLES.md](../../docs/PR_WORKFLOW_EXAMPLES.md)

## Features

- **Project Initialization**: Create new projects with best practices built-in
- **Code Validation**: Automated checking of code quality, security, and performance
- **Audit Reports**: Generate compliance reports in multiple formats
- **CI/CD Integration**: GitHub Actions workflows for automated enforcement
- **Documentation Generation**: Auto-generate project documentation

## Quick Start

```bash
# Initialize a new project (picks an app-type profile)
standards init my-project --template react-native

# Inspect code: secrets, vulnerable deps, performance, code + a11y standards
standards inspect --fix

# Generate audit report
standards audit --output report.json
```

To run the inspection as a CI gate, call the reusable workflow from your repo:

```yaml
jobs:
  inspect:
    uses: Tessellate-Studio/code-standards/.github/workflows/code-inspection.yml@main
    with:
      fail_on_error: false   # advisory; flip to true once tuned
```

## Configuration

Projects use `.bp-config.yml` to customize standards and automation settings.

For detailed usage and API documentation, see [docs/](docs/).
