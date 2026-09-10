# forge — Tessellate build platform (Claude Code plugin + CLIs)

> Public repo (since 2026-07-17): CI runners and `npm install github:` need
> anonymous read access — same posture code-standards had. No secrets live
> here; the standards are generic build process, not business data.

One repo = the whole build platform. The Claude Code plugin every Tessellate
app installs (shared build **skills**, platform **standards**, a CLAUDE.md
**template**, the `/new-app` scaffolder) plus the platform **CLIs**
(`standards`/`bp` for scaffolding + inspection, `rubric` for task scoring,
`brief` for token-cheap command output) and the reusable **CI workflows**.
Build know-how lives once and every app
inherits it — interchangeable, inter-usable, self-learning (via reviewed PRs).

> Absorbed the former `code-standards` and `rubric-sdk` repos on 2026-07-17
> (histories preserved; old repos archived). litmus (the testing lab, renamed from guinea-pig 2026-07-18)
> deliberately stays separate — see `standards/testing.md`.

## What's inside

| Path                                    | What                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.claude-plugin/marketplace.json`       | Marketplace manifest (this repo is its own marketplace).                                                                                                                       |
| `.claude-plugin/plugin.json`            | The `forge` plugin manifest.                                                                                                                                                   |
| `skills/build-feature/`                 | Implement + verify a change end-to-end on-device until it objectively passes.                                                                                                  |
| `skills/roadmap-pulse/`                 | Weekly planning-doc honesty pass + rubric-scored priorities.                                                                                                                   |
| `skills/new-app/`                       | Scaffold a new platform-wired app from a requirements brief.                                                                                                                   |
| `skills/security-sweep/`                | Dependency vulnerability sweep — triage, safe auto-fix, dismiss accepted residuals. Implements `standards/security-triage.md`.                                                 |
| `skills/crash-monitor/`                 | Daily Sentry + GitHub Issues triage — noise filters, confidence-gated auto-fix, revert cooldown.                                                                               |
| `skills/device-test/`                   | Drains the cross-app device-test queue; ships `dtq` / `device-test-status`, a read-only terminal status board for the same queue (see below).                                  |
| `skills/status-check/`                  | Session wrap-up loop-closer — verifies and settles the PRs/branches/issues/queue items this conversation opened; manual-only bits come back as a short list.                   |
| `standards/workflows.md`                | **Single home** for all working rules (branch placement, TDD, quality pass, status updates, etc.).                                                                             |
| `standards/anti-patterns.md`            | The 14 app-agnostic build guardrails.                                                                                                                                          |
| `standards/authoritative-claims.md`     | The core rule: cite a source or label a hypothesis.                                                                                                                            |
| `standards/security-triage.md`          | `npm audit` / Dependabot triage policy.                                                                                                                                        |
| `standards/doc-placement.md`            | Where each doc type lives in a Tessellate app.                                                                                                                                 |
| `standards/testing.md`                  | Unit vs E2E/visual/rule-compliance (litmus) vs UAT — tiers, testID contract, trigger flow.                                                                                     |
| `references/CLAUDE.base.md`             | One-page CLAUDE.md template for new apps (used by `/new-app`).                                                                                                                 |
| `standards-cli/`                        | The code-standards SDK: `standards`/`bp` CLI, validators, scaffolding templates.                                                                                               |
| `rubric/`                               | The rubric SDK: `rubric` CLI + `evaluateFromContext` scoring API (root export).                                                                                                |
| `tools/brief/`                          | The `brief` CLI: run any command, print a token-cheap summary of its output instead of the raw dump. See `standards/workflows.md`.                                             |
| `tools/checks-gate/`                    | The merge gate for a requested merge: exit 0 only when a PR's checks are green, from bucket state rather than `gh pr checks --watch`'s exit code. See `standards/workflows.md` → "Merge on green". |
| `tools/work-claim/`                     | The `wip` CLI: who is working on which issue/PR — post, heartbeat and release the 🚧 work claim, and print the cross-repo board. See `standards/workflows.md` → "Work claims". |
| `.github/workflows/code-inspection.yml` | **Reusable** advisory inspection gate apps call from their CI.                                                                                                                 |

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
npm install -g github:Tessellate-Studio/forge   # standards, bp, rubric, brief, dtq, wip
```

**CI gate (per app):**

```yaml
jobs:
  inspect:
    uses: Tessellate-Studio/forge/.github/workflows/code-inspection.yml@master
    with:
      fail_on_error: false # advisory; flip to true once tuned
```

## Freshness check (SessionStart)

`autoUpdate` on a git marketplace does not actually pull the clone,
`claude plugin update` compares version strings only, and `claude plugin
install` reuses a cache directory that already exists for that version — so a
change merged without a version bump is unreachable by any CLI command, and
the plugin sits stale while every command reports success.
`hooks/forge-freshness.mjs` runs at session start, checks for that drift, and
repairs it in a detached background worker:

1. `claude plugin marketplace update` — pulls the clone.
2. `claude plugin update` — only when the clone's version string moved, so the
   CLI extracts a fresh version directory the way it means to.
3. Copy the clone over **every** installed directory that still differs —
   the user-scope install _and_ each per-project / per-worktree install, which
   step 2 never touches. This is what makes a bump optional rather than a
   ritual, and what stops long-lived worktrees drifting from master.

It never blocks session start and cannot fix the session that triggers it — the
plugin is already loaded by then, so a repair makes the _next_ session correct.
Nothing needs copy-pasting; if the hook ever asks you to run something by hand,
that is the bug to fix.

**Turning it off:**

```bash
FORGE_FRESHNESS_DISABLE=1     # neither the check nor any worker runs
```

Set it in your environment to silence the check entirely — nothing else to undo,
and unsetting it resumes normal behaviour. Prefer this over disabling the whole
plugin, which would also take the skills and standards with it.

Because it spawns a process per session, a repair that _cannot_ succeed is a
repair that runs forever. Two layered limits prevent that: the
consecutive-failure backoff, and a hard floor on how often any worker may
spawn for any reason. If you add a new "but we should really check now"
condition, put it _inside_ that floor — see the header of
`hooks/forge-freshness.mjs`.

## Device-test status (SessionStart)

`hooks/device-test-status.mjs` checks the device-test queue (alate,
mood-layer, badige) at the start of every session and surfaces a one-line
summary when anything is open, failed, or malformed — quiet when every queue
is empty. Run `dtq` (or `device-test-status`) any time for the full live
board instead of waiting for a session start, or asking an agent to poll the
threads for you. See `skills/device-test/SKILL.md`.

**Turning it off:**

```bash
FORGE_DEVICE_TEST_STATUS_DISABLE=1
```

## Work claims (SessionStart)

Every session commits under the same GitHub account, so nothing on an issue or
PR says WHICH session is on it — and the branch, the worktree and the RFD the
work is being built against all live somewhere no other session can see. Agents
kept picking up work another agent already had in flight.

A session claims an item when it picks it up: a 🚧 comment on the issue/PR
carrying its `claude --resume` id, its worktree path and its planning docs, plus
the `claimed` label so the whole board is listable.

```bash
wip                                        # the board — who is on what
wip claim alate#562 --doc memory/decisions/rfd-003-x.md
wip touch alate#562                        # heartbeat, at each commit/push/phase
wip release alate#562                      # done, stalled, or handed back
wip sweep                                  # backstop: drop labels whose claim died
```

`hooks/work-claims.mjs` puts live claims in front of every new session, which is
where the collision actually happens — by the time an agent has read the code it
has already decided to work the item. Quiet when nothing is claimed. Rules and
lifecycle: `standards/workflows.md` → "Work claims".

**Turning it off:**

```bash
FORGE_WORK_CLAIMS_DISABLE=1
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
