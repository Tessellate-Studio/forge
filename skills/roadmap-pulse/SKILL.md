---
name: roadmap-pulse
description: Weekly project-management skill that scans open GitHub issues (P0–P3) plus RELEASE notes and the regression log (and, in a repo that has not migrated yet, its BACKLOG.md), runs an honesty pass on stale claims, reads and infers task dependencies, scores open work via RICE (Reach × Impact × Confidence / Effort) within the owner's P bands, and publishes a prioritized top-5-to-10 list to the roadmap Artifact, refreshed at the same URL every run. Self-schedules a weekly cron; also fires manually. Use whenever the user asks to "run roadmap pulse", "rebalance the backlog", "score open tasks", "what should I focus on this week", "is my roadmap up to date", "triage the issues", or any phrasing implying both honesty-checking the open work AND deciding what's next. Triggers even on passive cues like "feels like the backlog needs a refresh" or "I'm not sure what to focus on" — even when the user doesn't say "skill" or "pulse" explicitly. Output is a sourced prioritized list with RICE scores + reusability/strategic-fit/dependency-unblock overlays, a label-hygiene lint, and the roadmap Artifact page (which embeds this run's scores for next week's diff).
---

# Roadmap pulse

Planning drifts. Priorities drift. Dependencies hide. Goals shift week-to-week. By the time you sit down on Sunday to plan the week, the open issues say one thing, RELEASE_V2 says another, and you're back to re-deriving priorities from scratch.

This skill is a weekly project-management pulse. It does six things in sequence — none of them new individually, but doing them _together_, _consistently_, and _with sourced reasoning_ is the value:

1. **Honesty pass** — strip the ghosts in _both_ directions: items still open that actually shipped, items closed or marked shipped from orphan branches that never merged, and items claiming pending external work (env, cron, endpoint, table) that is already live — probed against the running system, not re-read from the text. Plus a **label-hygiene lint** on every open issue.
2. **Context pull** — read `RELEASE_V2.md` for current launch-state signals; surface inferred urgencies; accept user overrides.
3. **Dependencies** — read the confirmed graph (native issue `blockedBy` / `blocking` links and sub-issues), infer the missing edges, and confirm them with the user.
4. **RICE scoring** — invoke rubric-sdk per open item using the RICE framework (Reach × Impact × Confidence / Effort); adjust with reusability, strategic-fit and dependency-unblock overlays; rank **within the owner's P bands** (RICE proposes, the P label decides).
5. **Output** — a prioritized top-5-to-10 list inline, and the **roadmap Artifact** refreshed at the same URL. The Artifact is the whole digest: it embeds this run's scores so next week's run can diff against them.
   5.5. **Auto-build** (autonomous runs only) — for the top P0 "Must" items, invoke `forge:build-feature` to implement end-to-end, ship to preview, and merge through safe-merge (`--source roadmap-pulse`). Cap: 2 per run.
6. **Self-schedule** — first-run only: set up a weekly cron via the `schedule` skill. Default cadence Sunday 16:00 IST, override at first run.

The point is not "produce a pretty list." The point is **align action with current goals, supported by sourced reasoning, weekly, without re-deriving from scratch each time.**

**Where open work lives.** Work items are GitHub issues labelled `P0`–`P3`
(forge `standards/workflows.md` → "Work items are GitHub issues", decided in
RFD 004). App repos move off `BACKLOG.md` one at a time, so this skill runs in
**dual mode**: each repo is read from issues once it has migrated, and from its
`BACKLOG.md` until then. See "Per-repo mode" below. File mode is removed in a
later forge release, once every repo has migrated.

## Subagent / worktree harness — read before invoking tools

If this skill runs inside a subagent that was launched with
`isolation: "worktree"`, the harness creates a temporary git worktree
at e.g. `.claude/worktrees/agent-<id>/`. **The `Edit` tool resolves
absolute paths to the MAIN checkout, NOT the worktree.** This means
naïvely editing `C:\...\alate\RELEASE_V2.md` from inside a worktree
subagent will silently mutate the user's real working tree —
defeating the whole point of the isolation. Precedent: iteration-1
test of this skill, eval-1 with-skill (2026-05-23), leaked 414 lines
of doc edits to the main checkout.

To stay inside the worktree:

- Resolve paths RELATIVE to the worktree root (e.g. `RELEASE_V2.md`,
  not the absolute path). `cwd` defaults to the worktree.
- For commit messages, scripts, etc., use relative paths.
- For absolute paths you can't avoid, prefix with the worktree path
  the harness reported at launch (look in the agent's environment
  for `worktreePath`).

When `git status` from inside the worktree shows clean while the
caller's `git status` shows new changes — that's the bug. Stop and
fix the path resolution before continuing.

## Scope and inputs

### Repos in scope

`.roadmap-pulse-state.json` (project root) lists the repos this pulse covers:

```json
{ "repos": ["Tessellate-Studio/alate", "Tessellate-Studio/loom", "Tessellate-Studio/tessellate-pages", "Tessellate-Studio/litmus"] }
```

No `repos` field → the current repo only, and add the field on this run so the
scope is explicit next time. alate's pulse spans loom, tessellate-pages and
litmus (alate `CLAUDE.md`). An item is filed, and read, **in the repo that
owns the code**.

### Per-repo mode (dual mode)

Decide each repo's mode **fresh on every run**, from the default branch, never
from a local checkout that may be stale:

```bash
gh api "repos/<owner>/<repo>/contents/BACKLOG.md" -H "Accept: application/vnd.github.raw" 2>/dev/null
```

| What the default branch holds | Mode |
|---|---|
| `BACKLOG.md` containing `<!-- backlog-retired -->` | **issues** |
| No `BACKLOG.md` at all (e.g. a repo created after RFD 004) | **issues** |
| `BACKLOG.md` with entries and no marker | **file** |

A retired `BACKLOG.md` with more than its one pointer line is a finding (the
freeze guard should have caught the PR that grew it): report it under label
hygiene, and read the repo from issues anyway. Because the mode is decided per
run, **rollback is automatic**: reverting a repo's pointer commit puts that
repo back in file mode on the next run.

Say which mode each repo ran in, in the run metadata. A run that silently
reads a migrated repo's pointer file as an empty backlog would report "no open
work" for a repo full of issues.

### Issue mode — the inventory

One call per list, **`-L` on every one** — `gh issue list` defaults to 30
results, which would silently drop half of alate:

```bash
gh issue list -R <repo> --state open -L 1000 \
  --json number,title,body,labels,createdAt,updatedAt,url,issueType,parent,subIssuesSummary,blockedBy,blocking,closedByPullRequestsReferences
gh issue list -R <repo> --state closed -L 300 --search "closed:>=<lastRunDate>" \
  --json number,title,stateReason,closedAt,closedByPullRequestsReferences,labels
gh pr list    -R <repo> --state open -L 200 --label decision --json number,title,createdAt,isDraft,url
```

- **Cross-check the count, and fail the run on a mismatch.** A partial list is
  the one failure this design cannot see from inside:
  ```bash
  gh api graphql -f query='query($o:String!,$n:String!){repository(owner:$o,name:$n){issues(states:OPEN){totalCount}}}' \
    -f o=<owner> -f n=<repo> --jq .data.repository.issues.totalCount
  ```
  If it differs from the length of the open list, stop and report both
  numbers. Don't score a list you know is short.
- **An empty response is not an empty repo.** `gh` can print nothing without
  failing. Treat an empty body as an error unless the count query above says 0.
- If `gh issue list --json` itself errors (the device-test drain recorded
  this on gh 2.98.0; it worked when probed on 2026-09-19), fall back to
  `gh api "repos/<repo>/issues?state=open&per_page=100" --paginate` and drop
  entries that carry `pull_request`.
- **Out of scope:** every issue labelled `device-test` (a separate queue with
  its own drain, `forge:device-test`).
- Comments are fetched only for the issues the honesty pass inspects
  (`gh issue view N -R <repo> --json comments`), not for all of them.

**What each open issue is**, for everything below: `title` is the issue title;
`description` is the body's `### What` section, else the first 500 characters
of the body; `P` is its P label (none, or several, is a lint finding — see
Step 1); `held` is `on hold`; `needs-you` is `needs-input`.

### File mode — the inventory (un-migrated repos only)

Exactly as before RFD 004, plus one addition:

1. Read `<repo-root>/BACKLOG.md` (`## P0`–`## P4` sections; a `P4` entry is
   treated as `P3` for ranking) and `<repo-root>/backlog/*.md` /
   `docs/backlog/*.md` if present. Use a checkout that is current with origin
   (see "check the checkouts" in Step 1).
2. **Also read the repo's open issues that carry a P label** (the issue-mode
   list call above, filtered to `P0`–`P3`, `device-test` excluded). New work
   goes to issues in every repo from RFD 004 on, and crash-monitor,
   security-sweep and device-test file P-labelled issues everywhere, so a file-
   mode pulse that ignored them would miss exactly the newest work. When a
   BACKLOG entry cites the issue (`#N`, `<repo>#N` or its URL), score it once,
   as the issue.

### Other inputs (both modes, unchanged)

| Doc | Default path | What it claims state about |
|---|---|---|
| RELEASE_V2.md | `<repo-root>/RELEASE_V2.md` | Launch state: what's built, what's pending, what flips at launch. **Primary input for Step 2 (current goals).** |
| USER_PATHS.md | `<repo-root>/USER_PATHS.md` | Happy + edge + still-uncovered user flows |
| Regression log | `<repo-root>/memory/project_regression_log.md` | Bug rows with date / root-cause / fix / test columns |
| Anti-patterns (domain) | `<repo-root>/memory/project_anti_patterns.md` | App-specific rules; shared guardrails are in `forge/standards/` |
| Briefs | `<repo-root>/docs/briefs/*.md` | Long product briefs, each linked from its issue |
| User-named markdown | Whatever the user passes | Apply same workflow |

Present the found repos, their modes and the docs back to the user. **For
autonomous (cron-triggered) runs, default to everything found.** For manual
invocations, confirm scope.

## Autonomous vs manual — what each may change

**An unattended (cron) run never closes or reopens an issue, and never changes
a P label.** It comments, edits stale citations in bodies, and reports.
Everything that changes an issue's state goes through a manual run, on the
owner's word. (Adopted from prior art on AI coordinators over GitHub Issues:
closing is hard-limited.) Deleting an issue is never an action of this skill,
in either mode.

## Workflow

### Step 0 — First-run setup (only on initial invocation)

Skip this step if `.roadmap-pulse-state.json` exists in the project
root and contains a `scheduledTaskId` — that is the signal that scheduling has
already happened. Proceed to Step 1.

If the marker doesn't exist:

1. **Confirm the cadence.** Default: **Sunday 16:00 in the user's
   local timezone** (Sunday afternoon — matches the "review past
   week + set up coming week" pattern). Ask the user only if they
   haven't already named a different time in the invocation.
2. **Register the recurring task via the scheduled-tasks MCP.**
   The exact tool name is `mcp__scheduled-tasks__create_scheduled_task`.
   Pass:
   - `taskId`: `roadmap-pulse-weekly`
   - `description`: `"Weekly roadmap pulse — honesty pass, scoring, prioritization"`
   - `cronExpression`: `0 16 * * 0` for the Sunday 16:00 default
     (the MCP evaluates cron in LOCAL time, not UTC — don't
     pre-convert)
   - `prompt`: a self-contained invocation that reads SKILL.md and
     runs Steps 1-6. Each scheduled run starts with no memory of
     this conversation; the prompt must be fully self-contained.
3. **Persist the marker.** Write `.roadmap-pulse-state.json` to the
   project root with:
   ```json
   {
     "scheduledTaskId": "<id returned by the MCP>",
     "cronExpression": "<the cron you registered>",
     "registeredAt": "<ISO timestamp>",
     "skillVersion": "2.0.0",
     "repos": ["Tessellate-Studio/<this repo>"]
   }
   ```
   Later runs add `artifactUrl` (Step 5), `lastRunDate`, `lastScores` (Step 5)
   and `rejectedDependencies` (Step 3).
4. **Confirm to the user.** Show the next-fire timestamp (the MCP
   returns it) so they know the cadence is live.

If the scheduled-tasks MCP isn't available in this environment:
write the proposed schedule to `.roadmap-pulse-state.json` with a
`pending: true` flag and a `proposedPayload` field containing what
would have been registered. Tell the user the MCP wasn't available
and they'll need to register it manually. Do not proceed silently —
a skill that promises weekly autonomy but didn't register the cron
is worse than one that's explicit about the gap.

For all subsequent runs, skip Step 0 entirely.

### Step 0.5 — Read last run's scores

Next week's "what changed" is built from this week's scores, and the scores
live in the roadmap Artifact itself. Before anything else:

1. `artifactUrl` in `.roadmap-pulse-state.json` → call the Artifact tool with
   `action: "read"` and that `url`. Parse the
   `<script type="application/json" id="roadmap-pulse-scores">` block from the
   returned page.
2. The read fails, or the page has no such block → use `lastScores` from
   `.roadmap-pulse-state.json`, and **say so in the Step 6 summary** ("previous
   scores read from the state-file fallback, not the Artifact").
3. Neither exists → if the repo still has a `WEEKLY_DIGEST.md` from before
   RFD 004, read its newest section **read-only** for the previous top 10
   (it is never appended to again). Otherwise this is the first run: the diff
   section says so.

Block shape and field meanings: [`references/digest-format.md`](references/digest-format.md).

### Step 1 — Honesty pass

For each open item, scan for state claims and verify each against the source of truth. Full detection logic in [`references/staleness-detection.md`](references/staleness-detection.md) — read it before running. It gives the issue-mode check and the file-mode check for each failure mode.

| Failure mode | Issue mode check | Cron action | Manual-run action |
|---|---|---|---|
| **Already-shipped-but-still-open** | `closedByPullRequestsReferences` holds a merged PR while the issue is open; the timeline (`gh api repos/<r>/issues/N/timeline`) has a `cross-referenced` merged PR; or `git log origin/<default> --grep "<distinctive phrase>"` finds the squash merge | **One** evidence comment with the hidden marker `<!-- pulse:suspect-shipped -->`, edited on later runs, never re-posted. Listed in the Artifact under "close these?". **Never closes** | Owner confirms → `gh issue close N --reason completed --comment "<SHA, branch --contains proof>"` |
| **Shipped-from-orphan-branch** | Closed `completed` since the last run, with no merged PR in its timeline and no default-branch SHA cited | Comment + Artifact flag | Reopen with a history note |
| **Deferred-without-source** | Open `P3` or `on hold` whose body has no *because* / link / decision doc / `Deferred until:` trigger | Artifact flag | Add the rationale to the body |
| **Stale file:line citations** | Same algorithm, run over the issue body | **Edit the body in place** (GitHub keeps the edit history) + one comment naming old → new | Same |
| **Still-pending-but-actually-live** | Entry claims outstanding _external_ state (env var, cron, table, endpoint, DNS, runner) — **probe the live system**; run the body's own `**Verify:**` block instead of quoting it | Comment with the probe output; narrow "Done when" in the body | Close or narrow, per the three-outcome grading table |
| **Label hygiene** (issues only) | 0 or >1 P labels; `P0` with no activity for 14 days; `needs-input` > 14 days; `on hold` past its review-by date; a dead `claimed`; `needs-input` on a `decision` PR; a `decision` PR open > 14 days | Artifact section. `on hold` expiry → reminder comment. Dead `claimed` → `wip sweep` | Fix the labels with the owner |

In **file mode** the first five checks run over `BACKLOG.md` exactly as they
always have, and rewrites follow the BACKLOG templates in
[`references/rewrite-patterns.md`](references/rewrite-patterns.md) (strike +
tombstone, reopen with a history note, add a rationale). Those rewrites go in
one PR to that repo, as before.

**The last content check hunts in the opposite direction from the others and is
easy to forget.** The first four ask "claims done — is it?". The fifth asks
"claims pending — is it?". Both produce ghosts; the fifth's ghosts are worse,
because they manufacture work for the user and hide shipped features from
scoring. It was added after a P1 entry sat "PENDING, four steps outstanding"
for a month while the pipeline ran fine every six hours — and its listed steps
named the wrong secret store, so following them would have done nothing.

Comments, body edits and closes use the templates in
[`references/rewrite-patterns.md`](references/rewrite-patterns.md) → "Issue
rewrites". Read it before drafting, so a rewrite blends with the issue's style.

**Also check the checkouts themselves, not just their logs.** The honesty pass
runs `git log` against each scoped repo's local checkout — but a checkout can
lie by _state_ while its log reads fine: parked on a branch whose PR merged
weeks ago, N commits behind origin, or carrying uncommitted changes nobody
remembers. (Found in practice, 2026-07-31: one tool repo parked 23-behind on a
long-merged branch — which made a session read its standards as missing rules
that had shipped — plus dirty trees in two app repos.) For every repo in the
scope table:

```bash
git -C <checkout> fetch origin --quiet
git -C <checkout> rev-parse --abbrev-ref HEAD          # parked branch?
git -C <checkout> rev-list --left-right --count HEAD...origin/<default>
git -C <checkout> status --porcelain | wc -l           # dirty count
```

Fix only what is provably safe, report the rest:

- Parked on a branch whose PR is **MERGED** → rename to `done/<branch>`,
  checkout the default branch, `git pull --ff-only`.
- Clean checkout behind origin → `git pull --ff-only`.
- Dirty files or unpushed commits → **never discard; report** with the file
  list. They may be another live session's work. Unstaged _deletions_ of
  committed files may be restored (content is in git; nothing is lost).

**Critical:** Step 2 onward operates ONLY on items confirmed truly-open by Step 1. A ghost item shouldn't get scored. An issue with a `pulse:suspect-shipped` comment still open on a cron run is scored but marked "suspect shipped" in the output — the owner decides.

### Step 2 — Context pull (current goals)

1. Read `RELEASE_V2.md` end to end.
2. Infer current launch-state signals — e.g.:
   - "Closed testing is live" → launch-acquisition tasks (email setup, Reddit posts, Play Console screenshots) gain urgency.
   - "Privacy policy published at v3.2" → privacy-followup tasks become higher-priority.
   - "Awaiting App Store submission" → anything blocking submission is critical.
3. **Surface the inferred urgencies for sign-off.** Specifically: "I read RELEASE_V2 as saying: closed beta is live + email setup + Reddit are the immediate gates. Add anything I missed?"
4. Accept user overrides — they can name additional urgent items, remove ones you flagged, or pivot the focus entirely.
5. Persist the confirmed list as the **goal-alignment overlay** for Step 4. Don't write it to a file — it's per-run.

### Step 3 — Dependencies

Full detection, confirmation and persistence rules in [`references/dependency-inference.md`](references/dependency-inference.md).

1. **Read the confirmed graph first.** Issue mode: native `blockedBy` /
   `blocking` from the list call (they work across repos) plus parent/child
   from sub-issues. File mode: `**Depends on:**` lines in BACKLOG entries.
2. **Infer only what's missing.** Scan titles and bodies for high-confidence
   signals (`#N` / `repo#N` next to "depends on / blocked by / after / requires
   / needs", or a direct title mention) and medium ones (a shared file or
   external system). An issue with ≥1 native link is not re-inferred unless its
   body changed after the link was created.
3. **Ask the user to confirm or reject** — one clustered table, not 10
   separate questions.
4. **Persist confirmed dependencies (manual runs only).** Issue mode:
   `gh issue edit <dependent> -R <repo> --add-blocked-by <blocker-url>`. File
   mode: a `**Depends on:**` line in the BACKLOG entry, as before.
5. **Rejected** suggestions go in `rejectedDependencies` in
   `.roadmap-pulse-state.json` with a 4-week cooldown.

**Cron runs persist nothing to issues.** High-confidence suggestions go in the
Artifact's "needs confirmation" table instead of a `**Suggested dependency:**`
marker (that marker needed a file to live in). File-mode repos keep the old
behaviour: a `**Suggested dependency:**` line in the entry.

A **parent** issue is scored as the rollup of its open children, and only
**leaf** issues are auto-build candidates. Cycle detection runs on the whole
graph, as before.

### Step 4 — RICE scoring

For each open item:

1. Compose the input for rubric-sdk: `{ title, description (≤500 chars), context: { goals: <Step 2 list>, dependencies: <Step 3 graph> } }`. Where the inputs come from, per mode: [`references/scoring-contract.md`](references/scoring-contract.md) → "Where the inputs come from".
2. Invoke rubric-sdk via [`scripts/invoke_rubric.sh`](scripts/invoke_rubric.sh) — wraps the SDK CLI so the skill doesn't hand-write CLI strings. Falls back to programmatic API if the CLI fails.
3. Receive `{ reach, impact, confidence, effort, rice_score, reasoning }`. **Reach and Effort come from the issue body** when a human filled the `### Reach` / `### Effort (person-days)` sections (anything but `unknown`); recompute `rice_score` with them and cite "from the issue" in the reasoning.
4. **Adjust score with three multiplier overlays:**
   - **×1.2** if this item produces a reusable component/pattern (reusability bonus).
   - **×1.2** if this item is on the Step 2 goal-aligned list (strategic fit bonus).
   - **×1.1** if this item blocks another open item (`blocking.totalCount ≥ 1`, or a confirmed file-mode dependency) (dependency-unblock bonus).
5. **Rank within the owner's P bands.** Sort by adjusted score, then apply the
   band floor: **an item never ranks below one two or more P levels lower**
   (a `P0` never below a `P2` or `P3`; a `P1` never below a `P3`) — applied as
   the two "lifts" in `scoring-contract.md`, because a pairwise comparator for
   this rule is not transitive. Equal scores break toward the higher P. `on
   hold` items rank after every non-held item. Band by percentile on the final
   order: top 20% = Must, next 30% = Nice, next 30% = Low, bottom 20% = Reject.
6. **RICE proposes, the label decides.** When an item's score sits far outside
   its P band (e.g. a `P3` in the top 20%, a `P0` in the bottom 20%), list a
   **proposed P change** with the reason. A cron run only lists it; a manual
   run applies it with the owner's yes.

Scores are **never written to issues**: no score labels, no per-issue
scorecard comments, no Projects fields. Every score goes in the Artifact's
embedded JSON block (Step 5).

Full RICE contract with axis definitions + overlay patterns in [`references/scoring-contract.md`](references/scoring-contract.md). Read it before invoking.

### Step 5 — Output

**Inline (in the conversation):**

```
## This week's priorities

| Rank | P | Item | RICE | Adjusted | Band | Why |
|---|---|---|---|---|---|---|
| 1 | P0 | <title> (alate#123) | 80 | 126.7 | Must | <RICE reasoning + overlay bonuses> |
| 2 | ... | ... | ... | ... | ... | ... |
...up to 10
```

**The roadmap Artifact — the digest.** There is no `WEEKLY_DIGEST.md`, no
digest issue and no weekly PR (owner ruling, RFD 004 §4.6). The Artifact page is
the whole digest, and **its URL never changes**:

1. Read `artifactUrl` from `.roadmap-pulse-state.json`. If present, pass it as
   the Artifact tool's `url` parameter; if absent (first run), publish fresh and
   then **save the returned URL into the state file** under `artifactUrl`.
2. Use a stable file path (`<scratchpad>/roadmap-<repo-name>.html`), a stable
   `<title>` ("<Repo> roadmap pulse"), and a stable icon (`map`) so redeploys
   land on the same page.
3. Content, in this order (full spec in
   [`references/digest-format.md`](references/digest-format.md)):
   the priorities table (Rank | ☐ | P | Item | Score | Band | Source — the
   issue URL, or the BACKLOG line for a file-mode entry | Why), then
   "awaiting your yes/no" (open `decision` PRs, oldest first), "needs you"
   (`needs-input`), "close these?" (suspect-shipped), label hygiene, proposed
   P changes, dependency suggestions needing confirmation, holds expiring,
   "built this week", "what changed since last run", and run metadata
   (each repo's mode and open-issue count).
4. **Embed this run's scores** for every scored item — not just the top 10 —
   as `<script type="application/json" id="roadmap-pulse-scores">{…}</script>`.
   That block is what Step 0.5 reads next week, and it is the rubric's
   calibration corpus. Also write the same object to `lastScores` in
   `.roadmap-pulse-state.json` (the fallback) and set `lastRunDate`.
5. Checkboxes persist in the page via `localStorage` only: they are the user's
   visual scratchpad. State the canonical rule in the page footer: _checking a
   box here doesn't change the issue — tell Claude "close alate#123" or let
   the next pulse pick it up from GitHub_.
6. Load the `artifact-design` skill before writing the page (required by the
   Artifact tool); keep it theme-aware and self-contained.

### Step 5.5 — Auto-build top P0 items (autonomous runs only)

This step runs **only on autonomous (cron-triggered) runs**. On manual invocations, skip this step — the user is present and will decide what to build.

Everything built here ships to **test/preview** (OTA to the `preview` channel), never production. The user reviews on device at their convenience and promotes to production when ready.

**Candidates, up to 2 per run.** An item qualifies only when **all** hold:

- Issue mode: an open issue labelled `P0`, in the Must band, that is a **leaf**
  (no open sub-issues), has no live `claimed` that isn't the pulse's own, has
  none of `needs-input` / `on hold` / `device-test`, is not a `decision` PR, and
  has no open blocker in `blockedBy`.
- File mode: an entry in the `## P0` section, in the Must band, whose entry has
  no `**Needs input:**` / `**Decision needed:**` line.
- Both modes: it doesn't need changes in more than one repo, and its text
  doesn't mention "breaking change", "migration" or "schema change" — those
  need human oversight.

**For each candidate:**

1. **Branch:** create `pulse/<slug>` off the default branch (fetch origin first).
2. **Claim it (issue mode):** `wip claim <repo>#<n>` before writing any code,
   and after the branch exists so the claim names the right worktree (`wip` not
   found → `node "${CLAUDE_PLUGIN_ROOT}/tools/work-claim/cli.js"` with the same
   arguments). Another live session already holds it → drop the branch, skip
   the item and say so.
3. **Build:** invoke the `forge:build-feature` skill to implement the item end-to-end. The build-feature skill handles TDD, implementation, OTA publish to preview, device verification (if a device is connected), and quality pass.
4. **PR:** open a ready (not draft) PR with:
   - Title: `feat(<scope>): <item title>`
   - Body: standard build-feature output — TLDR, what changed, test coverage, acceptance criteria verdicts — and **`Closes #<n>`** for an issue-mode item, so the merge closes the issue.
   - Labels: `pulse-auto-build`, `auto-generated`
5. **Merge through the confidence command** — after waiting for CI as its own
   step, because the confidence command reads CI once and a check still
   running makes it refuse:
   `node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo Tessellate-Studio/<repo> --pr <n>`
   (any exit but `0` → leave the PR open with its `RESULT:` line), then
   `node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo Tessellate-Studio/<repo> --pr <n> --source roadmap-pulse --what "<item title>"`.
   It refuses on anything not green, a revert cooldown, a dependency change, an
   open device test that verifies the PR, or any sync/persistence/migration
   path. It skips the one-file and declaration checks, which cannot describe
   a feature, and prints them as `skipped`. Exit `10` → leave the PR open for
   the user with the printed reasons; do not retry another way. **Never
   `--auto`, and never a bare `gh pr merge`** — this runs unattended and is
   the largest blast radius in the system (forge#86). See
   `${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` → "Merge on green".
6. **Close the loop.** Issue mode: nothing to edit — the merge closes the issue
   through `Closes #<n>`. File mode: mark the BACKLOG entry `DONE — <date>, PR
   #<n>` and the merged SHA once it lands, collapsed to a one-line tombstone
   per "Docs stay lean".
7. **Release the claim:** `wip release <repo>#<n>`, whether the build merged,
   stalled or was left open for the user.
8. **Log:** safe-merge writes the auto-ship-log row on exit `0`. On exit `11` (merged, append failed) add it by hand to `Tessellate-Studio/litmus` auto-ship-log.md (default branch `main`):
   `| <date> | roadmap-pulse | <repo> | PR #<n> | <1-line what> | P0 auto-build |`

**Cap at 2 items per run.** If more than 2 items qualify, build the top 2 by score. The rest stay in the priority list for next week (or the user picks them up manually).

**No device connected for OTA verification** → build and PR are fine, but note in the PR that device verification was skipped.

The Artifact's **"Built this week"** section lists what was implemented, with PR links and a 1-line summary of each.

### Step 6 — Summary + next-run confirmation

End the run with the user's project-CLAUDE.md communication structure (for Alate that's the 5-part format). Surface:

1. **What's needed** — the prioritized list (top 3-5 in the summary; full 5-10 above).
2. **What you (user) need to do** — decision PRs awaiting a yes/no, `needs-input` items, "close these?" candidates, proposed P changes and dependency suggestions to confirm.
3. **What I (Claude) can do** — anything the skill can take off the user's hands (e.g. "start on alate#123 now").
4. **Summary of what changed this run** — items closed or flagged, dependencies linked, scores shifted vs last run (from Step 0.5 — say if the fallback was used).
5. **Built this week** — items auto-built by Step 5.5 (PR links + 1-line summaries). Only present on autonomous runs where Step 5.5 executed.
6. **Issues touched** — comments posted, bodies edited, links added, per repo; any file-mode doc PR; and the refreshed roadmap Artifact link.

Confirm the next scheduled run is on the calendar; surface the next-run timestamp.

## What this skill does NOT do

- It does not close, reopen or re-prioritise an issue on an unattended run. It comments and reports; the owner decides (see "Autonomous vs manual").
- It never deletes an issue, a comment or a BACKLOG entry. "Strike-through, don't delete" became "close with a reason, never delete": a closed issue keeps its whole body and comments, so nothing that no diff can give back is lost.
- In file mode it does not collapse **what no diff can give back** (rejected alternatives and why they lost, investigations that corrected a false belief, external research) or **test artefacts** (coverage maps, user-path audits, E2E contracts, regression tables). Both carve-outs are stated in `standards/workflows.md` → "Docs stay lean".
- It does not invent SHAs or RICE scores. If rubric-sdk fails to return a score, the item is surfaced as "unscored, manual review needed" — never fabricated.
- It does not write scores into issues (no labels, no scorecard comments, no Projects fields) or re-sort a BACKLOG's P sections. The Artifact is the visibility layer.
- It does not touch `device-test` issues. That queue has its own drain.
- It does not run on repos or docs the user didn't include in the inventory's confirmed scope.
- It does not pester. Rejected dependency suggestions don't re-surface for 4 weeks. Goal-alignment inferences are surfaced once per run, not re-asked. An evidence comment is edited on later runs, never re-posted.

## When NOT to use this skill

- The doc is a writing/style document (blog post, marketing copy, design narrative). This skill is for status/planning with verifiable claims.
- The user wants to ADD a work item (file it: `wi new --priority P0..P3`) or edit a doc directly.
- There are no open issues, no BACKLOG and no RELEASE doc in scope, AND the user didn't name an alternative — there's nothing to operate on; surface that and exit.
- Non-English content (detection regexes assume English keywords).

## Tone + style

- **Cite every verdict and every score.** Per the project's anti-pattern AP#20 (if their `CLAUDE.md` references it): every assertion gets a source. For shipping claims, cite the merged PR, the timeline event or the `git log` line. For RICE scores, cite the rubric-sdk's per-axis reasoning output (and "from the issue" for human-set Reach/Effort). For dependency inferences, cite the content match that triggered the inference.
- **Close with a reason, never delete.** Historical context in closed-out items is often the whole reason future readers can act on a related one.
- **Be specific about what's stale and what shifted.** "Top priorities have shifted" is useless. "Set up email aliases moved from #4 last week to #1 this week — goal-alignment bonus (closed testing now live) + dependency-unblock bonus (Reddit + BrandIntegration both blocked on it)" is actionable.
- **Don't pester.** The skill runs weekly; users will get fatigued fast if every run asks 15 confirmation questions. Cluster questions, default to sensible inferences, persist confirmed answers so they don't re-ask.
