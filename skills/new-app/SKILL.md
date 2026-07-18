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

1. **Platform tooling** — one GitHub install gives the whole platform:
   `npm install -g github:Tessellate-Studio/forge` (provides the `standards`,
   `bp`, and `rubric` CLIs — nothing is on the npm registry). For E2E/test
   utilities add `guinea-pig` (`github:Tessellate-Studio/guinea-pig`) as a
   devDep; see `${CLAUDE_PLUGIN_ROOT}/standards/testing.md` for when.
2. **forge plugin** — write a committed `.claude/settings.json` with
   `extraKnownMarketplaces` (`Tessellate-Studio/forge`, **`"autoUpdate": true`**)
   + `enabledPlugins` (`forge@tessellate-forge`), so every session starts on
   the latest platform skills and standards (platform decision 2026-07-16 — no
   manual version pins or bumps).
3. **Scaffold** via `standards init --template <type>` (`react-native`,
   `node-service`, `web`, `api`, `library`) — drops the matching `.bp-config.yml`
   profile, screens, error boundary, theme tokens, test setup. If RN+Expo, wire
   the mobile defaults. **Design pass on the first screens:** build any user-facing
   web surface with `/frontend-design` (not the generic scaffold look), and run
   `/design-critique` on the first rendered screen before the setup PR — a new
   app's visual baseline is set on day one.
4. **Lint (advisory-first)** — every app ships a lint setup that actually runs.
   Expo/RN: run `npx expo lint` once — it scaffolds `eslint.config.js` with
   `eslint-config-expo` and adds the `lint` script. TS backend/api packages: eslint 9
   flat config extending `typescript-eslint`'s `recommended`, with
   `"lint": "eslint ."`. Plain-JS scaffolds get a working `.eslintrc.js` from
   `standards init`. CI runs lint as a **non-blocking** step/job
   (`continue-on-error: true`) — findings inform, they don't gate. Add prettier
   only if the app already uses it; don't introduce it here.
5. **CI inspection gate (advisory)** — add `.github/workflows/code-inspection.yml`
   that calls
   `Tessellate-Studio/forge/.github/workflows/code-inspection.yml@master`
   with `fail_on_error: false` on `pull_request`. Non-blocking until the config is
   proven on the app; the app keeps its own tsc+test gate (don't double-run those).
6. **Ignore worktree dirs** — the app's `.gitignore` must exclude `.worktrees/`
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
