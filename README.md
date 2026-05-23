# 📊 Rubric SDK

> **🚨 REPOSITORY DIRECTIVE: This package lives at `git@github.com:ramsaptami/rubric-sdk.git`**  
> **All commits and changes MUST be made to the dedicated repository, not to tessellate!**

> **A systematic approach to scoring, comparing, and prioritizing tasks before implementation**

The Rubric SDK provides a consistent framework for evaluating tasks, features, and projects using standardized scoring criteria. Make data-informed decisions and eliminate analysis paralysis.

## Clean Architecture & Dependency Model

This SDK follows a **clean dependency model** ensuring:

### ✅ Proper Integration
- **SDK provides scoring and prioritization logic only**
- **No business logic duplication in consuming projects**
- **Clean API boundary with well-defined responsibilities**
- **Import as npm dependency, not copied files**

### 🎯 SDK Responsibilities
- Task scoring algorithms
- Multi-criteria decision analysis
- Priority matrix calculations
- Report generation
- Configuration management

### 🏗️ Usage in Projects
When integrated into projects, Rubric SDK is used as:
```json
{
  "devDependencies": {
    "@company/rubric-sdk": "^1.0.0"
  }
}
```

```javascript
const rubric = require('@company/rubric-sdk');

// Evaluate tasks with scoring criteria
const results = await rubric.evaluate(task, {
  criteria: ['impact', 'complexity', 'reusability', 'strategic']
});
```

### 🤖 Autonomous scoring (`evaluateFromContext`)

For consumers that can't ask a human for the 4-axis scores — e.g. agents
running on a schedule — the SDK exposes `evaluateFromContext(input)`. It
takes a structured task + context and returns the full 4-axis 0-3 score
+ total + band + per-axis reasoning, deciding the scores via
transparent rule-based heuristics.

```javascript
const { evaluateFromContext } = require('@company/rubric-sdk');

const result = evaluateFromContext({
  title: 'Set up email aliases on tessellate.co.in',
  description: 'Compliance gap — privacy policy already published with privacy@ as the data-deletion address; emails bounce today.',
  context: {
    goals: ['Closed beta live', 'Privacy policy v3.2 published'],
    dependencies: {
      this_task_depends_on: [],
      this_task_unblocks: ['Reddit launch posts', 'Get in touch on BrandIntegration'],
    },
  },
});

// result = {
//   impact: 3, complexity: 3, reusability: 1, strategic: 3,
//   total: 10, band: 'Must',
//   reasoning: { impact: '…', complexity: '…', reusability: '…', strategic: '…' }
// }
```

The heuristics are documented in [`lib/evaluate-from-context.js`](lib/evaluate-from-context.js)
and are deliberately conservative for v1. When consumers (e.g. the
`roadmap-pulse` Claude skill) produce weekly outputs with real
follow-through data, those outcomes become training signal for
tightening the heuristics or swapping in an LLM-backed scorer.

### 🤝 Integration with Code Directives

Works alongside `@company/code-directives` for complete project management:

- **Code Directives**: Standards, validation, project scaffolding
- **Rubric SDK**: Task evaluation, prioritization, decision tracking

## Repository Information

- **Primary Repository**: `git@github.com:ramsaptami/rubric-sdk.git`
- **Package Name**: `@ramsaptami/rubric-sdk`
- **Development**: Always commit changes to the dedicated repository
- **Usage**: Install as dependency in other projects

## 🔄 Automated Development Workflow

This repository uses a comprehensive automated workflow system consistent across all team repositories to ensure code quality, proper review processes, and streamlined development.

### Branch Protection & Naming Conventions
- **Protected Branch**: `master` (direct commits blocked by pre-commit hooks)
- **All changes** must go through feature branches and pull requests
- **Standardized naming** ensures automated workflow triggers and proper PR categorization

### Supported Branch Types & Auto-PR Features

| Branch Pattern | Purpose | Auto-PR Title | Labels | Examples |
|----------------|---------|---------------|--------|----------|
| `feature/description` | New features and enhancements | ✨ Feature: [description] | `enhancement`, `auto-created` | `feature/automated-scoring` |
| `fix/description` | Bug fixes and corrections | 🐛 Fix: [description] | `bug`, `auto-created` | `fix/rubric-config-parsing` |
| `refactor/description` | Code restructuring without changing functionality | ♻️ Refactor: [description] | `refactoring`, `auto-created` | `refactor/evaluation-engine` |
| `docs/description` | Documentation updates | 📚 Docs: [description] | `documentation`, `auto-created` | `docs/scoring-framework-guide` |
| `hotfix/description` | Critical production fixes | 🚨 Hotfix: [description] | `hotfix`, `auto-created`, `priority-high` | `hotfix/scoring-calculation-error` |

### Complete Automated Process
1. **Create Feature Branch**: `git checkout -b feature/your-feature-name`
2. **Push Changes**: Triggers automatic PR creation with proper titles and labels
3. **Automated Checks**: Dependencies validation, tests, security audit
4. **Code Review**: Manual review with auto-generated checklist
5. **Auto-Merge**: Approved PRs merge automatically with cleanup

### Quick Start Development
```bash
# Feature development
git checkout master && git pull
git checkout -b feature/scoring-algorithm-improvements
# Make your changes
git push -u origin feature/scoring-algorithm-improvements
# PR created automatically with proper labels!

# Bug fix
git checkout -b fix/evaluation-timeout-error
# Fix issue and push - auto-PR created with bug labels

# Documentation update
git checkout -b docs/api-documentation-update
# Update docs and push - fast-track merge for docs
```

### Integration Setup for New Team Members

1. **Clone Repository**:
   ```bash
   git clone git@github.com:ramsaptami/rubric-sdk.git
   cd rubric-sdk
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
   git config alias.newfeature '!git checkout master && git pull && git checkout -b feature/$1'
   git config alias.newfix '!git checkout master && git pull && git checkout -b fix/$1'
   ```

4. **First Feature Branch**:
   ```bash
   git checkout -b feature/contributor-setup-complete
   echo "Setup completed by [your-name]" >> CONTRIBUTORS.md
   git add CONTRIBUTORS.md
   git commit -m "Add contributor setup completion"
   git push -u origin feature/contributor-setup-complete
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
- [ ] Branch is up to date with master

#### Issue: Wrong target branch
**Solution**:
```bash
# Verify repository default branch
git remote show origin
# Should show: HEAD branch: master
```

For detailed workflow examples and advanced scenarios, see [../../docs/PR_WORKFLOW_EXAMPLES.md](../../docs/PR_WORKFLOW_EXAMPLES.md)

## 🎯 Key Features

- **4-Dimension Scoring**: Impact, Complexity, Reusability, Strategic Fit
- **Configurable Weights**: Customize scoring priorities for your context
- **Multiple Output Formats**: JSON, Markdown, CSV, HTML reports
- **CLI Interface**: Easy-to-use command line tools
- **Evaluation History**: Track and analyze decisions over time
- **Team Calibration**: Consistent scoring across team members

## 🚀 Quick Start

### Installation

```bash
npm install -g @company/rubric-sdk
```

### Initialize Your Project

```bash
cd your-project
rubric init --interactive
```

### Evaluate Your First Task

```bash
rubric evaluate "Add user authentication system" --interactive
```

### Compare Multiple Options

```bash
rubric compare --interactive
```

### Generate Reports

```bash
rubric report --format markdown --output priority-report.md
```

## 📋 Scoring Framework

Each task is evaluated across four key dimensions (0-3 scale):

| Dimension | Description | Examples |
|-----------|-------------|----------|
| **Impact** | Value added to users/business | User satisfaction, revenue, efficiency |
| **Complexity/Cost** | Effort and resources required (inverse score) | Development time, technical difficulty, risk |
| **Reusability** | Cross-project potential | Libraries, components, patterns |
| **Strategic Fit** | Alignment with vision/roadmap | Company goals, product direction |

**Total Score** = Impact + Complexity + Reusability + Strategic Fit (Range: 0-12)  
**Decision**: 9-12 = Must have, 6-8 = Nice-to-have, 3-5 = Low priority, 0-2 = Reject

### Default Weights

- **Impact**: 35% - How much value it creates
- **Complexity**: 25% - Resource requirements (inverted)
- **Reusability**: 20% - Cross-project benefits  
- **Strategic Fit**: 20% - Vision alignment

## 🛠️ CLI Commands

### Core Commands

```bash
# Initialize configuration
rubric init [--profile startup|enterprise|research] [--interactive]

# Evaluate single task
rubric evaluate "Task description" --interactive [--save] [--evaluator "Name"]

# Compare multiple tasks
rubric compare --interactive [--file tasks.json] [--save]

# Generate reports
rubric report [--format json|markdown|csv|html] [--output file.ext]

# Manage configuration  
rubric config show
rubric config profiles
rubric config set weights.impact 0.4
```

### Advanced Usage

```bash
# Batch evaluation from file
rubric compare --file project-tasks.json --output comparison.html

# Filter reports by criteria
rubric report --priority high --period last-month --format csv

# Custom weights for specific evaluation
rubric evaluate "API optimization" --weights impact=0.5,complexity=0.3,reusability=0.1,strategic=0.1
```

## 📊 Configuration Profiles

### Startup Profile (Speed-focused)
```yaml
weights:
  impact: 0.50      # Maximize user value
  complexity: 0.30  # Consider effort
  reusability: 0.10 # Less important initially  
  strategic: 0.10   # Focused scope
```

### Enterprise Profile (Stability-focused)
```yaml
weights:
  impact: 0.25      # Balanced considerations
  complexity: 0.20  # Risk management
  reusability: 0.30 # Long-term efficiency
  strategic: 0.25   # Alignment critical
```

### Research Profile (Innovation-focused)
```yaml
weights:
  impact: 0.30      # Potential breakthrough
  complexity: 0.10  # Embrace challenges
  reusability: 0.25 # Build on learnings
  strategic: 0.35   # Vision alignment key
```

## 📈 Example Workflow

```bash
# 1. Initialize project with startup profile
rubric init --profile startup

# 2. Evaluate key features
rubric evaluate "User authentication" --interactive --save
rubric evaluate "Payment processing" --interactive --save  
rubric evaluate "Social sharing" --interactive --save

# 3. Compare all evaluations
rubric compare --file saved-tasks.json

# 4. Generate prioritized backlog
rubric report --format markdown --output backlog.md

# 5. Share with team
git add backlog.md
git commit -m "Add prioritized feature backlog"
```

## 🎛️ Advanced Features

### Custom Scoring Weights

```yaml
# rubric-config.yml
weights:
  impact: 0.40
  complexity: 0.30
  reusability: 0.20
  strategic: 0.10

thresholds:
  high_priority: 3
  medium_priority: 2
  low_priority: 1
```

### Batch Task Evaluation

```json
// tasks.json
[
  {
    "description": "Implement caching layer",
    "scores": { "impact": 4, "complexity": 3, "reusability": 5, "strategic": 3 },
    "evaluator": "Tech Lead",
    "notes": "Redis implementation"
  },
  {
    "description": "Add dark mode",
    "scores": { "impact": 2, "complexity": 2, "reusability": 3, "strategic": 2 },
    "evaluator": "Designer", 
    "notes": "CSS custom properties approach"
  }
]
```

### Report Filtering

```bash
# Filter by priority level
rubric report --priority high --format csv

# Filter by time period  
rubric report --period last-week --format html

# Filter by evaluator
rubric report --evaluator "John Doe" --format json
```

## 📚 API Usage

### Programmatic Usage

```javascript
const { RubricEngine, ReportGenerator } = require('@company/rubric-sdk');

// Create engine with custom config
const engine = new RubricEngine({
  weights: { impact: 0.4, complexity: 0.3, reusability: 0.2, strategic: 0.1 }
});

// Evaluate a task
const evaluation = await engine.evaluate(
  "Implement user notifications",
  { impact: 4, complexity: 3, reusability: 3, strategic: 4 }
);

console.log(`Priority: ${evaluation.priority}`);
console.log(`Score: ${evaluation.weightedScore}`);

// Compare multiple tasks
const tasks = [
  { description: "Feature A", scores: { impact: 5, complexity: 2, reusability: 4, strategic: 3 } },
  { description: "Feature B", scores: { impact: 3, complexity: 4, reusability: 2, strategic: 4 } }
];

const comparison = await engine.compareMultiple(tasks);
console.log(`Top priority: ${comparison.evaluations[0].task}`);

// Generate reports
const reporter = new ReportGenerator();
const htmlReport = await reporter.generate(comparison.evaluations, 'html');
```

## 🏗️ Integration Examples

### GitHub Actions

```yaml
# .github/workflows/feature-evaluation.yml
name: Feature Evaluation
on:
  pull_request:
    paths: ['features/*.json']

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Rubric SDK
        run: npm install -g @company/rubric-sdk
      - name: Evaluate Features
        run: |
          rubric compare --file features/proposed.json --output evaluation.md
          cat evaluation.md >> $GITHUB_STEP_SUMMARY
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
if [ -f "pending-features.json" ]; then
  echo "🔍 Evaluating pending features..."
  rubric compare --file pending-features.json --format table
fi
```

## 🎯 Best Practices

### Scoring Consistency
- Calibrate scoring with your team regularly
- Document your scoring rationale
- Use the same person for related evaluations
- Review actual vs predicted outcomes

### Decision Documentation
- Always save important evaluations (`--save`)
- Include evaluator name and notes
- Generate reports for major decisions
- Track scoring accuracy over time

### Team Workflow
- Establish clear scoring guidelines
- Use profiles for different project phases
- Regular team calibration sessions
- Share evaluation history and learnings

## 🔧 Configuration Files

### rubric-config.yml
```yaml
version: "1.0.0"
weights:
  impact: 0.35
  complexity: 0.25
  reusability: 0.20
  strategic: 0.20

thresholds:
  high_priority: 3
  medium_priority: 2
  low_priority: 1

settings:
  autoSave: true
  defaultFormat: "json"
  trackHistory: true
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/ramsaptami/rubric-sdk.git
cd rubric-sdk
npm install
npm test
```

### Running Tests

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run lint          # Code linting
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 Support

- **Documentation**: [Full documentation](docs/)
- **Issues**: [GitHub Issues](https://github.com/ramsaptami/rubric-sdk/issues)
- **Examples**: See [examples/](examples/) directory

---

**Made with ❤️ for better decision making**