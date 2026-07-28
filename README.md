# forge — Tessellate build platform (Claude Code plugin + CLIs)

> Public repo (since 2026-07-17): CI runners and `npm install github:` need
> anonymous read access — same posture code-standards had. No secrets live
> here; the standards are generic build process, not business data.

One repo = the whole build platform. The Claude Code plugin every Tessellate
app installs (shared build **skills**, platform **standards**, a CLAUDE.md
**template**, the `/new-app` scaffolder) plus the platform **CLIs**
(`standards`/`bp` for scaffolding + inspection, `rubric` for task scoring) and
the reusable **CI workflows**. Build know-how lives once and every app
inherits it — interchangeable, inter-usable, self-learning (via reviewed PRs).

> Absorbed the former `code-standards` and `rubric-sdk` repos on 2026-07-17
> (histories preserved; old repos archived). litmus (the testing lab, renamed from guinea-pig 2026-07-18)
> deliberately stays separate — see `standards/testing.md`.

## What's inside

| Path | What |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest (this repo is its own marketplace). |
| `.claude-plugin/plugin.json` | The `forge` plugin manifest. |
| `skills/build-feature/` | Implement + verify a change end-to-end on-device until it objectively passes. |
| `skills/roadmap-pulse/` | Weekly planning-doc honesty pass + rubric-scored priorities. |
| `skills/new-app/` | Scaffold a new platform-wired app from a requirements brief. |
| `skills/security-sweep/` | Dependency vulnerability sweep — triage, safe auto-fix, dismiss accepted residuals. Implements `standards/security-triage.md`. |
| `standards/workflows.md` | **Single home** for all working rules (branch placement, TDD, quality pass, status updates, etc.). |
| `standards/anti-patterns.md` | The 14 app-agnostic build guardrails. |
| `standards/authoritative-claims.md` | The core rule: cite a source or label a hypothesis. |
| `standards/security-triage.md` | `npm audit` / Dependabot triage policy. |
| `standards/doc-placement.md` | Where each doc type lives in a Tessellate app. |
| `standards/testing.md` | Unit vs E2E/visual/rule-compliance (litmus) vs UAT — tiers, testID contract, trigger flow. |
| `references/CLAUDE.base.md` | One-page CLAUDE.md template for new apps (used by `/new-app`). |
| `standards-cli/` | The code-standards SDK: `standards`/`bp` CLI, validators, scaffolding templates. |
| `rubric/` | The rubric SDK: `rubric` CLI + `evaluateFromContext` scoring API (root export). |
| `.github/workflows/code-inspection.yml` | **Reusable** advisory inspection gate apps call from their CI. |

## Install

**Claude Code plugin (per app):**

```
/plugin marketplace add Tessellate-Studio/forge
/plugin install forge@tessellate-forge
```

Then commit the app's `.claude/settings.json` (`extraKnownMarketplaces` +
`enabledPlugins` **with `"autoUpdate": true`** on the marketplace entry) so
every session starts on the latest platform skills and standards — no manual
version pins or bumps (platform decision 2026-07-16).

**CLIs (machine-global, from GitHub — nothing is on the npm registry):**

```bash
npm install -g github:Tessellate-Studio/forge   # standards, bp, rubric
```

**CI gate (per app):**

```yaml
jobs:
  inspect:
    uses: Tessellate-Studio/forge/.github/workflows/code-inspection.yml@master
    with:
      fail_on_error: false   # advisory; flip to true once tuned
```

## Layering rule

App CLAUDE.md files stay **one page** — always-true facts + one-line pointers
to `forge/standards/workflows.md`. The full process lives in skills (loaded
when the task starts) and standards (loaded when referenced). If a rule keeps
getting missed, move it **down** a layer (prose → skill → hook), don't restate
it louder.

## How lessons propagate (self-learning)

A generalizable lesson becomes a small squash-merged PR to `standards/`; apps
pick it up automatically via `autoUpdate`. No runtime writes, no separate
knowledge-base repo — review-gated by design.
