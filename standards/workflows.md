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

## Merged branches — delete them, or mark them `done/`; both are fine

**Nothing is lost when a merged branch is deleted.** A PR's commits stay
reachable at `refs/pull/<n>/head` for the life of the repo — including the
individual pre-squash commits a squash merge keeps out of the default branch:

```bash
git fetch origin refs/pull/<n>/head:refs/remotes/origin/pr-<n>
git log --oneline refs/remotes/origin/pr-<n>
```

That recovers the branch tip and its full history for investigation, and it
works even for a PR that was merged and then reverted — the reverted content
is still readable at that ref.

So deletion is safe, and it is the simplest end state: leaving GitHub's
"Automatically delete head branches" (`delete_branch_on_merge`) on is fine, as
is `gh pr merge --delete-branch`.

Keeping a merged branch is also fine — **rename it `done/<original>`**
(`git branch -m <original> done/<original>`). The prefix is a pruning marker,
not an archive: it records "merged, safe to delete without re-verifying".

That marker earns its keep because **under squash merge, git cannot tell you a
branch was merged.** Squashing rewrites the commits, so the branch tip is never
an ancestor of the default branch: `git branch --merged` lists nothing, and
`git branch -d` refuses with *"the branch is not fully merged"*. Verified on a
squash-only repo (`allow_merge_commit: false`) against 37 real `done/` branches.
So on these repos the prefix carries information git has no way to derive, and
`-D` is the only delete that works — the rename is what licenses it, because
you asserted "merged" at the moment you knew it was true.

```bash
# List first. `refs/heads/done/*` silently matches only un-nested names
# (6 of 37 here) — `*` does not cross `/`. Use `**`.
git for-each-ref --format='%(refname:short)' 'refs/heads/done/**'
git for-each-ref --format='%(refname:short)' 'refs/heads/done/**' | xargs -r git branch -D
```

The two settle into one lifecycle — `done/` is the staging state, deletion is
the end state — so pick per repo and don't treat the choice as a contradiction:

- **Auto-delete on** — nothing to do; the head branch goes at merge.
- **Auto-delete off** — rename to `done/<original>` rather than leaving a
  merged branch under its original name, then prune periodically.

Either way the *remote* side is settled at merge; `done/` is about the local
branch list you actually read every day.

Two things stay wrong either way: **leaving a merged branch under its original
name** (indistinguishable from live work, so every later sweep has to re-verify
it), and **treating a deleted merged branch as something to restore** — fetch
the `refs/pull` ref above instead.

This supersedes two earlier swings. The first required the `done/` rename and
called deletion lossy; the premise was wrong. The second banned the rename on
that correction, which overshot — deletion being safe is not a reason the
pruning marker can't exist. What actually generated a contradiction at every
merge was pairing a mandatory rename with auto-delete, and naming the repo
setting as the deciding input removes it.

## Merge on green — the default

Open PRs ready (not draft) and merge as soon as CI is green. Full rule + the
carve-outs (outward-facing / hard-to-reverse / explicit hold):
[`anti-patterns.md` → "Merge on green by default"](./anti-patterns.md).

**Gate the merge on the check command's OWN exit status — never through a
pipe.** `gh pr checks N --watch | tail` reports tail's exit code, not the
checks', so `&& gh pr merge` fires even when a check failed. Same trap:
`npm audit | tail; echo $?`. Correct shape:
`gh pr checks N --watch >/dev/null && gh pr merge N --squash`. (Precedent:
2026-07-25, forge PR #22 merged past a red Security Scan exactly this way.)

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

## Shared planning docs — check who else is in the file

Worktree isolation does not prevent two branches editing the same doc or the same
lane. Before touching a regression log, BACKLOG, digest or tracker — or starting a
fix in a busy area — list the open PRs already in that file, keep shared-doc edits
in their own PR, and fix any claim your own change makes stale rather than handing
it to another session. Full rule:
[`anti-patterns.md` → "Concurrent branches collide in content"](./anti-patterns.md).

## Bug-fix pre-flight — read the regression log FIRST

Before writing any code for a reported bug, read the app's
`memory/project_regression_log.md` end to end (it's a 30-second read; a build
is minutes):
1. Symptom matches a logged entry → link it, check whether the prior fix
   regressed (run its test), patch from that starting point — don't re-discover.
2. No match → TDD loop below; once the fix lands, add a new entry
   (symptom → root cause → fix → test → lesson). One-liners get logged too.
   Key the new row by date — `YYYY-MM-DD` plus a letter for a second row the same
   day (`2026-07-26a`, `2026-07-26b`) — never a hand-picked sequential number: two
   sessions appending on different days then cannot collide, and a same-day clash
   shows up as a visible letter conflict instead of a silent renumber. Rows already
   carrying integers keep them, so existing "row 34" references stay valid. Check
   who else is in the file first (see "Shared planning docs" above).
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

## Docs stay lean — shipped items collapse to a one-line tombstone

The PR is the permanent home of implementation detail (diff, decisions,
verification); planning docs are for OPEN work. So when an item ships, don't
leave its full body in the doc — **collapse the entry to one line**:
`~~<title>~~ — shipped <date>, PR #<n> (<SHA>)`. Delete the body (acceptance
criteria, design notes, discussion): anyone who needs it follows the PR link.
Long-form docs in `backlog/` for shipped items get deleted outright, with the
tombstone line in BACKLOG.md pointing at the PR. This applies to every repo;
roadmap-pulse's honesty pass enforces it weekly (it tombstones confirmed-shipped
entries as part of Step 1). A doc that keeps growing after its work ships is a
word block nobody reads — the failure mode this rule exists to prevent.

**Shipped-ness alone is not grounds to collapse. What the text is FOR decides.**
Two carve-outs, both learned by breaking them (alate PRs
[#342](https://github.com/Tessellate-Studio/alate/pull/342) →
[#349](https://github.com/Tessellate-Studio/alate/pull/349)):

1. **A PR holds what was DONE, not what was considered and rejected.** Before
   collapsing, ask whether the body contains anything *no diff can give back*:
   a rejected alternative and why it lost, an investigation that corrected a
   false belief, external research, a "don't try this again" finding. That
   content was never in a commit, so collapsing it destroys it permanently —
   the PR link goes to a diff that never contained it. Keep those lines next to
   the tombstone; a few surviving sentences are cheaper than re-running the
   investigation. *(What was lost the first time: a full-branch history search
   establishing that a feature believed to be a "re-plug" had never existed.
   The search was real work and left no commit.)*
2. **Test artefacts are not planning docs.** Coverage maps, user-path audits,
   E2E contracts and regression tables (e.g. alate's `USER_PATHS.md`) describe
   paths that must still be *exercised*. A shipped fix there keeps its full
   `Was` / `Now` split — `Was` is the repro, `Now` is the assertion, and a
   tester needs both. Cite the PR alongside them; never collapse them into it.
   Mark such docs with a header note putting them out of scope for this rule.

Watch for **line-count parity masking content loss**: a table row that loses a
column leaves the file the same length. Diff the content, not the line count.

## CI spend — heavy builds are MANUAL-DISPATCH ONLY

**No build runs unless a human asked for it.** Free-tier Actions minutes are a
shared, org-wide, monthly budget: when they run out, *every* private repo's CI
dies at once — including the cheap PR gates that had nothing to do with the
spend. Builds are cloud-only (never compiled on the laptop), so the cloud budget
is the only budget there is. Protect it at the trigger, not with a spending cap.

**Heavy** = Android APK/AAB, EAS, Gradle, Xcode, Docker image builds, emulator
E2E — anything measured in tens of minutes. Heavy workflows carry
`workflow_dispatch` and nothing else, unless the user explicitly asks otherwise.

- **Never `on: push`** for a build (not master, not any branch).
- **Never `schedule:`** for a build. A timer builds artefacts nobody is waiting
  on, and a hung one bills silently until the job timeout kills it.
- **Never chain heavy→heavy.** A build must not `repository_dispatch` another
  repo's emulator/E2E run automatically; the downstream repo's heavy workflow
  stays dispatch-only and gets pointed at an existing artefact by hand.
- **Release tags (`push: tags: v*`) are the one allowed automatic build** — a
  tag *is* the explicit human request. Tag deliberately; four tags in a day is
  four full builds.

**Cheap gates stay automatic.** Unit tests, lint, typecheck, secret/PII scan,
deploy hooks — keep these on `pull_request`. They are the safety net and they
cost single-digit minutes. Don't "save minutes" by removing a gate; save them by
not building.

Two supporting habits, both of which pay for themselves:
- `concurrency: { group: …, cancel-in-progress: true }` on every heavy workflow,
  so a superseded run stops instead of finishing.
- An explicit `timeout-minutes` (never GitHub's 6-hour default) on every heavy
  job. *Precedent: a hung Gradle daemon ate the full 6-hour default on every
  scheduled alate run for a month — invisible, because a timeout ends in
  `cancelled`, not `failure`.*

**Non-builds on a schedule are fine** when the cron *is* the feature (a nightly
data-retention/GDPR deletion job, a cert renewal). Judge by cost and purpose, not
by the presence of the `schedule:` key.

**Why:** *2026-07-18 — Tessellate-Studio exhausted its 2,000 included minutes and
every private repo's Actions stopped mid-session. Public repos kept running,
which is what made it legible as a budget problem rather than a config one.*

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
