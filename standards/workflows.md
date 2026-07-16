# Development workflows (platform standard)

**This file is the single home for the working rules every Tessellate app
follows.** An app's `CLAUDE.md` carries a ONE-LINE pointer per rule — never a
restatement. A rule written in two places drifts two ways; when a rule here
needs an app-specific delta, the app notes only the delta under its own
"App-specific" section and links back here.

Rules that are anti-patterns (merge-on-green, concurrent-session isolation,
TDD-for-data-flows, …) live in [`anti-patterns.md`](./anti-patterns.md) and are
only *linked* from here — same single-home principle.

---

## Branch placement — AUTOMATIC, do not ask

When a task's changes don't belong on the currently checked-out branch, cut a
new branch off the default branch automatically. Signals:
- Current branch name implies a different scope (`ci/…`, `docs/…`, `chore/…`)
  while the task is a feature/fix.
- The current branch has unrelated uncommitted edits in flight.
- The fix would mix concerns across PR boundaries.

Naming: `fix/<slug>`, `feat/<slug>`, `docs/<slug>`, `chore/<slug>`. Cut from
the default branch (fetch origin first — the local copy can lag), not the
current branch. Use `git worktree add` when the current branch has uncommitted
work to preserve. Separate code commits from doc commits; run the app's full
test suite before either commit.

## Merged branches — rename to `done/<original>` AUTOMATICALLY

When a PR merges, rename the local source branch to `done/<original-name>`
instead of deleting it: drop `--delete-branch` from `gh pr merge`, then
`git branch -m <original> done/<original>`. The `done/` prefix flags it
"merged, safe to prune"; periodic pruning (`git branch | grep ^done/` →
`git branch -D`) clears the backlog without re-verifying each branch. This
trumps "delete on merge" — never leave a merged branch under its original name,
and don't ask before renaming.

## Merge on green — the default

Open PRs ready (not draft) and merge as soon as CI is green. Full rule + the
carve-outs (outward-facing / hard-to-reverse / explicit hold):
[`anti-patterns.md` → "Merge on green by default"](./anti-patterns.md).

## Orphan-branch fixes — port AUTOMATICALLY, do not ask

If a regression-log/BACKLOG entry or an audit reveals a needed fix already
exists on an unmerged orphan branch (typically `claude/<adjective>-<noun>-<hash>`
from a prior session), port it to a fresh branch off the default branch without
asking:
1. Cherry-pick or replay the diff on the new branch.
2. Run the full test suite — orphan-branch tests should pass on the default
   branch too; if not, fix forward, don't skip.
3. Update BACKLOG / regression-log entries to the new merged SHA — an entry is
   "shipped" only when `git branch --contains <sha>` lists the default branch.

## Concurrent sessions — isolate the checkout

Assume multiple agents may drive one repo at the same time. Worktree-isolated
sessions, `npm ci` before the commit gate, SHA-explicit git, verify `HEAD`
before every commit/push. Full rule:
[`anti-patterns.md` → "Isolate concurrent sessions"](./anti-patterns.md).

## Bug-fix pre-flight — read the regression log FIRST

Before writing any code for a reported bug, read the app's
`memory/project_regression_log.md` end to end (it's a 30-second read; a build
is minutes):
1. Symptom matches a logged entry → link it, check whether the prior fix
   regressed (run its test), patch from that starting point — don't re-discover.
2. No match → TDD loop below; once the fix lands, add a new entry
   (symptom → root cause → fix → test → lesson). One-liners get logged too.
3. 3+ entries on one theme → promote to an anti-pattern (app's
   `memory/project_anti_patterns.md`, or here if app-agnostic).

## TDD — write tests first

For any new feature or bug fix:
1. Write the test describing expected behaviour; 2. run it, confirm it fails
for the right reason; 3. write the code; 4. full suite green before commit.
New screen → render smoke test. New store action → unit test. New API function
→ error-path test. Bug fix → regression test that reproduces the bug first.
(Data-pipeline and legal/trust-sensitive flows: TDD is mandatory — see
[`anti-patterns.md` → "TDD-first for data-flow changes"](./anti-patterns.md).)

## Quality pass before commit — ALL non-trivial diffs, UI or not

After the suite is green and (for UI) the change is verified on-device, run a
quality pass on the diff before committing. This applies to **every non-trivial
diff — backend, data-flow, tooling, not just UI**; skip with a one-line note
for a true one-liner:
1. `/code-review` — correctness bugs + reuse/simplification/efficiency findings
   in the current diff. Triage and fix what's real.
2. `/simplify` — applies reuse/efficiency/altitude cleanups (quality only, no
   bug hunt). It edits the working tree — re-run typecheck + tests after.
3. Commit cleanups separately (`chore: simplify <scope>`) — don't mix them into
   the feature/fix commit.

## Status update on completion — close the loop on source docs

If the feature or fix originated from a tracked item — a BACKLOG.md entry, a
regression-log row, a RELEASE checklist line, a tracker TODO — **update that
entry in the same PR** that ships the change: status (DONE + date), the PR
number, and the merged SHA once it lands. A tracked item whose fix shipped but
whose entry still says "open" is how work gets re-done and users re-ask.
(Verification bar: the SHA in the entry must be reachable from the default
branch — see "Speak from authority" in
[`authoritative-claims.md`](./authoritative-claims.md).)

## External-tool actions — log DECIDED steps

When a session decides which external tool/provider to use for a setup (DNS,
email, OAuth app, CI secret, …), an entry lands in the app's
`docs/user-actions-tracker.md` **before the session ends** — actual provider,
actual values, numbered copy-pasteable steps (never "if you choose A vs B"
branches), verification command(s), and a "where to look" diagnostic. Not an
evaluation of options (that's BACKLOG); only the decided outcome. BACKLOG holds
*what + why*; the tracker holds *exactly how*. Cross-link, don't copy.

## Doc placement

Every documentation type has one defined location — see
[`doc-placement.md`](./doc-placement.md) before creating or moving any doc.
