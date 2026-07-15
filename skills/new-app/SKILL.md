---
name: new-app
description: >-
  Spin up a brand-new Tessellate app repo from a short requirements brief — wired
  to the shared platform from commit one. Use when the user says "new app", "spin
  up an app", "scaffold a new project", "start a new app called X", or hands over
  a requirements brief. Creates the repo under Tessellate-Studio, wires the shared
  libs (rubric-sdk, code-standards, guinea-pig) + the forge plugin, seeds CLAUDE.md
  from the canonical base + the platform standards + app-specific memory, registers
  the weekly roadmap-pulse cron, and lands it as ONE initial commit + ONE setup PR
  (clean history). Seeds essentials only — no pre-built backlog (roadmap-pulse does
  that later). Always confirms name / package-id / platform before scaffolding;
  never guesses them.
---

# /new-app — scaffold a platform-wired app from a brief

The repeatable "requirements → running repo" path. Everything the platform offers
is wired in at creation, so a new app is interchangeable with the others on day
one and inherits every shared skill, standard, and anti-pattern.

This skill IS the authoritative-claims standard in action: it asserts "wired /
created / pushed" only after verifying against `gh` / `git` / the file tree, and
labels anything it couldn't verify as a hypothesis.

## Step 0 — Read the brief, fill the blanks

Read the user's brief (template: `${CLAUDE_PLUGIN_ROOT}/skills/new-app/references/new-app-brief.md`).
**Never guess** the app name, package/bundle id, platform, or visibility — if any
required field is missing, ask with AskUserQuestion before touching anything.
Confirm the resolved values back in one line.

## Step 1 — Create the repo (outward action — confirm once)

`gh repo create Tessellate-Studio/<name> --<private|public> --description "<purpose>"`.
Creating a repo is hard to undo with the current token (no `delete_repo` scope) —
state the exact command and get a go-ahead before running it. Clone locally as a
sibling of the other app repos.

## Step 2 — Wire the shared platform

1. **Libs as pinned deps** — `@tessellate-studio/rubric-sdk` and `guinea-pig` for
   test utilities/E2E (use each package's actual published name — don't guess
   variants). The **code-standards** CLI is installed from GitHub, not npm:
   `npm install -g github:Tessellate-Studio/code-standards` (gives the `standards`
   command).
2. **forge plugin** — write a committed `.claude/settings.json` with
   `extraKnownMarketplaces` (`Tessellate-Studio/forge`) + `enabledPlugins`
   (`forge@tessellate-forge`) **pinned to a version/SHA**, so a fresh clone of this
   repo reproduces the exact shared skills.
3. **Scaffold** via `standards init --template <type>` (`react-native`,
   `node-service`, `web`, `api`, `library`) — drops the matching `.bp-config.yml`
   profile, screens, error boundary, theme tokens, test setup. If RN+Expo, wire
   the mobile defaults.
4. **CI inspection gate (advisory)** — add `.github/workflows/code-inspection.yml`
   that calls
   `Tessellate-Studio/code-standards/.github/workflows/code-inspection.yml@main`
   with `fail_on_error: false` on `pull_request`. Non-blocking until the config is
   proven on the app; the app keeps its own tsc+test gate (don't double-run those).
5. **Ignore worktree dirs** — the app's `.gitignore` must exclude `.worktrees/`
   and `.claude/worktrees/` (per the concurrent-session isolation rule: tasks run
   in throwaway worktrees that must never be committed).

## Step 3 — Seed the docs (essentials only)

- `CLAUDE.md` ← copy `${CLAUDE_PLUGIN_ROOT}/references/CLAUDE.base.md`, fill
  `{{APP_NAME}}` / `{{PACKAGE_ID}}`, and put anything app-specific under
  "App-specific" (`{{APP_DELTAS}}`). Do **not** edit the shared rules inline —
  they come from forge.
- `docs/_USER_DOC_TEMPLATE.md`, `docs/user-actions-tracker.md` (empty TODO),
  `docs/SECURITY.md` (disposition-log stub referencing the shared triage policy).
- `memory/` — empty `project_regression_log.md` + `project_anti_patterns.md`
  (app-specific only; the shared eleven live in forge), seeded with any
  domain anti-patterns the brief named.
- `README.md` — purpose + how to install the forge plugin + run tests.
- **No** BACKLOG / RELEASE / WEEKLY_DIGEST — roadmap-pulse creates the digest on
  its first run; BACKLOG appears when there's real out-of-scope work.

## Step 4 — Register the weekly cron

Run roadmap-pulse's first-run registration so this app gets the Sunday pulse
(self-schedules via the scheduled-tasks MCP; writes its `.roadmap-pulse-state.json`).

## Step 5 — Land it cleanly (one commit + one PR)

Stage everything and make **one** initial commit; open **one** setup PR (don't
push a flurry of small commits — history hygiene is a platform rule). Run the test
suite green before the PR. End commit/PR with the Co-Authored-By trailer. Open it
**ready, not draft, and merge on green** — don't leave the setup PR parked (see
`${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md` → "Merge on green by default").

## Step 6 — Verify, then report

Verify with sources, not assumptions:
- `gh repo view Tessellate-Studio/<name>` resolves; visibility matches.
- `git ls-files` shows CLAUDE.md, `.claude/settings.json`, memory/, the SECURITY
  stub.
- A test run is green; CI is green on the PR.
- In a session opened on the new repo, `/forge:build-feature` resolves (plugin
  pinned correctly).

Report bottom-line-first: the repo URL, what's wired, the PR link, and the one or
two things only the user can do next (e.g. approve external-tool setups). Anything
unverified → labelled a hypothesis.
