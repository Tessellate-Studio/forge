# forge — Tessellate build platform (private Claude Code plugin)

One private plugin every Tessellate app installs. Carries the shared build
**skills**, the platform **standards**, and the `/new-app` scaffolder, so build
know-how lives once and every app inherits it — interchangeable, inter-usable,
self-learning (via reviewed PRs), self-maintaining (via the weekly cron).

## What's inside

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest (this repo is a private marketplace). |
| `.claude-plugin/plugin.json` | The `forge` plugin manifest. |
| `skills/build-feature/` | Implement + verify a UI change on-device until it objectively passes. |
| `skills/roadmap-pulse/` | Weekly planning-doc honesty pass + rubric-scored priorities. |
| `skills/new-app/` | Scaffold a new app from a requirements brief *(coming in Phase 3)*. |
| `standards/authoritative-claims.md` | The core rule: cite a source or label a hypothesis. |
| `standards/anti-patterns.md` | The 11 app-agnostic build guardrails. |
| `standards/security-triage.md` | `npm audit` / Dependabot triage policy. |

## Install (per app)

```
/plugin marketplace add Tessellate-Studio/forge
/plugin install forge@tessellate-forge
```

Then commit the app's `.claude/settings.json` (`extraKnownMarketplaces` +
`enabledPlugins`) so a fresh clone reproduces the same pinned skills. Skills are
invoked the same as always — smart-keyword auto-trigger **and** the slash form
(`/forge:build-feature`).

## How lessons propagate (self-learning)

A generalizable lesson becomes a small squash-merged PR to `standards/`; apps
pick it up on the next plugin version bump. No runtime writes, no separate
knowledge-base repo — review-gated by design.
