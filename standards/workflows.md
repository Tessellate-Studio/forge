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

## Process tiers — which rules never bend

Owner rule, 2026-09-25: **consistency in process is the point, and processes
have priorities.** When time, scope or cost forces a trade-off, the critical
tier is never skipped; a minor process may be, but the skip is **named out
loud** in the report ("skipped /simplify — one-line fix"). A skipped critical
process is a defect, whatever else shipped.

| Tier | Process | Home |
|---|---|---|
| **Critical** | OWASP / security triage | `security-triage.md` |
| **Critical** | Everything through a PR; nothing committed to `master` | "Draft first, then merge on green" |
| **Critical** | PRs open as draft; the owner promotes and merges | same |
| **Critical** | A merge is confirmed by the PR's state, never an exit code | same |
| **Critical** | Work claims and device claims (`wip`) | "Work claims", "Claiming the device" |
| **Critical** | Failing test first; suite green before commit | `anti-patterns.md` |
| **Critical** | Cloud builds only; CI-spend rules | "CI spend" |
| **Critical** | New labels, claim formats and queue conventions go through the existing registry | "One registry for process artifacts", below |
| **Critical** | Device-test enqueue for anything only a phone can verify | "Device-test queue" |
| **Critical** | Read the regression log before a bug fix | app `memory/project_regression_log.md` |
| Minor | `/simplify`, `/design-critique` | "Quality pass before commit" |
| Minor | Adversarial review on a small diff (`/code-review` covers it) | same |
| Minor | Closing-retro detail beyond the three questions | build-feature Step 7 |
| Minor | Collapsing shipped doc entries to tombstones | "Docs stay lean" |
| Minor | Runbook formatting polish | `docs/manual-runbook.md` |
| Minor | A regression-log entry for a trivial fix | app regression log |

A process not in this table is minor by default. Promoting one to critical is
an owner decision recorded here, not a session's judgement call.

### One registry for process artifacts

Before adding a label, a claim field, a queue convention or a similar
artifact, **extend the one that exists — never build a parallel one.**

- **Labels** live in `tools/labels/lib/labels.js` (name, colour,
  description), and `tools/labels/bootstrap.js` creates them. Anything that
  tells someone to create or apply a label reads it from there
  (`labelSpec(name)`); `tools/labels/__tests__/registry.test.js` fails CI on a
  `gh label create` / `--add-label` for a name the registry does not have, or
  in a colour it does not use. No label other than a P label wears a P
  colour, so priority reads at a glance.
- **Claims** are the 🚧 work claim. A new kind of ownership is a field on it
  (the device lock is `--device`, ADR-004), not a new claim format.
- **Queues** are labelled issues with state in labels, per "Device-test
  queue". A new queue follows that shape.

The litmus device lock (retired 2026-09-25) is the example: a second claim
format in a second place, doing a job the existing claim did with one field.

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

## Draft first, then merge on green — the owner decides when a PR is ready

**Open PRs as DRAFT.** Get CI green on the draft and hand it back; the draft
is where work continues until the owner is ready to test it and take a real
look. **Promoting a draft to ready is the owner's call, never the agent's.**
Once the owner marks it ready or says "merge", merge as soon as CI is green,
through the gated routes below, without asking again. (Owner decision
2026-09-11, confirmed 2026-09-18, reversing the 2026-08-19 "open ready, merge
without being told" directive. The reason: the owner wants a real look before
anything lands, and merge-on-green skipped it.)

"Draft, CI green, handed back" IS an end state. Say it plainly and name the
PR. Don't ask "should I merge?" on every turn: the owner will say when. Keep
a waiting draft current (see [`anti-patterns.md` → "Draft first"](./anti-patterns.md)).

**Automated sources are unchanged for now.** crash-monitor, status-check,
security-sweep and roadmap-pulse still merge through `safe-merge` under
their own confidence gates. Whether they should also stop at draft is an open
owner question, not decided here.

**Merge through a route that cannot merge before CI is green.** There are
exactly two, and the `[enforced]` hook below refuses everything else:

```bash
# A merge you were asked for:
node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n> && gh pr merge <n> -R <owner/name> --squash

# An automated merge (crash-monitor, status-check, security-sweep, roadmap-pulse).
# safe-merge does NOT wait: it reads CI once, and a check still running refuses
# (exit 10). So wait first, as its OWN step — not chained with &&, because the
# two tools' exit codes overlap (11 is "no checks ran" in one and "merged, log
# row missing" in the other). Run safe-merge only when checks-gate exited 0:
node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n>
node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo <owner/name> --pr <n> \
  --source <skill> --what "<one line>" [--declare guard|rewrite]
# --declare is required except for security-sweep and roadmap-pulse, which skip
# the one-file and declaration checks (forge#86). Every source sends sync,
# persistence and migration paths to a human (forge#87).
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

**Gate the merge on the check command's OWN exit status — never through a
pipe.** `gh pr checks N --watch | tail` reports tail's exit code, not the
checks', so `&& gh pr merge` fires even when a check failed. Same trap:
`npm audit | tail; echo $?`. Correct shape:
`node …/checks-gate/cli.js --repo R --pr N && gh pr merge N --squash`. (Precedent:
2026-07-25, forge PR #22 merged past a red Security Scan exactly this way.)

**Gate on `checks-gate`, not on `gh pr checks --watch`.** `--watch`'s exit code
is non-zero for more than a failed check, so it reads as red when nothing
failed. alate, 2026-09-09/10: alate#752 ran seconds after `gh pr create`, and
`--watch` failed at once on "no checks reported"; alate#791 had seven checks
green and `mobile` pending when `--watch` exited on `net/http: TLS handshake
timeout`. Both failed closed, but each stalled a ship chain and read as a real
CI failure. `tools/checks-gate/` polls each check's `bucket` instead. It waits
for checks to appear, retries a failed read, and counts only-`skipping` as
nothing having run. It confirms green on two reads, and ends on one `RESULT:`
line: exit 0 green · 10 red · 11 no checks ran (10 min) · 12 timed out (2 h). The
`--watch` form is still accepted by the hook; it is just the one that cries wolf.

**[enforced] A hook refuses an ungated merge — this is no longer only prose.**
`hooks/merge-gate.mjs` runs on `PreToolUse` for `Bash` and `PowerShell` and
denies the tool call outright unless the command is one of the two sanctioned
routes: the `safe-merge` CLI, or `checks-gate` (or a `gh pr checks … --watch`)
gated to the merge by a single `&&` with its own exit status intact. It also refuses `--auto` and
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

**[enforced] An open device test that verifies the PR blocks the merge — unless
the PR says `device-unverified`.** Both routes ask it: the hook, after a gated
merge has already passed the CI check, and `safe-merge` as condition 6. The
test→PR edge is the `**Verifies:** #<pr>` line every device test carries
("Device-test queue", below). If an open test names this PR:

- **Run it first** — `/forge:device-test`, close it `completed` when it passes,
  then merge; or
- **ship before a device pass on purpose, and say so on the PR:**
  `gh pr edit <n> --add-label device-unverified`. Often the right call: an
  OTA-delivered change can only be tested once it ships. The label stays on the
  PR as the record that it went out unverified. It is not a way past the hook —
  if nobody has thought about it, ask the user.

Repos with no device-test queue skip the lookup entirely. A lookup that fails
or runs out of time is not "clear": the hook hands that merge to the user as a
question, and `safe-merge` routes it to a human.
*Why:* alate#670 merged and shipped as a production OTA while its own queue
entry said none of its four behaviours had been verified on any device; every
sift swipe on that screen crashed the app for four days (forge#104). "Verified
on device" was something a PR said about itself. **What this does not catch:**
a UI PR that never enqueued a test — no edge, nothing to check. The enqueue rule
still covers that half.

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

If a regression-log row, an issue or an audit reveals a needed fix already
exists on an unmerged orphan branch (typically `claude/<adjective>-<noun>-<hash>`
from a prior session), port it to a fresh branch off the default branch without
asking:

1. Cherry-pick or replay the diff on the new branch.
2. Run the full test suite — orphan-branch tests should pass on the default
   branch too; if not, fix forward, don't skip.
3. The port PR carries `Closes #N` for the tracking issue, and regression-log
   rows get the new merged SHA — a fix is "shipped" only when
   `git branch --contains <sha>` lists the default branch.

## Concurrent sessions — isolate the checkout

Assume multiple agents may drive one repo at the same time. Worktree-isolated
sessions, `npm ci` before the commit gate, SHA-explicit git, verify `HEAD`
before every commit/push. Full rule:
[`anti-patterns.md` → "Isolate concurrent sessions"](./anti-patterns.md).

## Work items are GitHub issues — `BACKLOG.md` is retired

Open work lives in **GitHub issues labelled `P0`–`P3`**, one issue per item,
in the repo that owns the code. Not in a `BACKLOG.md`. A single shared file
could not be claimed, labelled, linked as blocked, closed by a PR keyword or
queried, and three sessions rewrote the same paragraph of it in one day.
Decided in
[RFD 004](../memory/decisions/rfd-004-retire-backlog-md-work-items-as-github-issues.md);
this section is the operating rule.

**Rollout: complete (2026-09-19).** Every app repo migrated in its own PR.
Its `BACKLOG.md` is a one-line pointer that carries `<!-- backlog-retired -->`,
and a CI guard fails any PR that adds to it. `roadmap-pulse` reads issues only.
A new app gets no `BACKLOG.md` at all. **New work goes to an issue.** Don't add
entries to a `BACKLOG.md`. (Another app that still has one migrates with
`tools/backlog-migrate/`.)

### Where each kind of content lives

| Content | Home |
|---|---|
| A work item: what, why, done-when, what's left **now** | The **issue body**, edited in place so it stays true |
| Progress notes, findings, status changes, "tried X, didn't work" | **Issue comments**: append-only, one per event |
| A piece that has its own done state and could close on its own | A **sub-issue** (`gh issue create --parent N`, ≤100 per parent) |
| A small checklist with no separate lifecycle | `- [ ]` lines in the body |
| "Does the owner approve X?" | A **draft PR labelled `decision`** that adds or edits a doc in `memory/decisions/`. Merge = approve, close = reject |
| A decided design, and rejected alternatives worth keeping | `memory/decisions/` (ADR / pitch / RFD) |
| Bug root cause + lesson | `memory/project_regression_log.md` (unchanged) |
| Exact console steps for a human | `docs/manual-runbook.md` (unchanged) |
| A long product brief (tens of KB, many sections) | `docs/briefs/<name>.md`, linked from its issue |
| Weekly priorities | The **roadmap Artifact** that `roadmap-pulse` refreshes each run. There is no `WEEKLY_DIGEST.md` |

A `####` sub-section stays in the body. It becomes a sub-issue only when it
passes the "could close on its own" test **and** someone decides so. A dated
narrative goes in comments from now on; the body is trimmed to the current
state by whoever changes the state.

### Labels

Labels are the only store for priority and type. There is no Priority field in
the body, because a field and a label drift apart.

| Family | Values | Rule |
|---|---|---|
| Priority | `P0` blocker / pre-launch · `P1` do next · `P2` soon · `P3` later | **Exactly one** on every open work issue. There is no `P4`: "someday" is `P3` plus a `Deferred until: <trigger>` line in the body |
| Type | `bug` · `feature` · `chore` · `refactor` (`enhancement` reads as `feature`) | At most one |
| Area | loom: `admin-ui api sdk extension supabase infra` · alate: `mobile backend scraper fit-engine infra` | Optional, 0–n, **loom and alate only**. Every other repo gets no area labels. Never inferred by a tool |
| Lifecycle | `decision` · `on hold` · `claimed` · `needs-input` · `needs-triage` | See the matrix below |
| Queues | `device-test` + `needs-human` `needs-build` `parked` `failed` | A separate system ("Device-test queue" below). A `device-test` issue carries the P label inherited from what it verifies (`dtq enqueue`, default `P2`) so drains and escalation can rank it; roadmap-pulse still never scores one |
| Provenance | `migrated-from-backlog`, `crash-monitor`, `security-sweep`, `auto-generated`, `ci-failure`, `ops-alert` | Set by the filing tool |

`tools/labels/bootstrap.js --repo <r> [--dry-run]` creates the canonical set
in a repo, idempotently. Issue forms silently drop a label the repo doesn't
have, so run it before relying on a form. The old `critical` / `high` /
`medium` / `low` labels map to `P0` / `P1` / `P2` / `P3` and are deleted after
relabelling.

**How the lifecycle labels interact:**

| Label | Goes on | Means | roadmap-pulse | Expiry |
|---|---|---|---|---|
| `decision` | **PRs only** (draft) | A plan awaiting the owner's yes/no | Not scored. Listed under "awaiting your yes/no", oldest first | Surfaced after 14 days open |
| `needs-input` | Issues (and non-decision PRs) | Blocked on a human answer that is *not* a doc approval, or on an open decision PR (`Blocked on decision #N` in the body) | Scored, listed under "needs you", never auto-built | Surfaced after 14 days |
| `on hold` | Issues, PRs | "Not now" was decided. The applying comment states a review-by date (see "On hold" below) | Scored, ranked after every non-held item, never auto-built | Past the date → reminder comment, never closed |
| `claimed` | Issues, PRs | A live session owns it (`wip`) | Scored normally; skipped by auto-build unless the claim is the pulse's own | `wip sweep` |
| `device-test` | Issues | A queued on-device test | Excluded (different queue) | device-test skill |
| `needs-triage` | Issues | Filed without a P label | Scored provisionally; a P is proposed | Listed every week until it has exactly one P |

- **Never put `needs-input` on a `decision` PR.** Closing a decision PR is a
  valid answer (reject). `pr-close-label-guard.yml` skips `decision`-labelled
  PRs so that answer isn't turned into a follow-up issue.
- **P-label exclusivity is enforced twice:** by the filing helper at write
  time, and by roadmap-pulse's weekly lint (0 or >1 P labels is reported).

### Filing an issue

Skills and sessions file through **`wi new`** (`tools/work-item/cli.js`), which
renders the shared body sections, requires exactly one `--priority P0..P3`,
and lists the open issues before it creates (`gh issue list -L 1000`, never the
search API, which lags by minutes and has filed duplicates elsewhere).
`wi new --dry-run` prints the body without creating anything. `wi` not on
PATH → `node "${CLAUDE_PLUGIN_ROOT}/tools/work-item/cli.js" new …`. If this
forge predates the tool, do the same by hand: list the open issues
(`gh issue list -R <repo> --state open -L 1000 --json number,title`), check
for a duplicate, then `gh issue create -R <repo> --label <P> --label <type> …`
with every label in the create call (one write, one notification).

**A missing label fails the whole create.** `gh issue create --label P1`
refuses outright in a repo that has no `P1` label, and not every repo has the
set yet (litmus had none on 2026-09-19). Before filing into a repo for the
first time, check `gh label list -R <repo> -L 200`. Missing → run
`tools/labels/bootstrap.js --repo <repo>` (idempotent). If that isn't possible,
file with the labels that do exist plus `needs-triage`, and say which P it
should carry in the body. Never drop the issue because a label is missing:
the weekly lint lists anything without a P.

The body uses the headings the issue forms and roadmap-pulse share. Every
section is optional to the parser, but a good item has them:

```markdown
### What
The work, written so a session can start it cold.

### Why / evidence
User impact and where it came from: regression row, Sentry id, user quote, decision doc.

### Done when
Acceptance criteria, ideally a runnable **Verify:** block. roadmap-pulse executes it.

### Context & history
Rejected options, links, memory/decisions docs, briefs. Progress goes in comments.

### Effort (person-days)
unknown | 0.5 | 1 | 2 | 3 | 5 | 10 | 20

### Reach
unknown | 1 — just me / internal | 10 — early testers | 100 — all current users | 1000 — future users at scale
```

A human filing on the web uses the repo's issue form (canonical copies live in
forge `templates/issue-forms/`). The form applies `needs-triage`; set the P
label in the sidebar in the same step.

### Closing, and linking decisions

- **A PR that ships an issue says `Closes #N`** in its body. The merge is the
  status update; the issue keeps its whole body and comments. See "Status
  update on completion" below.
- **A PR that only lays plumbing for an issue says `Refs #N`.** So does a
  **decision PR**: approving a plan is not shipping it.
- **Link a decision to its issue in both directions.** The decision doc gets a
  `**Tracking:** <repo>#N` line; the issue body links the doc.
- **"Strike-through, don't delete" becomes "close with a reason, never
  delete".** `gh issue close N --reason completed|not_planned --comment "<why>"`.
  Deleting an issue is irreversible and is never an agent action.

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

**`wip` not on PATH → run the plugin's own copy with the same arguments:**
`node "${CLAUDE_PLUGIN_ROOT}/tools/work-claim/cli.js" claim …`. The global
shim is not reliable: on 2026-09-13 an `npm link` made before the `wip` bin
existed left `dtq` installed and `wip` missing, every `wip claim` failed with
"command not found", and alate went its entire history without one claim. The
SessionStart hook now says so when `wip` cannot be found (and says to run
`npm ci --omit=dev` in the plugin root if the CLI's deps are missing too). **A
claim, touch or release that fails is reported to the user — never skipped
silently.**

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
- **Docs:** <RFD / ADR / pitch / brief this is built against, or —>
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
- **It is advisory.** A claim that also names a phone (`--device`) is the
  device lock — see "Claiming the device" below. There is no separate 🔒
  claim any more.

Format, lifecycle and the reasoning behind every threshold live with the code —
`tools/work-claim/lib/claim.js` (`STALE_MINUTES`, `CLAIM_LABEL`) and
`tools/work-claim/cli.js` (`sweep`). **Change the behaviour, change this
section**: three PRs in this series changed what the tool does and left this
text describing the old behaviour, which is how the sweep rule here came to
describe a bug that had already been fixed.

## On hold — a label with an expiry, not a parking lot

`on hold` marks a PR or issue that is deliberately not being actioned right
now — a major dependency bump needing real review, a change parked while a
project is on hold, anything where "not now" is a decision rather than
neglect. It is **not** a substitute for closing something, and it is not
indefinite: every `on hold` label carries a **14-day review-by date**, stated
in the comment that applies it, matching the `wip` staleness window so the two
conventions read the same way.

```bash
gh pr edit <n> -R <owner/repo> --add-label "on hold"
gh pr comment <n> -R <owner/repo> --body "**On hold** — <why>. Review by **<date, +14 days>**."
```

If the repo lacks the label, create it from the registry — same colour and
description everywhere: `node tools/labels/bootstrap.js --repo <repo>`.

**The rules:**

- **State the review-by date in the comment, every time.** A label with no
  date attached is indistinguishable from an abandoned PR six months later —
  the date is what lets a future sweep (or a human) tell the two apart without
  re-deriving context.
- **Past the date, escalate — don't auto-close.** An automation that finds an
  expired `on hold` item posts a reminder (and push-notifies if it is a
  security finding) rather than closing or merging it; closing silently loses
  the reasoning, and force-merging a deliberately-paused major is worse than
  leaving it open. A human decides the outcome; the automation's job is to
  make sure the expiry is seen, not to act past it.
- **Not a rename of `wip`'s stale-claim window.** A `wip` claim going quiet
  means the *session* went away; `on hold` means a human or a routine decided
  *the work itself* should wait. The two can overlap (a claimed item can also
  be on hold) but answer different questions — don't conflate them in tooling
  or in conversation.
- **`on hold` is for genuine necessities, not a default parking spot.** Before
  labeling something on hold, ask whether it needs to exist at all — if there
  is no real reason it must eventually merge (nothing it fixes, nothing it
  unblocks), closing it beats holding it. A backlog of `on hold` items that
  will never actually be actioned is the same clutter the label was meant to
  prevent, one indirection later. Real precedent (2026-09-17): the first
  version of this rule put every major Dependabot bump `on hold`; a same-day
  review found 11 of 14 had no open security alert behind them at all — pure
  version-update noise with nothing forcing a decision — and all 11 were
  closed instead. `on hold` earns its keep only on the item where a human
  genuinely has a call to make later.
- **security-sweep is the first automated consumer** — see
  `skills/security-sweep/SKILL.md` → "Dependabot PR triage (daily)", which
  closes non-necessary Dependabot PRs by default and reserves `on hold` for
  the one case that still needs a human: a major bump addressing a real open
  advisory. Any other skill adopting the label follows the same contract:
  close what isn't a necessity, state a date on what's genuinely held,
  escalate on expiry, never silently close something already on hold.

## Shared planning docs — check who else is in the file

Worktree isolation does not prevent two branches editing the same doc or the same
lane. Before touching a regression log, RELEASE doc or runbook — or starting a
fix in a busy area — list the open PRs already in that file, and fix any claim your
own change makes stale rather than handing it to another session. Commit
boundaries follow the logical change as usual: a doc edit that is part of the
change goes in its commit; a separate concern (a regression-log row, a runbook
status) gets its own commit, same PR is fine. Work items don't collide in
content any more, because each is its own issue: claim it (`wip claim`)
instead of checking a file. Full rule:
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

**Came from an issue? `Closes #N` in the PR body *is* the status update.** The
merge closes the issue, and the issue keeps its body, comments and the link to
the PR that closed it. A PR that only lays plumbing for the issue (a helper, a
migration the feature will use) says `Refs #N` instead, so the issue stays
open until the user-facing change lands.

If the change also originated from — or changes the truth of — a
regression-log row, a RELEASE checklist line or a runbook TODO, **update that
entry in the same PR** that ships the change: status (DONE + date), the PR
number, and the merged SHA once it lands. A tracked item whose fix shipped but
whose entry still says "open" is how work gets re-done and users re-ask.
(Verification bar: the SHA in the entry must be reachable from the default
branch — see "Speak from authority" in
[`authoritative-claims.md`](./authoritative-claims.md).)

**Use the keyword, not a follow-up edit.** GitHub only auto-closes an
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

**It files the test with a priority.** The P label is copied from what the
test verifies — the most urgent P on the PR itself or on any issue that PR
closes (a fix PR rarely carries one; the bug it closes does) — falling back
to `P2`. `--priority P0` overrides. `dtq` lists failed tests first, then by P,
so what needs escalating is on top.

**It searches before it creates.** An open `device-test` issue whose intent
matches gets the new detail as a comment instead of a second issue; the same
failure is routinely reported by several sessions, and a queue with four
copies of one test wastes a device sitting four times over.

**A repo joining the queue gets its labels from the registry** — the same
names, colour and descriptions as every other repo ("One registry for process
artifacts"):

```bash
node tools/labels/bootstrap.js --repo <repo>   # idempotent; --dry-run first
```

### What goes in the body

- **`**Verifies:** #<pr> (<sha>)`** — a plain reference, **never** a closing
  keyword. A merged PR saying `closes #712` would close the very test that
  exists to check it. GitHub renders the cross-reference on the PR's timeline
  either way, and every later PR mentioning the test number appears on the
  test's timeline — the traceability the comment medium could never have.
  **It is also what the merge gate reads:** while this test is open, PR
  `#<pr>` does not merge unless it carries `device-unverified` ("Merge on
  green", above).
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

### Claiming the device — claim the tests you run, with the phone named

`dtq` answers _what is pending_. **Is anyone on the device right now** is
answered by the same list: a drain claims every device-test issue it takes
with the ordinary 🚧 work claim ("Work claims", above) plus the phone it runs
on, and **a phone is busy while any OPEN `device-test` issue holds a live
claim naming it.** One claim format, one label (`claimed`), and the lock says
which test is on the phone, not just that something is.

```bash
wip claim alate#990 --device pixel --holder drain-7f3a     # adb handset
wip claim alate#957 --device iphone --holder drain-7f3a \n  --waiting-on "human — TestFlight pass"
wip touch alate#990 --holder drain-7f3a                    # keeps the phone
wip release alate#990 --holder drain-7f3a
dtq                                                        # Devices: who holds each phone
```

**A drain claims under its own name** — `--holder drain-<4 hex>`, picked once
and passed to every `wip` call it makes. A nested agent inherits its parent's
`CLAUDE_CODE_SESSION_ID` (verified 2026-09-25), so without a holder name two
drains launched from one session are the same claimant to `wip`, and the race
rule below cannot tell them apart — the 2026-09-07 collision.

The claim carries everything a PR claim does — session to resume, worktree,
related PR, docs — plus `- **Device:** pixel`. A claim with no `Device` (a
session fixing a failed test from its desk) never locks the phone.

**Why it moved off litmus** (ADR-004, 2026-09-25, superseding RFD-003 §3):
the lock used to be a 🔒 comment on one pinned issue per handset in
`Tessellate-Studio/litmus` (#43/#44, now closed). That was a second place to
look and a second claim format, and it said nothing about which test was
running. The problem it was built for is unchanged: on 2026-09-01 two
sessions reached for the same handset, and every session commits under the
same GitHub account, so the byline reveals nothing.

**Claim before the first `adb` command, release as each verdict lands.**
Claim every test you are taking this sitting up front; release each one
(`wip release <repo>#<n>`) when its verdict is written. The phone frees
itself when you hold no claim on an OPEN test — and **closing a test drops its
claim from the lock just as releasing does**. So never close or release your
last held test before claiming the next: the gap is a free phone to everyone
else. If a claim with `--device` cannot get its `claimed` label, `wip` exits
non-zero — the lock is found by that label, so treat it as not claimed.

**Two windows, on purpose.** The work claim survives seven days of silence
(nobody is blocked waiting on a piece of work). The PHONE is scarce, so a
claim stops holding it after **30 minutes with no touch** — while the claim
itself stays on the issue. Touch it every time you drive the device (`wip
touch <repo>#<n>`). **Only the claim's own `Last touch` counts for the
phone** — not activity on the issue, which would refresh every claim on it at
once, a crashed drain's included. A `--force` takeover retires the claim it
replaced, so a dead holder's comment never wins the phone back.
**Parked on a human never expires** on either window: set `--waiting-on
"human — <what>"` before handing the phone over, clear it when you resume.

**Two rules make a race resolve without a lease or a clock:**

1. **Post, then re-read.** After claiming, wait ~5s and run `dtq`. If the
   Devices line names another session as the holder — i.e. a live claim on
   that phone with a **lower comment id** than your earliest — release every
   claim you just posted and stand down. GitHub comment ids are global and
   server-assigned, so two drains that claimed DIFFERENT tests, even in
   different repos, reach the same verdict independently (`losesRaceTo` in
   `skills/device-test/scripts/claim-lib.js`). Your own other claims are
   never rivals.
2. **Re-check at the point of use.** Before each device-driving step that
   mutates state, re-read and abort if you are no longer the holder.

**An unreadable lock is not a free device.** If any queue repo cannot be
read, `dtq` prints `? UNREADABLE` for every phone — the claim holding it may
be in exactly that repo — and that is a reason to stop.

- **Before driving the device:** read `dtq`. Held by someone else and live →
  don't touch it; report who holds it, which test, what it's waiting on.
  Free → claim, then re-read (rule 1). Took over a silent claim → say so.
- **And before _spawning_ something that will drive the device — read it
  again, right then.** A claim only protects the window it is inside, and the
  window that actually failed is between a session deciding to launch a drain
  and that drain posting its claim. On 2026-09-07 a session read
  all-`RELEASED` claims, launched a replacement drain, and an already-running
  nested agent claimed **16 seconds** ahead of it; the two interleaved on the
  same handset and destroyed the user's saved data. Three rules come out of
  that:
  - **No live claim means nobody has claimed yet, not that nobody is
    running.** Re-read immediately before the launch, and once more after
    posting your own.
  - **An agent's completion notification says nothing about its
    descendants.** Verify against the claims; they are the only record that
    survives the process tree.
  - **Two claims seconds apart are not simultaneous — the lower comment id
    holds the phone** (rule 1), and the later one releases and stands down.
- **It is advisory.** Nothing can stop a raw `adb` command, and it is not
  trying to. It removes the ambiguity, which is the part that actually failed.

## Docs stay lean — shipped items collapse to a one-line tombstone

The PR is the permanent home of implementation detail (diff, decisions,
verification); planning docs are for OPEN work. So when an item ships, don't
leave its full body in the doc — **collapse the entry to one line**:
`~~<title>~~ — shipped <date>, PR #<n> (<SHA>)`. Delete the body (acceptance
criteria, design notes, discussion): anyone who needs it follows the PR link.
This applies to RELEASE docs, the manual runbook and every other planning doc
in every repo; roadmap-pulse's honesty pass enforces it weekly. A doc that
keeps growing after its work ships is a word block nobody reads — the failure
mode this rule exists to prevent.

**Work items need no tombstone: closing is the tombstone.** A closed issue
keeps its whole body and comments, so nothing is collapsed and nothing is
lost. See "Work items are GitHub issues" above.

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
   the tombstone — or, for a work item, in its issue (a closed issue keeps
   them) or in `memory/decisions/` when it is a decided design; a few
   surviving sentences are cheaper than re-running the investigation. _(What was lost the first time: a full-branch history search
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
evaluation of options (that's the issue, or the decision doc in
`memory/decisions/`); only the decided outcome. The issue holds _what + why_;
the runbook holds _exactly how_. Cross-link, don't copy.

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
rejected, what changed in which PR, narrated findings. That is the issue's job
(or the decision doc's) and git history's job. If a paragraph would still read fine with _"probably"_ in it,
or if it tells a story rather than issuing an instruction, it is not runbook
content. A reader should be able to scan the table, find their one action, and
do it without reading a word of context.

## Doc placement

Every documentation type has one defined location — see
[`doc-placement.md`](./doc-placement.md) before creating or moving any doc.
