<!--
  CLAUDE.base.md — canonical "how Claude works with me" for every Tessellate app.
  `/new-app` copies this into a new repo as CLAUDE.md, fills the {{PLACEHOLDERS}},
  and the app appends only its own deltas under "App-specific" at the bottom.

  DESIGN RULE: this file is a ONE-PAGE INDEX. Full rule text lives exactly once,
  in forge/standards/ (workflows.md, anti-patterns.md, authoritative-claims.md,
  doc-placement.md, security-triage.md) — loaded on demand via the pointers
  below and by the forge skills at the moment they apply. Do NOT paste rule text
  back in here: a rule restated in every app drifts in every app, and a 400-line
  CLAUDE.md buries the one rule that matters. If a rule keeps getting missed,
  move it DOWN a layer (prose → skill → hook), don't restate it louder.

  When a working-with-me rule changes, change it in forge/standards/ and bump
  the plugin — don't fork per app.
-->

# {{APP_NAME}} — Claude Code Instructions

## How to communicate with me — ALWAYS

Lead with the bottom line, then only the lists that apply. Plain words — no
jargon (that goes in the PR description). **Small task:** one or two sentences,
no headers. **Bigger task:** a one-line **Done:** headline, then only sections
with real content — **You:** (actions only I can take) / **Me next:** /
**Docs:** — empty sections dropped entirely, each fact appears once, the
headline IS the summary.

## The two always-on rules

- **Speak from authority, not assumption.** Every claim cites a verified source
  (`file:line`, SHA, MCP tool, CLI output) or is labelled a hypothesis. Full
  standard: `forge/standards/authoritative-claims.md`.
- **OWASP is non-negotiable.** Any OWASP violation is an anti-pattern.
  Dependency-alert triage: `forge/standards/security-triage.md`.

## Working rules — one line each, full text in forge

Read the linked standard **at the moment the rule applies** (branching,
committing, merging, bug-fixing) — that's when it matters, not at session start.
All in `forge/standards/workflows.md` unless noted:

- **Branch placement** — task doesn't fit the current branch → cut
  `fix|feat|docs|chore/<slug>` off the default branch automatically; don't ask.
- **Merge on green** — PRs open ready (not draft), merge when CI passes
  (carve-outs in `anti-patterns.md`).
- **Orphan-branch fixes** — port to a fresh branch off default automatically.
- **Concurrent sessions** — worktree-isolate every task; SHA-explicit git;
  verify `HEAD` before every commit/push (`anti-patterns.md`).
- **Shared docs & duplicate work** — before editing a regression log / BACKLOG /
  tracker, list the open PRs already in that file; before starting anything, scan open
  PR titles for your intent (a duplicate wastes a whole branch). Shared-doc edits get
  their own **commit** (same PR is fine — just never the same commit as the code);
  date-key new log rows, never a sequential number (`anti-patterns.md`).
- **Bug-fix pre-flight** — read `memory/project_regression_log.md` BEFORE any
  code; log new fixes there after.
- **TDD** — failing test first, suite green before commit.
- **Quality pass** — before committing any non-trivial diff (UI or not):
  `/code-review`, then `/simplify`, re-run tests, commit cleanups separately.
- **Status update** — change came from a BACKLOG / regression-log / tracker
  entry? Update that entry (status, PR, SHA) in the same PR.
- **External-tool decisions** — decided setups get numbered, copy-pasteable
  steps in `docs/user-actions-tracker.md` before the session ends.
- **Doc placement** — one location per doc type: `forge/standards/doc-placement.md`.
- **User-facing runbooks** — follow `docs/_USER_DOC_TEMPLATE.md`: what this is →
  numbered steps with real links → how to verify.

## Build workflows — let the skills carry the process

- `/forge:build-feature` — implement + verify a change end-to-end (acceptance
  criteria → TDD → on-device/runtime verification → quality pass → status
  update → retro). Auto-triggers on build/fix/redesign asks; the skill IS the
  process, so it never needs restating here.
- `/forge:plan` — three-tiered planning framework: ADR (tactical), Shape Up
  Pitch (feature scope), RFD (architecture). Auto-triggers in build-feature
  Step 0; also available standalone for decision-making.
- `/forge:roadmap-pulse` — weekly planning-doc honesty pass + RICE-scored priorities.
- `/forge:new-app` — scaffold a new platform-wired app.

**Multi-agent builds (Pitch/RFD tier).** For feature- and architecture-scoped
changes, `build-feature` delegates to the `researched-build` workflow — a
pipeline of separated agents (researcher → tester → implementer → reviewer →
verifier) that communicate via structured returns and cross-validate each
other's work (the reviewer reads a diff it didn't write; skeptics refute review
findings). The deeper `adversarial-review` workflow is also available for
large diffs. Scripts + agent charters live under the forge plugin's
`references/workflows/` and `references/agents/`; both degrade gracefully to
single-agent when unavailable. Tactical/trivial changes stay single-agent. When
a change renders UI, pass this repo's own verification loop as `context.verify`
— `publish` and `capture` are required (the run is rejected without them,
before any agent spawns), while `surface` / `apply` / `confirm` / `measure` are
optional and discovered from the repo when absent.

## Project

{{PROJECT_DESCRIPTION}} Package id: `{{PACKAGE_ID}}`.

## Planning docs

- `BACKLOG.md` — durable record of out-of-scope work (P0–P4); check before
  proposing "should we build X?"
- `USER_PATHS.md` — happy + edge + uncovered user flows.
- `WEEKLY_DIGEST.md` — append-only weekly priority history (roadmap-pulse).
- `docs/user-actions-tracker.md` — every decided external-tool setup, exact steps.
- `memory/` — app-specific regression log, anti-patterns, design vision.

## Testing

Unit/component tests run locally and must stay green before any commit. E2E
lives in the shared `litmus` repo (renamed from guinea-pig); `testID`s are the contract — don't
remove/rename one without a paired litmus PR (its `TEST_ID_CONTRACT.md` is generated). Every
screen gets an error boundary + a render smoke test.

## Code style

Theme tokens (colours, spacing, typography, alphas) — never hardcoded literals
(`anti-patterns.md`).

Linting is advisory: every package has a working `npm run lint`, and CI runs it
non-blocking. Fix findings or consciously demote them to warnings — don't let the
list rot.

---

## App-specific

<!-- Everything below is THIS app's delta: quirks, version line, repo map,
     domain rules. The rules above come from forge — change them there. -->

{{APP_DELTAS}}
