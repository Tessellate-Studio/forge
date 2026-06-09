<!--
  CLAUDE.base.md — canonical "how Claude works with me" for every Tessellate app.
  Source of truth: alate's CLAUDE.md (the most-curated version). `/new-app` copies
  this into a new repo as CLAUDE.md, fills the {{PLACEHOLDERS}}, and the app
  appends only its own deltas under "App-specific" at the bottom.
  When a working-with-me rule changes, change it HERE and bump the forge plugin —
  don't fork per app.
-->

# {{APP_NAME}} — Claude Code Instructions

## How to communicate with me — ALWAYS (unless I say otherwise)

Lead with the bottom line, then only the lists that apply. Scale the shape to the
size of the task. Plain words — no technical jargon (that goes in the PR
description or a doc I ask for). **A gist with the important info is plenty; all
tech detail goes in the PR, not in chat.**

**Small task** (one-file fix, quick answer, single command): just the bottom line
— one or two sentences on what's done and whether I need to do anything. No
headers, no lists.

**Bigger task** (multi-step, several files, or has follow-up): a one-line
**Done:** headline, then only the sections that have real content:
- **You:** — actions only I can take. Omit if none.
- **Me next:** — what you can take off my hands next. Omit if none.
- **Docs:** — one line on docs touched and why. Omit if none.

Rules: empty sections are dropped entirely (never "You: nothing needed"); each
fact appears once; the headline IS the summary — no separate recap.

## Speak from authority, not assumption — cite the source

Every statement, suggestion, status claim, or "done / not done" verdict lands on
a verified source — not an inference, a stale memory note, or a previous
session's word. Cite inline: `file:line`, commit SHA, MCP tool, CLI command.

- Before asserting "X is done / live / merged / shipped": `git branch --contains
  <sha>` should include the default branch; for DB state prefer reading the schema
  (`list_tables`) over a migrations ledger.
- Before asserting "X is broken / pending": verify current state — a memory/log
  claim is a starting point, not a conclusion.
- When the source can't be cheaply checked, label it: "unverified — best guess is
  X; would need Y to confirm." Never let an inference wear the costume of a fact.
- **The tell:** if the sentence still works with "probably / should be / I think"
  inserted, you're inferring — verify, delete, or relabel as a hypothesis.

This is enforced platform-wide via `forge/standards/authoritative-claims.md`.

## Security — OWASP is non-negotiable

Follow OWASP guidance at all times. Any OWASP violation is, by definition, an
anti-pattern. Dependency alerts are triaged per
`forge/standards/security-triage.md`; this app's disposition log lives in
`docs/SECURITY.md`.

## Anti-patterns — read before building

The cross-app build guardrails live in `forge/standards/anti-patterns.md` (TDD-
first for data-flow, no hardcoded colours/fonts/alphas, no hooks below a
conditional return, custom-font family names, comment-the-why, diagnose-from-
source, WCAG 2.1 AA, CI secret hygiene, authority-not-assumption, end-to-end
shipping, elastic layouts, concurrent-session isolation). App-specific
anti-patterns live in
`memory/project_anti_patterns.md`. Read both before a feature that touches their
areas.

## User-facing docs — use the template

Any runbook / how-to for me follows `docs/_USER_DOC_TEMPLATE.md`: plain-language
"what this is" → numbered "what you need to do" with real links → "how to verify
it worked". No jargon in the instructions.

## Branch placement — AUTOMATIC, do not ask

When a task's changes don't belong on the current branch, cut a new branch off
the default branch automatically. Signals: current branch name implies a
different scope (`ci/…`, `docs/…`, `chore/…`); unrelated uncommitted edits in
flight; the fix would mix concerns across PR boundaries. Naming:
`fix/<slug>`, `feat/<slug>`, `docs/<slug>`, `chore/<slug>`. Use `git worktree
add` when the current branch has uncommitted work to preserve. Separate code
commits from doc commits. Run the full test suite before either commit.

## Merged branches — rename to `done/<original>` AUTOMATICALLY

When a PR merges, rename the local source branch to `done/<original-name>` instead
of deleting it (drop `--delete-branch`, then `git branch -m <original>
done/<original>`). The `done/` prefix flags it as safe-to-prune. This trumps
"delete on merge".

## Orphan-branch fixes — port AUTOMATICALLY, do not ask

If a fix already exists as a commit on an unmerged/orphan branch and the current
task needs it, port it to a fresh branch off the default branch without asking.
Verify the fix's SHA is reachable from the default branch before marking any
log/BACKLOG entry shipped.

## Concurrent sessions — isolate the checkout, trust SHAs not HEAD

Several agents (and you) may drive one repo at once. In a shared working copy,
`HEAD` moves between commands — a commit lands on a stranger's branch, a branch
forks off a stray commit, a push carries an extra commit.

- **Hand each task to a worktree-isolated session** — check the "new worktree"
  box on handoff, or launch subagents with `isolation: "worktree"`. That session
  gets its own working dir + HEAD; the contention is gone. Don't do committable
  work in the shared main checkout when other sessions may be active.
- **A fresh worktree has no `node_modules`** — run `npm ci` (each package) before
  committing so the local gate (tsc / tests) can run; the pre-commit hook says so
  if they're missing. Don't junction deps into a harness-managed worktree — its
  automatic cleanup can follow the junction and delete the main checkout's deps.
- **SHA-explicit git — never trust "current branch".** Verify `git rev-parse
  --abbrev-ref HEAD` is the branch you intend before the first edit and before
  every commit/push; if it drifted, stop and surface. Push by refspec
  (`git push origin <sha>:refs/heads/<branch>`); prefer `git branch -f` /
  `git branch -m` over checkout-then-act.
- **Subagents:** the `Edit` tool resolves ABSOLUTE paths to the MAIN checkout, not
  an isolated worktree — use worktree-relative paths inside isolated subagents.

## External-tool actions — log DECIDED steps in `docs/user-actions-tracker.md`

When a session decides which external tool to use for a setup (DNS, email, OAuth
app, a CI secret, etc.), an entry lands in `docs/user-actions-tracker.md` before
the session ends — actual provider, actual values, numbered copy-pasteable steps,
verification command(s), and a "where to look" diagnostic. Not an evaluation of
options (that's BACKLOG); only the decided outcome. BACKLOG holds what+why; the
tracker holds exactly-how. Cross-link, don't copy.

## Planning docs

- `BACKLOG.md` — durable record of out-of-scope work (P0–P4); check before
  proposing "should we build X?"
- `USER_PATHS.md` — happy + edge + uncovered user flows; update when a flow drifts.
- `WEEKLY_DIGEST.md` — append-only weekly priority history (produced by
  roadmap-pulse; created on its first run).
- `memory/` — app-specific regression log, anti-patterns, design vision.

## Bug-fix pre-flight — read the regression log first

Before writing code for a reported bug: read `memory/project_regression_log.md`
end to end, skim for matching symptoms. Match → link it, check whether the prior
fix regressed (run its test), patch from there. No match → TDD loop below, then
add a new entry (symptom → root cause → fix → test → lesson). 3+ entries on one
theme → promote to an anti-pattern.

## TDD — write tests first

New feature or bug fix: (1) write the test describing expected behaviour, (2) run
it, confirm it fails for the right reason, (3) write the code, (4) full suite
green before commit. New screen → render smoke test. New store action → unit
test. New API function → error-path test. Bug fix → regression test reproducing
the bug first.

## Error boundaries

Every screen is wrapped in a screen-level error boundary. New screen: create the
`Safe{ScreenName}` wrapper, use it in the navigator, add a smoke test.

## Testing

Unit/component tests run locally and must stay green before any commit. E2E lives
in the shared `guinea-pig` repo; `testID`s are the contract between this app and
guinea-pig — don't remove/rename one without updating guinea-pig's
`TEST_ID_CONTRACT.md`.

## Code style

Use theme tokens (colours, spacing, typography, alphas) — never hardcoded
literals (see the no-hardcoded-values anti-pattern). Package id:
`{{PACKAGE_ID}}`.

---

## App-specific

<!-- Everything below is THIS app's delta. The rules above come from forge and
     should not be edited here — change them in forge/references/CLAUDE.base.md. -->

{{APP_DELTAS}}
