# Development workflows (platform standard)

**This file is the single home for the working rules every Tessellate app
follows.** An app's `CLAUDE.md` carries a ONE-LINE pointer per rule — never a
restatement. A rule written in two places drifts two ways; when a rule here
needs an app-specific delta, the app notes only the delta under its own
"App-specific" section and links back here.

Rules that are anti-patterns (merge-on-green, concurrent-session isolation,
TDD-for-data-flows, …) live in [`anti-patterns.md`](./anti-patterns.md) and are
only _linked_ from here — same single-home principle.

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
`git branch -d` refuses with _"the branch is not fully merged"_. Verified on a
squash-only repo (`allow_merge_commit: false`) against 37 real `done/` branches.
So on these repos the prefix carries information git has no way to derive, and
`-D` is the only delete that works — the rename is what licenses it, because
you asserted "merged" at the moment you knew it was true.

**The licence is only as good as the assertion, so classify before you delete —
but classify against the MERGE RECORD, not the commit subject.** An earlier
version of this section told you to subject-match against the default branch,
on the reasoning that squash rewrites the SHA but preserves the subject. That
reasoning is wrong: GitHub's squash commit takes the **PR title**, which is
routinely reworded at merge time, so a landed branch reads as UNLANDED.

It failed immediately. On loom (2026-09-05) subject-matching flagged 2 of 12
`done/` branches as never landed — `done/claude/size-finder-ux-issues-889306`
and `done/fix/size-finder-inches-autoswitch`. Both had in fact merged, as #87
and #89, each retitled at squash time. The heuristic was not a conservative
approximation; it was noise in the one direction that decides the delete.

Ask the forge that actually merged it. Strip the `done/` prefix to recover the
branch name the PR was opened from:

```bash
# 1. CLASSIFY FIRST. Never pipe the list straight into `branch -D`.
#    `refs/heads/done/*` silently matches only un-nested names (6 of 37 in the
#    original sweep) — `*` does not cross `/`. Use `**`.
git fetch origin --quiet
for b in $(git for-each-ref --format='%(refname:short)' 'refs/heads/done/**'); do
  sha=$(git rev-parse --short "$b")
  pr=$(gh pr list --state merged --head "${b#done/}" --json number --jq '.[0].number')
  if [ -n "$pr" ]; then
    echo "MERGED as #$pr   $sha  $b"
  else
    echo "NO MERGE RECORD  $sha  $b   <- investigate before deleting"
  fi
done

# 2. Record the SHAs you are about to drop, then delete ONLY the merged ones,
#    named explicitly. `--format` is required above: the default output is
#    `<sha> commit<TAB><ref>`, so without it xargs feeds SHAs to `branch -D`.
git branch -D done/<merged-one> done/<merged-two>
```

`NO MERGE RECORD` means "GitHub has no merged PR whose head was this branch" —
which covers a branch merged locally, or one pushed under a different name, not
just genuinely unlanded work. Treat it as a prompt to look, never as proof. The
cheap follow-up is `git diff origin/HEAD...$b --stat`: an empty diff means the
content is already on the default branch whatever the PR record says, and a
non-empty one tells you exactly what you would be dropping.

One more thing that will bite during the sweep: a branch **checked out in a
worktree** cannot be deleted at all — git refuses, so finish or
`git worktree remove` that worktree first.

The two settle into one lifecycle — `done/` is the staging state, deletion is
the end state — so pick per repo and don't treat the choice as a contradiction:

- **Auto-delete on** — nothing to do; the head branch goes at merge.
- **Auto-delete off** — rename to `done/<original>` rather than leaving a
  merged branch under its original name, then prune periodically.

Either way the _remote_ side is settled at merge; `done/` is about the local
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

**Merge through a route that actually waits.** There are exactly two, and the
`[enforced]` hook below refuses everything else:

```bash
# A merge you were asked for:
gh pr checks <n> --watch >/dev/null && gh pr merge <n> --squash

# An automated fix (crash-monitor, status-check, security-sweep):
node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo <owner/name> --pr <n> \
  --source <skill> --what "<one line>" --declare guard|rewrite
```

**`gh pr merge --auto` is banned outright**, and this paragraph used to
recommend it — "arm it at PR-open, don't babysit it". That advice was wrong and
shipped unverified merges for months. GitHub's auto-merge blocks only on
REQUIRED status checks; no repo in this org has any (the private ones cannot,
on Free), so `--auto` merges immediately, before CI starts, returning the
identical success message it gives when it genuinely waited. Measured on alate,
2026-08-24: five PRs each merged 1-2 seconds after the call with CI still
queued. `hooks/merge-gate.mjs` now denies the flag, so the old advice is not
merely stale — it is unrunnable.

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
can _never_ gate there no matter how it's configured. **Check this once per
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

**[enforced] A hook refuses an ungated merge — this is no longer only prose.**
`hooks/merge-gate.mjs` runs on `PreToolUse` for `Bash` and `PowerShell` and
denies the tool call outright unless the command is one of the two sanctioned
routes: the `safe-merge` CLI, or a `gh pr checks … --watch` gated to the merge
by a single `&&` with its own exit status intact. It also refuses `--auto` and
`--admin` unconditionally, and refuses `;` / `||` sequencing, which does not
gate at all (`||` merges precisely _because_ the check failed). The other two
spellings of a merge — `gh api --method PUT …/pulls/N/merge` and a GraphQL
`mergePullRequest` mutation — are covered too, since blocking only the obvious
one moves the problem rather than solving it.

Three things worth knowing about it:

- **It constrains the agent, not you.** `PreToolUse` sees the model's tool calls
  only; your own terminal and the GitHub UI are untouched.
- **It reads command position, not raw text.** Quoted spans are blanked before
  matching, so a commit message or a doc that mentions `gh pr merge --auto` is
  prose, not an argument. A gate that blocked its own documentation would be
  something to route around rather than satisfy.
- **It fails closed.** A command that is merge-shaped but cannot be classified
  is denied. A false deny costs one retry through a sanctioned route; a false
  allow ships unverified code.

Why it exists at all: every rule above was written down before it was enforced,
and each was then broken by the same session that could have read it — alate's
five 1-2s merges, forge #22's pipe, and the 2026-09-08 session that merged
loom#131 and mood-layer#111 with a bare `gh pr merge --squash` an hour after
documenting why not to. `safe-merge` already says it: _a gate the caller can
decline to invoke is not a gate_. That was true of `safe-merge` itself until
this hook.

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

## Large command output — wrap it in `brief`, don't dump it raw

Any command that can produce a big, unpredictable amount of output (`git
diff`/`git log`, `npm install`, `find`, full test runs, build logs — not
just git) burns context tokens for no benefit once the output exceeds what
actually gets read. Run it through `brief` instead of calling it raw:

```
brief git diff
brief npm test
brief find . -name '*.snap'
```

`brief` (`tools/brief/`, installed as the `brief` bin) runs the command and:

- prints output as-is when it's already small — no overhead;
- on a non-zero exit, always prints the FULL output — a failure is exactly
  the moment you can't afford to lose information, so nothing is
  summarized;
- on success with large output, keeps the head and tail and collapses the
  middle to a count, and always saves the untouched original to disk,
  printing its path so it can be read back if the summary wasn't enough.

`brief --full <command>` skips summarization outright. This is a default
habit, not a mandate — reach for the plain command when you already know
the output will be short or you need to pipe it into something else.

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

## Work claims — say who is on an issue/PR, before you start

Every session commits under the same GitHub account, so the byline names
nobody, and the branch, worktree and planning doc all live somewhere no other
session can see. **Claim the item the moment you pick it up** — a comment on
the issue/PR itself, plus the `claimed` label so it shows in GitHub's own issue
list and the board can list it in one request per repo.

```bash
wip                                  # the board — who is on what
wip claim alate#562 --doc memory/decisions/rfd-003-queue-lock.md
wip touch alate#562                  # heartbeat, at each commit/push/phase
wip release alate#562                # done, stalled, or handed back
wip sweep                            # drop labels whose claim has died
wip scan                             # moved recently, but nobody claimed it
```

That posts:

```markdown
### 🚧 Work claim

- **Claimed by:** <branch (session-id tail)>
- **Session:** `claude --resume <session id>` on <host>
  <or: session not identified — reconstructed from the live worktree>
- **Worktree:** `<absolute path>` (branch `<branch>`)
  <or: — no local worktree (branch `<branch>`), for a branch only on origin>
- **Started at:** <ISO 8601 UTC>
- **Last touch:** <ISO 8601 UTC — rewritten at each checkpoint>
- **Related:** <the issue a PR implements, the PRs carrying an issue, or —>
- **Docs:** <RFD / ADR / pitch / backlog entry this is built against, or —>
- **Waiting on:** — <or: human — what you handed them>
- **Claim:** HELD
```

Four fields carry the whole value, because they are the ones another agent
cannot derive: **session** (resume it, don't restart it), **worktree** (where
the in-flight code is), **docs** (what it is built against), **related** (the
issue a PR implements, or the PRs carrying an issue). Without them a claim is
just a "someone is on it" sticker.

**Who claims:** anyone about to spend more than a couple of minutes on an item
someone else could also pick up — every skill that opens work, and hand-driven
sessions alike.

### The rules

- **Read before you take.** `wip` prints the board, and the SessionStart hook
  puts live claims in front of every new session. Held and still alive → don't
  start; resume that session or say what you need. Free, released, or silent
  past the window → take it, and say so (`wip claim <item> --force`).
- **Idle is not abandoned — a claim survives seven days of silence,** and
  activity on the item counts as a touch, so nothing depends on remembering
  `wip touch`. The board says _quiet_ past 8 hours; nothing acts on it.
- **Parked on a human never expires.** `wip touch <item> --waiting-on "human —
<what>"` before handing over; clear it when you resume.
- **Release when you stop** — done, failed, stalled, or handed back unfinished.
  Merging the PR is not a release: the merge closes the work, the release
  closes the claim.
- **The label is swept, not trusted.** `wip sweep` drops it wherever nothing
  live holds the item — a **closed item with a claim still HELD**, or an **open
  item whose every claim has gone silent** past the window. It never sweeps an
  open item that is merely quiet, never touches a live claim, never edits a
  comment body, and never calls a repo it could not read clean. `status-check`
  sweeps at session wrap-up.
- **`wip scan` is the other half.** The board can only show what it was told,
  so unclaimed work looks like no work. `scan` lists items that moved recently
  with no claim — it reports, never auto-claims.
- **It is advisory,** and not a device claim: 🔒 below locks one physical
  handset, 🚧 says who owns a piece of work. A device-test drain takes both.

Format, lifecycle and the reasoning behind every threshold live with the code —
`tools/work-claim/lib/claim.js` (`STALE_MINUTES`, `CLAIM_LABEL`) and
`tools/work-claim/cli.js` (`sweep`). **Change the behaviour, change this
section**: three PRs in this series changed what the tool does and left this
text describing the old behaviour, which is how the sweep rule here came to
describe a bug that had already been fixed.

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

**If the fix also has a tracked GitHub issue, close it the same way — via a
keyword in the PR body, not a follow-up edit.** GitHub only auto-closes an
issue on merge when the PR body (or a commit message) contains a closing
keyword — `Fixes #<n>` / `Closes #<n>` / `Resolves #<n>` — immediately
followed by the issue number. A plain reference like `[#<n>](url)` does
nothing; the issue merges still open. (alate #596/#599, 2026-08-25: PR #599's
body linked `[#596]` without the keyword, so the fix shipped but #596 stayed
open until the user closed it by hand hours later.) Use the exact issue
number, one keyword per issue, in the PR body — that's checked at merge time
and survives squash merges, unlike a commit message buried mid-branch.

## Device-test queue — enqueue what only a human with the phone can verify

Some changes need a human holding the device: gesture feel, animation quality,
camera/share-sheet flows, multi-step journeys on real accounts, anything gated
behind a store-track install. A session that ships such a change does not wait
to be asked — it **enqueues the test before ending the turn**, so a later
`/forge:device-test` drain can walk everything pending, across apps, in one
sitting.

**Queue only what you cannot verify yourself.** adb screenshots, logcat,
`adb shell input` taps on a connected device, jest, Metro — all self-serve; do
those and don't queue them. The queue holds the residue that needs human hands
or human judgment.

**A test is one GitHub issue in the app's own repo, labelled `device-test`.**
Its id is the issue number (`alate#712`) — which exists at creation, never
changes, and is a live link anywhere. Open/closed and labels carry the state;
nothing is parsed out of prose.

| Situation | Issue state | Labels |
|---|---|---|
| Pending, agent-runnable | open | `device-test` |
| Pending, needs a person | open | `device-test` `needs-human` |
| Blocked on a native build | open | `device-test` `needs-build` |
| Parked by decision | open | `device-test` `parked` |
| Failed, bug filed | **open** | `device-test` `failed` |
| Passed | closed, reason `completed` | `device-test` |
| Withdrawn / superseded | closed, reason `not_planned` | `device-test` |

**A failed test stays OPEN**, labelled `failed`, linking the bug it produced.
It is retired only when a later drain re-runs it after the fix lands and it
passes. Closing on failure is how a bug stops being re-checked.

**Withdrawn is not a pass.** `not_planned` means superseded, invalid, or
dropped — reporting it as done would claim a verification nobody performed.

*(This replaced one pinned issue per repo with tests as comments, 2026-09-09,
[RFD-003](../memory/decisions/rfd-003-device-tests-as-issues-one-global-device-lock.md).
That medium needed five parser repairs — forge #79, #80, #81, #102, #117 —
every one the same defect: a comment has no state, so state was simulated in
prose, and prose drifts. A `**Status:**` line, a mirrored heading glyph, an id
stamped by a second API call, and "one comment per test" as convention are all
things an issue simply is.)*

### Enqueue

```bash
dtq enqueue --repo alate --intent "budget-column-739 — BUDGET is always the fifth column" \
  --verifies 739 --sha 8d3ce08 \
  --delivery "production OTA once #739 lands. Both platforms." \
  --needs-runtime 1.3.1 \
  --step "Profile → Price range → clear any budget. Open a fit check." \
  --step "HUMAN: judge whether the ring reads as empty rather than broken." \
  --expect "Five columns, BUDGET an empty ring with a muted em dash."
```

The body template lives in forge (`skills/device-test/scripts/enqueue.js`), not
as a `.github/ISSUE_TEMPLATE` file in each app — ADR-003's zero-files
constraint still holds, and four template copies would drift four ways.
`--dry-run` prints what it would create.

**It searches before it creates.** An open `device-test` issue whose intent
matches gets the new detail as a comment instead of a second issue; the same
failure is routinely reported by several sessions, and a queue with four
copies of one test wastes a device sitting four times over.

**Labels are created on first use** — self-healing, so a repo joining the
queue needs no setup:

```bash
for l in device-test needs-human needs-build parked failed; do
  gh label create "$l" --repo Tessellate-Studio/<repo> --color 5319e7 || true
done
```

### What goes in the body

- **`**Verifies:** #<pr> (<sha>)`** — a plain reference, **never** a closing
  keyword. A merged PR saying `closes #712` would close the very test that
  exists to check it. GitHub renders the cross-reference on the PR's timeline
  either way, and every later PR mentioning the test number appears on the
  test's timeline — the traceability the comment medium could never have.
- **`**Delivery:**`** — how it reaches the phone: production OTA
  (published/pending) | needs tag build v<x.y.z> | Expo Go | dev build | APK
  sideload.
- **`**Needs runtime:**`** — the `expo.version` / versionCode / fingerprint the
  installed app must have for this change to be receivable, or "any". This is
  the field that saves the sitting: an OTA stranded by a runtime-fingerprint
  drift is untestable until a new store build is installed, and recording it
  lets the drain skip-with-reason instead of chasing a stale OTA.
- **`**Steps:**` as a task list** (`- [ ] 1. …`). A drain ticks a box when it
  RUNS that step, pass or fail, so a step nobody reached stays unticked and
  reads as *not run* with no prose to interpret. **Expect stays numbered** —
  an expectation is judged, not performed, and a checkbox invites ticking one
  that failed.

**Prove the Steps are reachable on the user's real setup before you write
them.** A test that cannot run on any device or store you have is not a test;
it is a request for someone to discover that for you. One `curl` first would
have saved a live store setting being flipped for nothing (alate, 2026-09-05).

**Write Steps machine-first.** The drain executes every step it can reach
itself — launch/force-stop, `adb shell input tap`/`text`/`keyevent`,
`adb exec-out screencap -p`, logcat — and involves a human only for what needs
judgment or a human-only surface (gesture feel, camera/biometrics,
real-account sign-ins, iOS/TestFlight where there is no adb). Prefix those
`HUMAN:`; that prefix is what labels the issue `needs-human`.

**Steps are independent unless a step says otherwise.** The drain runs every
step still reachable after one fails, and records each step's own outcome —
a failed step is a finding, not a reason to stop probing
([`anti-patterns.md`](./anti-patterns.md)). Say `DEPENDS: step N` when a step
genuinely cannot run without an earlier one.

**A `✅` may not carry an unresolved caveat in prose.** Before closing a test
as completed, re-read the result for hedge vocabulary — *unproven, unverified,
still unobserved, never been run, inferred rather than observed, does not
cover, worth carrying*. Every hit is either resolved, or filed as its own
issue whose number appears in the result. A caveat under a passed line is gone
the moment the drain moves on. Standard:
[`authoritative-claims.md`](./authoritative-claims.md) → "Labelling is not
tracking."

### Keeping a test true

**Notes are ordinary comments** on the test's own issue, in reading order. No
rule, no parser boundary, no "fields above, notes below" convention to drift.

**One test per issue.** Two tests stacked in one body means the second has no
row on any board — `dtq` counts the `### <glyph>` headings in a body and says
how many are hidden behind the one it is showing.

**A PR that deliberately changes behaviour an open test covers must amend that
test in the same PR** — edit the Expect, add a comment, or close it
`not_planned` with the reason. Same shape as the existing "if your change makes
a doc claim stale, fix it in the same PR" rule, applied to tests. Timeline
cross-references make finding them a lookup rather than a search.

**Enqueue in the same session that ships the change.** A test written while
the context is warm has real Steps and a real Expect; one written later from
the diff has neither.
### Claiming the device — one lock per handset, in litmus

`dtq` is read-only. It answers _what is pending_; it never answered **is
anyone on the device right now**. Nothing did. On 2026-09-01 two sessions
reached for the same handset within the hour — one ran a 15-cycle relaunch
investigation and a full drain, the other had enqueued a device item without
claiming the device. Neither announced, and because every session commits
under the same GitHub account the byline reveals nothing, so the collision had
to be reconstructed afterwards by one session messaging the other.

**The lock is a comment on the device's own issue in
`Tessellate-Studio/litmus`** — one pinned issue per physical handset
([#43](https://github.com/Tessellate-Studio/litmus/issues/43) the Pixel,
[#44](https://github.com/Tessellate-Studio/litmus/issues/44) the iPhone). No
new service, no local state file a second machine cannot read — any session,
on any machine, and any human sees it with the tools they already use.

**Why not the app's queue, where it used to live** (changed 2026-09-09,
RFD-003 / forge#107): the device is not any one app's. alate, mood-layer and
badige all drive the same handset, so a lock posted on alate's queue was
invisible to a drain reading mood-layer's — every other queue reported the
phone free while someone held it. litmus is the private shared
testing-utilities repo for the mobile apps, which is a device's charter
exactly; it is private, so a claim may name what is being tested; and it is
not forge, which is public.

**One issue per DEVICE, not per app**, because they are claimed
independently: a drain can hold the Pixel over adb while a human is mid-way
through a TestFlight pass on the iPhone, and neither should block the other.
The iPhone's claim sits permanently at `**Waiting on:** human`, which never
expires — the honest description of a device with no adb path, not a way
around the staleness rule.

**Two rules make a race resolve without a lease or a clock:**

1. **Post, then re-read.** After posting, wait ~5s and re-read every HELD
   claim on that device's issue. If another HELD claim has a **lower comment
   id**, release yours and stand down. Ids are server-assigned and monotonic,
   so both racers reach the same verdict independently — the 16-second
   collision on 2026-09-07 resolves in one round trip. (`losesRaceTo` in
   `skills/device-test/scripts/claim-lib.js`.)
2. **Re-check at the point of use.** Before each device-driving step, re-read
   the lock and abort if you no longer hold the lowest live claim. This is the
   nearest thing to a fencing token available over adb.

**An unreadable lock is not a free device.** If the device issue cannot be
read, `dtq` prints `? UNREADABLE` rather than `free`, and that is a reason to
stop — "nobody is on the phone" and "I could not find out" are opposite
instructions to a session about to drive it.

```markdown
### 🔒 Device claim

- **Claimed by:** <session name>
- **Device:** <adb serial, or "any">
- **Claimed at:** <ISO 8601 UTC>
- **Last touch:** <ISO 8601 UTC — rewritten on every device action>
- **Waiting on:** — <or: human — what you handed them>
- **Claim:** HELD
```

**A claim ends when its holder closes it, not when a timer expires.** The
first version of this lock expired 45 minutes after it was taken, which
measured the wrong thing: plenty of fixes run longer than that, and a session
still working the phone had its claim quietly ignored out from under it. How
long a job takes is not evidence that it stopped.

- **Close it when the work is done** — edit the comment so `**Claim:**` reads
  `RELEASED`, then **minimize it as Resolved** (same GraphQL call as a done
  item, above). A released claim collapses out of the thread; a live one is
  the only 🔒 anyone has to scroll past. Do this even when the drain failed,
  stopped early, or found nothing.
- **Signal liveness, not duration.** Rewrite `**Last touch:**` each time you
  drive the device — one PATCH, alongside edits the drain is already making.
  A claim is treated as abandoned only after **30 minutes with no touch at
  all**; there is no cap on how long it may be held. Silence is the
  abandonment signal, and it is the only one.
- **Parked on a human never expires.** Set `**Waiting on:** human — <what>`
  before handing the phone over. A human step legitimately takes hours, and
  stealing the device mid-step is the exact collision this lock exists to
  prevent. Clear it back to `—` when you resume.
- **Before driving the device:** read the claims. Held by someone else and
  still alive → don't touch it; report who holds it, what it last touched, and
  what it's waiting on. Free, released, or silent past the window → post your
  own claim, and say in it that you took over a silent one.
- **And before _spawning_ something that will drive the device — read them
  again, right then.** A claim only protects the window it is inside, and the
  window that actually failed is between a session deciding to launch a drain
  and that drain posting its claim. On 2026-09-07, with this lock in place, a
  session read all-`RELEASED` claims, concluded nothing was running, and
  launched a replacement drain; an already-running nested agent claimed
  **16 seconds** ahead of it, and the two interleaved on the same handset and
  destroyed the user's saved data. Three rules come out of that:
  - **`RELEASED` everywhere means nobody has claimed yet, not that nobody is
    running.** Re-read the claims immediately before the launch, and once more
    after posting your own.
  - **An agent's completion notification says nothing about its
    descendants.** "No live background children" is about the agent you
    spawned. Verify against the claim comments; they are the only record that
    survives the process tree.
  - **Two claims seconds apart are not simultaneous — the earlier
    `**Claimed at:**` holds the phone**, and the later one releases and stands
    down rather than racing.
- **It is advisory.** Nothing can stop a raw `adb` command, and it is not
  trying to. It removes the ambiguity, which is the part that actually failed.
- Claim comments are **not** queue items — the parser skips them, so they
  don't land in the item counts or the unparseable bucket.
- Claims written before the heartbeat existed carry only `**Claimed at:**`;
  they're read against that instead, so nothing already on an issue has to be
  rewritten.

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
   collapsing, ask whether the body contains anything _no diff can give back_:
   a rejected alternative and why it lost, an investigation that corrected a
   false belief, external research, a "don't try this again" finding. That
   content was never in a commit, so collapsing it destroys it permanently —
   the PR link goes to a diff that never contained it. Keep those lines next to
   the tombstone; a few surviving sentences are cheaper than re-running the
   investigation. _(What was lost the first time: a full-branch history search
   establishing that a feature believed to be a "re-plug" had never existed.
   The search was real work and left no commit.)_
2. **Test artefacts are not planning docs.** Coverage maps, user-path audits,
   E2E contracts and regression tables (e.g. alate's `USER_PATHS.md`) describe
   paths that must still be _exercised_. A shipped fix there keeps its full
   `Was` / `Now` split — `Was` is the repro, `Now` is the assertion, and a
   tester needs both. Cite the PR alongside them; never collapse them into it.
   Mark such docs with a header note putting them out of scope for this rule.

Watch for **line-count parity masking content loss**: a table row that loses a
column leaves the file the same length. Diff the content, not the line count.

## Workflow names — the SUBJECT is mandatory, and the FILE NAME is an API

**Every workflow's `name:` states its role and its subject: `<Role> — <Subject>`.**
The role comes from the closed list below; the subject is a proper noun specific
enough that two repos cannot produce the same string. Not enforced in CI.

| Role       | The question it answers                          | Example                                    |
| ---------- | ------------------------------------------------ | ------------------------------------------ |
| `Watch`    | is this thing alive _right now_?                 | `Watch — CI runner fleet`                  |
| `Alert`    | turn someone else's finding into a tracked issue | `Alert bridge — healthchecks.io to issues` |
| `Guard`    | did the signal that _should_ exist appear?       | `Guard — PR check coverage`                |
| `Gate`     | does this diff pass?                             | `Rule compliance — Alate`                  |
| `Build`    | produce an artefact                              | `Build Android APK`                        |
| `Ship`     | move an existing artefact to users               | `Vercel production deploy`                 |
| `Maintain` | housekeeping on the repo itself                  | `Relock — self-hosted`                     |

`Watch` and `Guard` must never share a word. A watcher observes a live system; a
guard asserts that a required signal _exists_. `Alert` does neither — it only
relays what something else found, so it must never be named as though it
monitors. Established single-word gates (`CI`, `Code Inspection`, `No user
data`, `Lint`) keep their names: they are already unambiguous in every repo.

**Never name a workflow after a repo-relative word.** `ops`, `production`,
`gate` and `health` mean something different in each repo, so they collide the
moment two repos are read side by side.

**The file name stays. Change the `name:`, not the file.** A workflow filename
is an API: `gh workflow run <file>.yml`, `gh run list --workflow=<file>.yml`,
`POST /actions/workflows/<file>.yml/dispatches`, the workflow's numeric id, and
its entire run history all key on it — and renaming severs every one of them
with no error anywhere. `dependabot-auto-merge.yml` is the standing example: it
displays as `Dependabot triage`, no longer auto-merges anything, and keeps the
wrong filename **on purpose**. The one rename worth making is a workflow that
has **never run and is not yet wired to an external caller** — nothing to sever,
nothing to break — and that window closes the first time either becomes true.

**Because the filename cannot carry the subject, line 1 of the file must.**
Every workflow opens with `# <display name> — SUBJECT: <one clause naming
exactly what this observes or acts on>`. Then
`grep -m1 SUBJECT .github/workflows/*.yml` prints the repo's whole role map in
one screen — the artefact that was missing when a filename got read as a
description of itself.

**Do not "fix" separator drift across languages.** `gate-watchdog.sh` beside
`gate_watchdog_eval.py` is not drift: a Python module with a hyphen cannot be
imported, and `scripts/test_gate_watchdog_eval.py` does
`from gate_watchdog_eval import evaluate`. Shell and YAML take hyphens, Python
takes underscores, and one unit is allowed both.

**Do not rename the secrets and repo variables to match.** A workflow reading an
unset `vars.*` in an `if:` does not fail — it goes inert, silently, for ever.
Never let a cosmetic pass touch a string whose absence is indistinguishable from
health.

**Why:** a workflow name is read far more often than a workflow is opened, and
almost always in a list — `gh run list`, the Actions sidebar, a PR's check set,
an issue title. A name that omits its subject is not shorthand; it is a claim
the reader will fill in wrongly. Monitoring is the worst place for that, because
the name is the only thing standing between "this alerts" and "this does not".

_Precedent: alate 2026-09-09 — `gate-watchdog` was read as "the thing that
surfaces failed CI runs", and that reading survived several turns of a live
diagnosis before anyone opened the file. It only ever polls
`GET /orgs/{org}/actions/runners` and checks that one of three named boxes is
online carrying `ci-light`; it has never looked at a run result. The same
session found `ops-watchdog` naming two unrelated applications in two repos, and
`ops-alert` naming a workflow, a label emitted by a different workflow, and an
issue-title prefix._

## CI spend — heavy builds are MANUAL-DISPATCH ONLY

**No build runs unless a human asked for it, or explicitly pre-approved a
narrow standing exception.** Free-tier Actions minutes are a shared, org-wide,
monthly budget: when they run out, _every_ private repo's CI dies at once —
including the cheap PR gates that had nothing to do with the spend. Builds are
cloud-only (never compiled on the laptop), so the cloud budget is the only
budget there is. Protect it at the trigger, not with a spending cap.

**Heavy** = Android APK/AAB, EAS, Gradle, Xcode, Docker image builds, emulator
E2E — anything measured in tens of minutes. Heavy workflows carry
`workflow_dispatch` and nothing else, unless the user explicitly asks otherwise.

- **Never `on: push`** for a build (not master, not any branch).
- **Never `schedule:`** for a build **in the workflow YAML itself.** A timer
  builds artefacts nobody is waiting on, and a hung one bills silently until
  the job timeout kills it. This is about the trigger definition in the repo's
  CI config — it does not forbid a _human-approved_ Claude-side scheduled task
  invoking `gh workflow run` (still `workflow_dispatch` under the hood, just
  dispatched by a cron instead of a click); see the device-test carve-out
  immediately below for the one case that does this today.
- **Never chain heavy→heavy.** A build must not `repository_dispatch` another
  repo's emulator/E2E run automatically; the downstream repo's heavy workflow
  stays dispatch-only and gets pointed at an existing artefact by hand.
- **Release tags (`push: tags: v*`) are the one allowed automatic build** — a
  tag _is_ the explicit human request. Tag deliberately; four tags in a day is
  four full builds.

**The one standing exception: the device-test weekly build cycle** (set
2026-08-30, user-approved). `skills/device-test/SKILL.md`'s self-scheduled
weekly task dispatches a fresh build for an app **only when that app's
device-test queue holds at least one item marked `**Status:** 🔧 needs
build`** (see "Device-test queue" above) — never unconditionally, so it never
becomes "a timer building artefacts nobody is waiting on." This is the only
place a build may fire without a literal human click; it still goes through
`workflow_dispatch` (invoked via `gh workflow run`, never an `on: schedule:`
key added to the workflow itself), still needs `concurrency` +
`timeout-minutes` on the target workflow like any heavy job, and daily
OTA-only device-test drains are completely unaffected — they never trigger a
build, on any schedule. Any future carve-out follows the same shape: fires on
real accumulated demand, not a bare timer, and is written down here, not
silently added to a skill.

**Cheap gates stay automatic.** Unit tests, lint, typecheck, secret/PII scan,
deploy hooks — keep these on `pull_request`. They are the safety net and they
cost single-digit minutes. Don't "save minutes" by removing a gate; save them by
not building.

Two supporting habits, both of which pay for themselves:

- `concurrency: { group: …, cancel-in-progress: true }` on every heavy workflow,
  so a superseded run stops instead of finishing.
- An explicit `timeout-minutes` (never GitHub's 6-hour default) on every heavy
  job. _Precedent: a hung Gradle daemon ate the full 6-hour default on every
  scheduled alate run for a month — invisible, because a timeout ends in
  `cancelled`, not `failure`._

**Non-builds on a schedule are fine** when the cron _is_ the feature (a nightly
data-retention/GDPR deletion job, a cert renewal). Judge by cost and purpose, not
by the presence of the `schedule:` key.

**Why:** _2026-07-18 — Tessellate-Studio exhausted its 2,000 included minutes and
every private repo's Actions stopped mid-session. Public repos kept running,
which is what made it legible as a budget problem rather than a config one._

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
_what + why_; the runbook holds _exactly how_. Cross-link, don't copy.

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
git history's job. If a paragraph would still read fine with _"probably"_ in it,
or if it tells a story rather than issuing an instruction, it is not runbook
content. A reader should be able to scan the table, find their one action, and
do it without reading a word of context.

## Doc placement

Every documentation type has one defined location — see
[`doc-placement.md`](./doc-placement.md) before creating or moving any doc.
