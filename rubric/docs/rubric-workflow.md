# 📊 Rubric SDK – Workflow

## 🎯 Purpose
The **Rubric SDK** provides a consistent way to **score, compare, and prioritize tasks, features, hooks, or commands** before implementation.  
It ensures decisions are transparent, repeatable, and data-informed.  
This is both for **personal use** (individual projects) and **project-level planning**.

---

## 🧩 Scoring Dimensions
Each item is scored across the following criteria (0–3 scale):  

1. **Impact** → How much value it adds to users or business.  
2. **Complexity** → Level of effort/resources needed.  
3. **Reusability** → Can this be used across multiple apps/projects?  
4. **Strategic Fit** → Alignment with vision, SDK-first modularity, and roadmap.  

👉 Scores can be averaged or weighted depending on context.  

---

## 🛠️ Workflow

```mermaid
flowchart TD

A[New Idea/Task] 
  --> B[Rubric Evaluation<br>(Impact, Complexity, Reusability, Strategic Fit)]

B -->|Generate Scores| C[Rubric Report<br>(JSON/Markdown Table)]

C --> D[Review & Approval]
D -->|If approved| E[Spec Creation<br>(spec-sdk)]
D -->|If not approved| F[Archive/Backlog]

E --> G[Implementation Phase]
F --> H[Future Consideration]

G --> I[Post-Implementation Review]
I --> J[Update Rubric Weights<br>Based on Outcomes]
```

---

## 📋 Usage Examples

### 1. Individual Task Evaluation
```bash
# Evaluate a single task or feature
rubric evaluate "Add user authentication system"

# Interactive scoring
rubric evaluate --interactive

# Use custom weights
rubric evaluate "API rate limiting" --weights impact=0.4,complexity=0.3,reusability=0.2,strategic=0.1
```

### 2. Batch Evaluation
```bash
# Evaluate multiple tasks from a file
rubric evaluate --batch tasks.json

# Compare multiple options
rubric compare "Option A" "Option B" "Option C"
```

### 3. Generate Reports
```bash
# Generate detailed report
rubric report --format markdown --output priority-report.md

# Export to CSV for spreadsheet analysis
rubric report --format csv --output tasks.csv

# JSON output for integration
rubric report --format json --output results.json
```

---

## 📊 Scoring Scale Reference

Each suggestion gets a score from 0–3 in the following categories:

| Score | Impact | Complexity/Cost (inverse) | Reusability | Strategic Fit |
|-------|--------|---------------------------|-------------|---------------|
| 0 | No clear benefit | Very high effort, uncertain payoff | One-off, tied to single edge case | Not aligned with current goals |
| 1 | Minor convenience for niche use | Significant effort, may add technical risk | Useful in one module only | Future-aligned, but premature |
| 2 | Useful for common workflows | Moderate effort, manageable risk | Reusable in multiple parts of app | Helps near-term roadmap |
| 3 | High impact; unblocks major functionality or many users | Low effort, low risk, simple to implement | General-purpose, likely to be reused across projects | Critical for immediate roadmap |

## 📐 Scoring Formula

**Total Score = Impact + Complexity + Reusability + Strategic Fit**

**Range**: 0–12

**Decision Rules**:
- **9–12** → Must have → Fast-track approval
- **6–8** → Nice-to-have → Defer or schedule later  
- **3–5** → Low-priority → Keep on backlog
- **0–2** → Reject

---

## ⚙️ Configuration

### Default Weights
```yaml
# rubric-config.yml
weights:
  impact: 0.35      # How much value it adds
  complexity: 0.25  # Effort required (inverted for scoring)
  reusability: 0.20 # Cross-project potential
  strategic: 0.20   # Vision alignment

thresholds:
  high_priority: 3      # Auto-approve threshold
  medium_priority: 2    # Review required
  low_priority: 1       # Consider for backlog
```

### Custom Scoring Profiles
```yaml
# For startups (speed focused)
startup_profile:
  weights:
    impact: 0.5
    complexity: 0.3
    reusability: 0.1
    strategic: 0.1

# For enterprise (stability focused)
enterprise_profile:
  weights:
    impact: 0.25
    complexity: 0.20
    reusability: 0.30
    strategic: 0.25
```

---

## 🔄 Integration with Development Workflow

### GitHub Integration
```yaml
# .github/workflows/rubric-check.yml
name: Rubric Evaluation
on:
  pull_request:
    branches: [main]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Rubric Evaluation
        run: |
          rubric evaluate-pr --pr-number ${{ github.event.number }}
          rubric report --format markdown >> $GITHUB_STEP_SUMMARY
```

### Pre-commit Hook
```bash
#!/bin/sh
# Pre-commit hook to evaluate changes
if [ -f "pending-tasks.json" ]; then
  echo "🔍 Evaluating pending tasks with Rubric SDK..."
  rubric evaluate --batch pending-tasks.json --threshold 2.0
fi
```

---

## 📈 Analytics and Insights

### Track Decision Quality
```bash
# Review past decisions
rubric analytics --period last-month

# Compare predicted vs actual outcomes
rubric validate-predictions --since 2024-01-01

# Identify scoring patterns
rubric insights --dimension impact
```

### Team Calibration
```bash
# Compare team member scoring
rubric calibrate --evaluators team.json

# Training mode with known examples
rubric train --examples training-set.json
```

---

## 🎛️ Advanced Features

### AI-Assisted Scoring
```bash
# Let AI suggest initial scores
rubric evaluate "New feature" --ai-assist

# Explain scoring rationale
rubric explain --task "API optimization" --verbose
```

### Dependency Analysis
```bash
# Factor in task dependencies
rubric evaluate --dependencies deps.json

# Critical path analysis
rubric critical-path --tasks project-tasks.json
```

### Risk Assessment
```bash
# Include risk factors in scoring
rubric evaluate --include-risks

# Monte Carlo simulation for uncertain estimates
rubric simulate --iterations 1000 --task "Complex migration"
```

---

## 🚀 Getting Started

1. **Install the SDK**
```bash
npm install -g @company/rubric-sdk
```

2. **Initialize project**
```bash
cd your-project
rubric init
```

3. **Evaluate your first task**
```bash
rubric evaluate "Your first task" --interactive
```

4. **Generate priority report**
```bash
rubric report --format markdown
```

---

## 📚 Best Practices

### Scoring Consistency
- Use the same evaluator for related tasks
- Calibrate scores with team regularly
- Document scoring rationale
- Review and adjust weights based on outcomes

### Decision Documentation
- Always generate reports for major decisions
- Include rubric scores in specs and PRs
- Track actual vs predicted effort/impact
- Update scoring criteria based on learnings

### Team Alignment
- Establish clear scoring guidelines
- Regular calibration sessions
- Share successful prediction examples
- Maintain scoring history for reference

---

## 🔧 Troubleshooting

### Common Issues
- **Inconsistent scoring**: Use calibration mode and team guidelines
- **Analysis paralysis**: Set time limits for scoring sessions
- **Gaming the system**: Focus on process improvement, not score optimization
- **Overcomplication**: Start simple, add complexity gradually

### Performance Optimization
- Batch evaluate related tasks
- Use profiles for common scenarios
- Cache complex calculations
- Regular cleanup of old evaluations