---
name: status-check
description: Session loop-closer — inventories every loop THIS conversation opened (PRs created, failing checks, issues that should have auto-closed, branches/worktrees left behind, device-test queue items enqueued, background agents spawned, promises made in the transcript, uncommitted work), verifies each against live GitHub/git state, then closes what it safely can — arms or executes merges per Merge-on-green, diagnoses and fixes failing PR checks with auto-merge gated on crash-monitor's confidence checklist, closes issues a merged PR forgot to close with a linking comment, prunes provably-merged branches and worktrees. Everything it cannot safely close lands in a short manual-for-you list with the exact unblock. Use whenever the user asks to "status check", "close the loops", "wrap up the session", "anything left hanging?", "is everything merged?", or wants this conversation's pending work chased down before stopping. Also fires on passive cues like "are we done here", "did that PR ever land", or "what's still outstanding from today". Manual invocation only — never scheduled, never self-scheduling. Output is a two-bucket wrap-up table (closed automatically / manual for you); "No pending loops" with nothing else attached is correct output, not a failure.
---

# Status check

You are a loop-closer for THIS conversation. The transcript in your context IS
the inventory source — you are not sweeping repos, you are settling what this
session opened. Verify every transcript claim against live state before acting:
a "merged" claim in chat is not a merge, an "armed --auto" claim is not a merge
gate. Two failure modes are in tension here: leaving loops open (the user
inherits your housekeeping) and closing loops that aren't yours to close
(another session's work, a deliberate hold). When in doubt, report instead of
act.

## Scope — current session only

The conversation defines scope. If a repo appears in this transcript, it's in
scope; otherwise it isn't. No cross-repo sweeps, no scanning for loops other
sessions opened. Machine-specific paths, org names, and checkout locations come
from the transcript itself — none belong in this versioned skill (same
caller-supplies-scope rule as crash-monitor and security-sweep).

## Step 1 — Inventory from the transcript

Re-read the conversation and list every loop it opened, tagged by type (a)–(h)
from Step 2. For each, record: repo, identifier (PR # / issue # / branch /
path), and what the transcript last claimed about it ("opened PR #42, armed
auto-merge", "enqueued device test", "I'll clean that up later").

An empty inventory ends the run: output
`No pending loops — this session left nothing open.` and stop. That is correct
output, not a failure.

## Step 2 — Verify live state, then act

Work the inventory in this order: **(b) fixes first, then (a) merges, then
(c)/(d)/(e)** — fixes land, then merges, then the downstream consequences of
merges. Each type has the same shape: Verify → Auto-act when safe → Escalate
when not.

### (a) PR open, checks green or pending — merge not armed

- **Verify:** `gh pr view <n> -R <owner>/<repo> --json state,isDraft,mergeable,autoMergeRequest,statusCheckRollup`
- **Auto-act:** follow `${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` →
  "Merge on green" exactly. Once per repo, probe branch protection
  (`gh api repos/<owner>/<repo>/branches/<default>/protection`); a real gate →
  `gh pr merge <n> --squash --auto`; 403/404 (no gate — private free-tier repos
  never have one) → the gated watch
  `gh pr checks <n> --watch >/dev/null && gh pr merge <n> --squash` — never
  through a pipe. A draft PR whose work the transcript shows finished: mark
  ready first (`gh pr ready <n>`).
- **Escalate when:** a merge-on-green carve-out applies
  (`${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md` → "Merge on green by
  default"): outward-facing, hard-to-reverse, needs judgment CI can't give, or
  the user said hold. Leave it open; manual row naming the carve-out.

### (b) PR with failing checks

- **Verify:** `gh pr checks <n> -R <owner>/<repo>`; failing log via
  `gh run view <run-id> --log-failed`.
- **Auto-act:** diagnose from the log plus source; fix on the PR branch; push.
  Then gate the merge on crash-monitor's Confidence heuristic
  (`${CLAUDE_PLUGIN_ROOT}/skills/crash-monitor/SKILL.md` → "Confidence
  heuristic" — single-file, tests pass, no new deps, guard-type fix not a
  rewrite, no active cooldown per crash-monitor Step 1.6 / the litmus
  auto-ship log). ALL hold → merge per (a) and append the auto-ship-log row in
  `Tessellate-Studio/litmus` → `auto-ship-log.md`:
  `| <date> | status-check | <repo> | PR #<n> | <1-line what> | <ref> |`.
  ANY fail → the fix stays pushed, the merge does not happen.
- **Escalate when:** the confidence checklist fails, the failure is
  infra/config (never weaken CI to make it pass), or the fix would touch a
  cooled-down file/module. Manual row with the pushed-fix link and the specific
  blocker.

### (c) Issue a merged PR should have closed but didn't

- **Verify:** for each issue this session's work addressed:
  `gh issue view <n> -R <owner>/<repo> --json state` and
  `gh pr view <pr> -R <owner>/<repo> --json state,body`. Merged PR + open
  issue + no `Fixes/Closes/Resolves #<n>` in the body = the missing-keyword
  failure (`${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` → "Status update on
  completion").
- **Auto-act:** `gh issue close <n> -R <owner>/<repo> --comment "Fixed by #<pr> (merged <sha>). PR body lacked a closing keyword, so auto-close didn't fire."`
- **Escalate when:** the PR only partially addressed the issue → comment
  linking the PR, leave it open, manual row.

### (d) Branches / worktrees left behind

- **Verify:** `git worktree list` and `git branch --list` in each session
  checkout; for every branch this session created, the security-sweep Step 6b
  precondition: `gh pr list -R <owner>/<repo> --head <branch> --state all --json state -q '.[0].state'`
  must print `MERGED`.
- **Auto-act:** MERGED only → `git remote prune origin` then
  `git branch -D <branch>` (`-D` is expected under squash merge). Worktrees per
  build-feature Step 6.7: `git worktree remove --force <path>` then
  `git worktree prune` — only for worktrees this session created whose branch
  is merged and whose tree is clean.
- **Escalate when:** the PR is not MERGED, the branch carries unpushed
  commits, or the worktree is dirty → never delete; manual row with the state.

### (e) Device-test queue items stranded

- **Verify:** fetch the item's comment
  (`gh api repos/<owner>/<repo>/issues/<n>/comments`) and parse the fixed
  format (`${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` → "Device-test
  queue"). Is the **PR** merged? Is **Delivery** satisfied (OTA published,
  build exists)?
- **Auto-act:** PR unmerged → route it through (b)/(a) first, then edit the
  comment's `**SHA:**` field from "unmerged — branch <x>" to the merged SHA.
  Field edits only — never rewrite or delete queue items; Status-line
  semantics belong to the device-test skill. If the correction needs
  explaining, append it as a note on that same comment under a `---` rule
  (standard → "Notes go on the item, under a rule") — never as a free-floating
  "correction to the comments above", which stops making sense the moment
  another item is enqueued between them.
- **Escalate when:** Delivery needs an OTA publish or a tag build — heavy
  builds are manual-dispatch only (`${CLAUDE_PLUGIN_ROOT}/standards/workflows.md`
  → "CI spend"). Manual row: "dispatch <workflow> / publish OTA, then the
  queue item is drainable".

### (f) Background agents / spawned tasks unreported

- **Verify:** transcript mentions of spawned agents, background jobs, cloud
  sessions; check with the in-session tools (ListAgents, task notifications
  already in context).
- **Auto-act:** finished → fold their results into the wrap-up.
- **Escalate when:** still running → manual row "in flight — check back".
  Never kill another agent's work.

### (g) Explicit promises in the transcript

- **Verify:** every "I'll do X later", "TODO", "in a follow-up" the assistant
  wrote. Check whether X actually happened — later turns first, then live
  state.
- **Auto-act:** small and in-scope (a doc tombstone, a BACKLOG status line per
  "Status update on completion", a promised comment) → just do it now; the
  usual same-PR housekeeping rules apply.
- **Escalate when:** the promise is feature- or investigation-sized → manual
  row, or offer to file a tracked issue while the context is warm.

### (h) Uncommitted / unpushed work

- **Verify:** the roadmap-pulse honesty-pass probe per session checkout:
  `git fetch origin --quiet`, `git status --porcelain`,
  `git rev-list --left-right --count HEAD...origin/<default>`,
  `git log --branches --not --remotes --oneline`.
- **Auto-act:** unpushed commits on THIS session's branch → push. Uncommitted
  work this session made that belongs to its open PR → commit (test-gated per
  "Local gates stay light") and push.
- **Escalate when:** dirty state this session didn't create, or ownership is
  ambiguous → **never discard** (roadmap-pulse fix-vs-report split — it may be
  another live session's work); manual row with the file list.

## Step 3 — Wrap up

One table, two buckets, then the counts:

```markdown
## Status check — <date>

| Loop | Repo | Type | Verdict |
|---|---|---|---|
| PR #42 auto-fix | alate | (b) failing PR | ✅ fixed + merged (confidence: all-hold) |
| Issue #17 | badige | (c) unclosed issue | ✅ closed, linked PR #40 |
| branch fix/foo | alate | (d) branch | ✅ deleted (PR MERGED) |
| OTA for queue item | alate | (e) stranded | 🙋 manual — publish OTA, then drainable |
| dirty tree (3 files) | badige | (h) | 🙋 manual — not this session's edits |

**Closed automatically:** <n> · **Manual for you:** <n>
```

Every 🙋 row states the exact unblock action — the reader should never have to
click through to learn what to do. Clean session → the single line
`No pending loops — this session left nothing open.` and no table.

## CRITICAL RULES

- NEVER discard dirty working-tree state or unpushed commits — report with the
  file list. It may be another live session's work.
- NEVER `git branch -D` or `git worktree remove` without
  `gh pr list --head <branch> --state all` printing `MERGED` first.
- NEVER merge past a carve-out: outward-facing, hard-to-reverse,
  needs-human-judgment, or an explicit user hold stays open.
- NEVER auto-merge a pushed fix that fails ANY item of the confidence
  checklist, and never one touching a cooled-down module.
- NEVER gate a merge through a pipe —
  `gh pr checks N --watch >/dev/null && gh pr merge N --squash` only; probe
  branch protection once per repo before trusting `--auto`.
- NEVER trigger heavy builds (APK/AAB, EAS, Docker, emulator E2E) — name the
  dispatch as the manual unblock instead.
- NEVER act on loops another session opened; scope is this conversation.
- Append the litmus auto-ship-log row for every auto-merged fix — it is
  crash-monitor's cooldown breadcrumb.
- Quiet output on a clean session is correct, not a failure.

## What this skill does NOT do

- Cross-repo sweeps for crashes, vulns, or stale planning docs — that is
  crash-monitor / security-sweep / roadmap-pulse territory.
- Draining the device-test queue — device-test's job; this skill only
  un-strands items whose PR it merged.
- Building features or investigating non-trivial failures to completion —
  build-feature's job; file and escalate instead.
- OTA publishes, tag builds, or store-console actions — manual runbook
  territory, always.
- Scheduling itself. Manual invocation only.

## When NOT to use

- Mid-task: loops are supposed to be open while work is in flight.
- A fresh session with no history: there is nothing to inventory.
- The user wants cross-project status or priorities — that's roadmap-pulse.
