# 📊 Rubric SDK

Score, compare, and prioritize tasks before you build them — a consistent 4-dimension framework to replace gut-feel backlog decisions.

> Part of the **forge** platform repo (`Tessellate-Studio/forge`, `rubric/`
> subdir) since 2026-07-17 — formerly the separate `rubric-sdk` repo. Commit
> changes here, not to consuming projects.

## Install

```bash
npm install -g github:Tessellate-Studio/forge   # gives the `rubric` CLI (+ standards/bp)
```

## Scoring framework

Each task is scored 0–3 on four dimensions:

| Dimension | What it measures |
|-----------|------------------|
| **Impact** | Value to users/business |
| **Complexity** | Effort and risk (inverse — lower cost scores higher) |
| **Reusability** | Cross-project potential |
| **Strategic Fit** | Alignment with vision/roadmap |

**Total** = sum (0–12). **9–12** Must · **6–8** Nice-to-have · **3–5** Low · **0–2** Reject.

## CLI

```bash
rubric init [--profile startup|enterprise|research]   # set scoring weights
rubric evaluate "Task description" --interactive       # score one task
rubric compare --file tasks.json                       # rank multiple tasks
rubric report --format markdown --output backlog.md    # export a prioritized list
```

## Programmatic

```javascript
const { RubricEngine } = require('@tessellate-studio/rubric-sdk');

const engine = new RubricEngine();
const result = await engine.evaluate('Implement user notifications',
  { impact: 4, complexity: 3, reusability: 3, strategic: 4 });

console.log(result.priority, result.weightedScore);
```

### Autonomous scoring — `evaluateFromContext`

For consumers that can't ask a human for scores (e.g. agents on a schedule), pass a task + context and get the full 4-axis score, band, and per-axis reasoning back. Scores are decided by transparent rule-based heuristics — see [`lib/evaluate-from-context.js`](lib/evaluate-from-context.js).

```javascript
const { evaluateFromContext } = require('@tessellate-studio/rubric-sdk');

const result = evaluateFromContext({
  title: 'Set up email aliases on tessellate.co.in',
  description: 'Privacy policy already lists privacy@ as the deletion address; emails bounce today.',
  context: {
    goals: ['Closed beta live'],
    dependencies: { this_task_depends_on: [], this_task_unblocks: ['Reddit launch posts'] },
  },
});
// → { impact, complexity, reusability, strategic, total, band, reasoning }
```

Pairs with [`@tessellate-studio/code-directives`](https://github.com/Tessellate-Studio/code-standards) for standards and scaffolding.

## License

MIT — see [LICENSE](LICENSE). Full docs in [docs/](docs/).
