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

## Merge on green — a STANDING directive, not a per-task instruction

Open PRs ready (not draft) and merge as soon as CI is green — **without being
told, without asking, on every PR** (user directive 2026-08-19: merge-on-green
is a build directive, not something to be requested each time). "PR open,
awaiting merge" is not an end state; either the merge is armed or a named
carve-out applies (outward-facing / hard-to-reverse / explicit user hold —
full list: [`anti-patterns.md` → "Merge on green by default"](./anti-patterns.md)).

**Arm it at PR-open, don't babysit it:** right after `gh pr create`, run
`gh pr merge <n> --squash --auto` — GitHub merges the moment checks pass, with
no watcher process to time out or die with the session. If the repo rejects
`--auto` (auto-merge disabled in settings), fall back to the gated watch below.

**`--auto` succeeding is not proof it will wait — verify the repo actually has
a merge gate before trusting it.** GitHub's auto-merge only blocks on required
status checks; if the repo has none configured, `--auto` reports success and
merges the PR **immediately**, before CI even starts, with no error to catch —
the exact same success message as the case where it genuinely waited. A repo
can have no required checks for reasons that have nothing to do with the
`gh pr merge` command itself: no branch-protection rule exists yet, or (the
sharper trap) the plan tier can't have one at all — a private repo on GitHub's
free tier 403s on `gh api repos/<owner>/<repo>/branches/<default>/protection`
with "Upgrade to GitHub Pro or make this repository public," meaning `--auto`
can *never* gate there no matter how it's configured. **Check this once per
repo, before the first `--auto` of the session**
(`gh api repos/<owner>/<repo>/branches/<default-branch>/protection` — a 403/404
means no gate exists) and route accordingly: if it succeeds and lists
`required_status_checks`, `--auto` is safe to trust for the rest of the
session; if it 403s/404s, use the gated watch (below) for **every** merge in
that repo, not just when `--auto` is rejected — rejection and "succeeds with
nothing to wait on" look identical from the command's own exit code, so the
repo-level check is the only way to tell them apart. (Precedent: 2026-08-24,
alate — five PRs in one session each merged within 1-2 seconds of `--auto`,
CI still queued/running on the self-hosted runners at merge time; the
branch-protection check 403'd with the free-tier message above. Every `--auto`
merge in that repo has been landing before its own CI result exists, silently,
since the repo's creation — not a one-off.)

**Gate the merge on the check command's OWN exit status — never through a
pipe.** `gh pr checks N --watch | tail` reports tail's exit code, not the
checks', so `&& gh pr merge` fires even when a check failed. Same trap:
`npm audit | tail; echo $?`. Correct shape:
`gh pr checks N --watch >/dev/null && gh pr merge N --squash`. (Precedent:
2026-07-25, forge PR #22 merged past a red Security Scan exactly this way.)

## Local gates stay light — the runner is the authoritative gate

The laptop is not CI. Full test suites, full-repo typechecks and full-repo
lints belong on the self-hosted runners, where they gate the merge; local
hooks exist only to catch cheap mistakes before a push, and they must be
**proportional to the diff** (user directive 2026-08-19, after concurrent
local suites repeatedly overheated the machine and blocked pushes on
timeout-flake):

- **Docs-only diff** (every changed file is `*.md` or otherwise untestable) →
  hooks skip typecheck, lint and tests entirely. Running a test suite to
  gate a README line is the failure mode this rule exists to kill.
- **Code diff** → local hooks run at most a SCOPED typecheck (only the
  workspaces with changed files) plus cheap greps (secrets, branch guard).
  Never a full jest/vitest suite locally — that is the runner's job, and the
  merge is already gated on it.
- Timeouts inside tests must carry headroom for slow dev machines (a 5s
  budget that CI meets in 1s can sit at 4.8s locally — precedent: alate
  `colorExtractor.test.ts`, 2026-08-19); but the primary fix is not running
  the suite locally at all.
- One heavy local job at a time. Two `npm ci` runs plus a jest suite in
  parallel produced every local "failure" of 2026-08-19 — all of them
  timeout flake, none of them real.

Escape hatches stay: a hook may offer a full-suite mode behind an explicit
env var for whoever wants belt-and-braces locally. The default is light.

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
lane. Before touching a regression log, BACKLOG, digest or runbook — or starting a
fix in a busy area — list the open PRs already in that file, and fix any claim your
own change makes stale rather than handing it to another session. Commit
boundaries follow the logical change as usual: a doc edit that is part of the
change goes in its commit; a separate concern (a regression-log row, a BACKLOG
status) gets its own commit, same PR is fine. Full rule:
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
regression-log row, a RELEASE checklist line, a runbook TODO — **update that
entry in the same PR** that ships the change: status (DONE + date), the PR
number, and the merged SHA once it lands. A tracked item whose fix shipped but
whose entry still says "open" is how work gets re-done and users re-ask.
(Verification bar: the SHA in the entry must be reachable from the default
branch — see "Speak from authority" in
[`authoritative-claims.md`](./authoritative-claims.md).)

## Device-test queue — enqueue what only a human with the phone can verify

Some changes need a human holding the device: gesture feel, animation quality,
camera/share-sheet flows, multi-step journeys on real accounts, anything gated
behind a store-track install. A session that ships such a change does not wait
to be asked — it **enqueues the test before ending the turn**, so a later
`/forge:device-test` drain session can walk the user through everything
pending, across apps, in one sitting.

**Queue only what you cannot verify yourself.** adb screenshots, logcat,
`adb shell input` taps on a connected device, jest, Metro — all self-serve; do
those and don't queue them. The queue holds the residue that needs human hands
or human judgment.

**The queue is one pinned GitHub issue per app repo** — title
`Device test queue`, label `device-test-queue`. Items are comments on it:
comments never merge-conflict across concurrent branches, and issues put zero
files in the repo, so nothing can leak into the app package. If the issue or
label doesn't exist yet, create and pin it (self-healing beats asking):

```bash
gh label create device-test-queue --repo Tessellate-Studio/<repo> \
  --color 5319e7 --description "Pinned queue of on-device tests" || true
gh issue create --repo Tessellate-Studio/<repo> --title "Device test queue" \
  --label device-test-queue \
  --body "Pending on-device tests. Sessions append comments in the format from forge standards/workflows.md → Device-test queue; /forge:device-test drains them. Do not edit others' comments except the Status line at drain time."
gh issue pin <n> --repo Tessellate-Studio/<repo>
```

**Enqueue = one comment on that issue, in this fixed format** (drain sessions
parse it — keep the bold field names exactly):

```markdown
### <one line: what changed, user-visible phrasing>
- **PR:** #<n> · **SHA:** <merged sha, or "unmerged — branch <name>">
- **Delivery:** <how it reaches the phone: production OTA (published/pending) |
  needs tag build v<x.y.z> | Expo Go | dev build | APK sideload>
- **Needs runtime:** <expo.version / versionCode / fingerprint the installed
  app must have for this change to be receivable, or "any">
- **Steps:** <numbered, from app-open to the moment of truth>
- **Expect:** <what a pass looks like, concretely>
- **Status:** OPEN
```

- **Write Steps machine-first.** The drain agent executes every step it can
  reach itself — app launch/force-stop, navigation taps (`adb shell input
  tap`/`text`/`keyevent`), screenshots (`adb exec-out screencap -p`), logcat
  watches — and involves the human only for what genuinely needs judgment or
  a human-only surface (gesture feel, animation quality, camera/biometrics,
  real-account sign-ins, iOS/TestFlight where there is no adb). Prefix those
  steps with `HUMAN:`; an item whose steps carry no `HUMAN:` prefix is fully
  agent-verifiable and gets tested and closed with zero user involvement.
- **Needs runtime** is the field that saves the sitting: an OTA stranded by a
  runtime-fingerprint drift is untestable until a new store build is installed.
  Record what the phone must run, so the drain session skips-with-reason
  ("needs the v1.2.2 tag build — install first") instead of chasing a stale OTA.
- Items are closed by **editing the comment's Status line**
  (`**Status:** ✅ done <date>` or `**Status:** ❌ failed → <link>`) — never by
  deleting the comment. A failed test's findings go to the app's regression log
  or a new issue; the Status line links there. The queue holds tests, not
  investigations.
- Enqueue in the same session that ships the change — a queued item written
  while the context is warm has real Steps and a real Expect; one written later
  from the diff has neither.

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

## External-tool actions — the manual runbook

Every app keeps one `docs/manual-runbook.md`: the standing runbook for setups a
**human** must perform in someone else's console — the steps no script can take
for them. (Called `user-actions-tracker.md` until 2026-08-11. A procedure large
enough to deserve its own file still gets one, shaped by
`docs/_USER_DOC_TEMPLATE.md`; the manual runbook is where everything else lives.)

When a session decides which external tool/provider to use for a setup (DNS,
email, OAuth app, CI secret, …), an entry lands in it **before the session
ends** — actual provider,
actual values, numbered copy-pasteable steps (never "if you choose A vs B"
branches), verification command(s), and a "where to look" diagnostic. Not an
evaluation of options (that's BACKLOG); only the decided outcome. BACKLOG holds
*what + why*; the runbook holds *exactly how*. Cross-link, don't copy.

### The runbook's shape — same in every repo

One header block (purpose + status legend + the move-to-Done rule), a **Status at
a glance** table linking to the sections, then one section per open setup:

```markdown
## <Setup name>

**Status:** <emoji> <one line — what state it is actually in>

**What's left:** <one line — the action, or "nothing, blocked on X">

**Steps:**

1. <copy-pasteable, with the real values>

**Verify:** <command(s), then checkboxes for what a good result looks like>
```

Legend: ✅ done · 🟡 in progress (action left) · 🚧 blocked (not on you) ·
📖 reference · 🔲 not started.

**When a setup is finished, MOVE IT.** Delete its section, add a one-liner under
a `## Done` heading at the bottom, and repoint its table row at `#done`. A
finished setup left as a full section is the main way this file rots — it reads
as outstanding work and buries the items that actually are. A small residual is
fine in a Done one-liner; a whole section is not. If half an item is still
running, split it.

**What does NOT belong:** why the decision was made, what was evaluated and
rejected, what changed in which PR, narrated findings. That is BACKLOG's job and
git history's job. If a paragraph would still read fine with *"probably"* in it,
or if it tells a story rather than issuing an instruction, it is not runbook
content. A reader should be able to scan the table, find their one action, and
do it without reading a word of context.

## Doc placement

Every documentation type has one defined location — see
[`doc-placement.md`](./doc-placement.md) before creating or moving any doc.
