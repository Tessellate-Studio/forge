---
name: roadmap-pulse
description: Weekly project-management skill that scans planning docs (BACKLOG, RELEASE notes, regression log), runs an honesty pass on stale claims, infers task dependencies, scores open tasks via rubric-sdk, and produces a prioritized top-5-to-10 list plus an appended WEEKLY_DIGEST.md entry. Self-schedules a weekly cron; also fires manually. Use whenever the user asks to "run roadmap pulse", "rebalance the backlog", "score open tasks", "what should I focus on this week", "is my roadmap up to date", or any phrasing implying both honesty-checking the planning docs AND deciding what's next. Triggers even on passive cues like "feels like the backlog needs a refresh" or "I'm not sure what to focus on" — even when the user doesn't say "skill" or "pulse" explicitly. Output is a sourced prioritized list with rubric-sdk scores + dependency-unblock + goal-alignment bumps, plus a dated WEEKLY_DIGEST.md section that builds a decision history.
---

# Roadmap pulse

Planning docs drift. Priorities drift. Dependencies hide. Goals shift week-to-week. By the time you sit down on Sunday to plan the week, the BACKLOG says one thing, RELEASE_V2 says another, and you're back to re-deriving priorities from scratch.

This skill is a weekly project-management pulse. It does six things in sequence — none of them new individually, but doing them *together*, *consistently*, and *with sourced reasoning* is the value:

1. **Honesty pass** — strip the ghosts (items still listed as open that actually shipped; items marked shipped from orphan branches that never merged).
2. **Context pull** — read `RELEASE_V2.md` for current launch-state signals; surface inferred urgencies; accept user overrides.
3. **Dependency inference** — spot which open tasks block which; confirm with user; persist confirmed dependencies back into the BACKLOG entries.
4. **Rubric scoring** — invoke rubric-sdk per open task (Impact / Complexity / Reusability / Strategic Fit, 0-12 total); adjust for dependency-unblock potential + goal-alignment.
5. **Output** — a prioritized top-5-to-10 list inline + append a dated section to `WEEKLY_DIGEST.md` so the history of weekly decisions accumulates.
6. **Self-schedule** — first-run only: set up a weekly cron via the `schedule` skill. Default cadence Sunday 16:00 IST, override at first run.

The point is not "produce a pretty list." The point is **align action with current goals, supported by sourced reasoning, weekly, without re-deriving from scratch each time.**

## Subagent / worktree harness — read before invoking tools

If this skill runs inside a subagent that was launched with
`isolation: "worktree"`, the harness creates a temporary git worktree
at e.g. `.claude/worktrees/agent-<id>/`. **The `Edit` tool resolves
absolute paths to the MAIN checkout, NOT the worktree.** This means
naïvely editing `C:\...\alate\BACKLOG.md` from inside a worktree
subagent will silently mutate the user's real working tree —
defeating the whole point of the isolation. Precedent: iteration-1
test of this skill, eval-1 with-skill (2026-05-23), leaked 414 lines
of doc edits to the main checkout.

To stay inside the worktree:
- Resolve paths RELATIVE to the worktree root (e.g. `BACKLOG.md`,
  not the absolute path). `cwd` defaults to the worktree.
- For commit messages, scripts, etc., use relative paths.
- For absolute paths you can't avoid, prefix with the worktree path
  the harness reported at launch (look in the agent's environment
  for `worktreePath`).

When `git status` from inside the worktree shows clean while the
caller's `git status` shows new changes — that's the bug. Stop and
fix the path resolution before continuing.

## Default doc targets (Step 1 + Step 2 inputs)

When invoked, scan **all of these that exist in the project**. Always start by inventorying — never assume a single doc is in scope. If the user named a specific doc only, restrict to that one.

| Doc | Default path | What it claims state about |
|---|---|---|
| BACKLOG.md | `<repo-root>/BACKLOG.md` | Open work; shipped/landed/deferred items, P0–P4 sections |
| RELEASE_V2.md | `<repo-root>/RELEASE_V2.md` | Launch state: what's built, what's pending, what flips at launch. **Primary input for Step 2 (current goals).** |
| USER_PATHS.md | `<repo-root>/USER_PATHS.md` | Happy + edge + still-uncovered user flows |
| `backlog/*.md` (sub-docs) | `<repo-root>/backlog/<name>.md` | Long-form planning docs for items parked from BACKLOG.md |
| Regression log | `~/.claude/projects/<project-slug>/memory/project_regression_log.md` | Bug rows with date / root-cause / fix / test columns |
| Anti-patterns | `~/.claude/projects/<project-slug>/memory/project_anti_patterns.md` | Numbered rules with sourced precedents |
| User-named markdown | Whatever the user passes | Apply same workflow |

**Inventory step at the start of every invocation:**

1. `ls <repo-root>/*.md` filtered to planning-doc-shaped files (skip README.md, CLAUDE.md — those are project-rule docs).
2. `ls <repo-root>/backlog/` if the directory exists.
3. Check the Claude Code memory directory for the regression log + anti-patterns (`<project-slug>` is the project's directory name with `\` / `/` replaced by `-`).
4. Present the found docs back to the user. **For autonomous (cron-triggered) runs, default to all-found-docs.** For manual invocations, confirm scope.

## Workflow

### Step 0 — First-run setup (only on initial invocation)

Skip this step if `.roadmap-pulse-state.json` exists in the project
root — that file is the signal that scheduling has already happened.
Read it; if it contains a `scheduledTaskId`, proceed to Step 1.

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
     "skillVersion": "1.0.0"
   }
   ```
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

### Step 1 — Honesty pass

For each in-scope doc, scan for state-claims and verify each against the source of truth. Full detection logic in [`references/staleness-detection.md`](references/staleness-detection.md) — read it before running.

Quick summary of the four failure modes:

| Failure mode | The check |
|---|---|
| **Already-shipped-but-still-open** | `git log master --oneline --grep="<distinctive phrase from entry>"` finds a squash merge |
| **Shipped-from-orphan-branch** | `git branch --contains <cited-sha>` does NOT list `master` |
| **Deferred-without-source** | Entry body contains `parked` / `v2` / `deferred` but no `because` / link / rationale |
| **Stale file:line citations** | Cited file moved or symbol drifted to a different line |

Rewrites use the templates in [`references/rewrite-patterns.md`](references/rewrite-patterns.md). Read it before drafting rewrites so the rewrites blend with each doc's house style.

**Critical:** Step 2 onward operates ONLY on items confirmed truly-open by Step 1. A ghost item shouldn't get scored.

### Step 2 — Context pull (current goals)

1. Read `RELEASE_V2.md` end to end.
2. Infer current launch-state signals — e.g.:
   - "Closed testing is live" → launch-acquisition tasks (email setup, Reddit posts, Play Console screenshots) gain urgency.
   - "Privacy policy published at v3.2" → privacy-followup tasks become higher-priority.
   - "Awaiting App Store submission" → anything blocking submission is critical.
3. **Surface the inferred urgencies for sign-off.** Specifically: "I read RELEASE_V2 as saying: closed beta is live + email setup + Reddit are the immediate gates. Add anything I missed?"
4. Accept user overrides — they can name additional urgent items, remove ones you flagged, or pivot the focus entirely.
5. Persist the confirmed list as the **goal-alignment overlay** for Step 4. Don't write it to a file — it's per-run.

### Step 3 — Dependency inference

For each open task identified in Step 1:

1. Scan the task's content for cross-references to other open tasks — explicit links, mentioned task titles, mentioned files that another task owns.
2. Surface inferred dependencies with confidence labels (high / medium / low). Detection patterns + persistence format in [`references/dependency-inference.md`](references/dependency-inference.md).
3. **Ask the user to confirm or reject each inferred dependency.** Cluster confirmations so it's one batch question, not 10 separate ones.
4. For **confirmed** dependencies: write back into the BACKLOG entry as a `**Depends on:** <other entry title>` line. Persistent — future runs read this directly instead of re-inferring.
5. For **rejected** dependencies: discard. The skill won't re-suggest the same one for at least 4 weeks (avoid pestering).

For autonomous (cron) runs where no user is available to confirm: persist HIGH-confidence inferences as `**Suggested dependency:**` (note: SUGGESTED, not DEPENDS — easy to spot in review). The user upgrades them to confirmed `**Depends on:**` in the next manual run.

### Step 4 — Rubric scoring

For each open task:

1. Compose the input for rubric-sdk: `{ title, description (truncated to 500 chars), context: { goals: <Step 2 list>, dependencies: <Step 3 confirmed list> } }`.
2. Invoke rubric-sdk via [`scripts/invoke_rubric.sh`](scripts/invoke_rubric.sh) — wraps the SDK CLI so the skill doesn't hand-write CLI strings. Falls back to programmatic API if the CLI fails.
3. Receive `{ impact, complexity, reusability, strategic, total, band, reasoning }`.
4. **Adjust scores with two overlays:**
   - **+1** to `total` if this task is on the Step 2 goal-aligned list (capped at 12).
   - **+1** to `total` if this task is a confirmed dependency of another open task (the dependency-unblock bonus).
5. Re-band per the rubric-sdk's bands (9-12 Must, 6-8 Nice, 3-5 Low, 0-2 Reject).

Full contract with rubric-sdk + dimension rubrics + override patterns in [`references/scoring-contract.md`](references/scoring-contract.md). Read it before invoking — the contract is also the spec the SDK is evolving toward.

### Step 5 — Output

**Inline (in the conversation):**

```
## This week's priorities

| Rank | Task | Score | Band | Why |
|---|---|---|---|---|
| 1 | <title> | 11/12 | Must | <dependency / goal-alignment reasoning> |
| 2 | ... | ... | ... | ... |
...up to 10
```

**Persisted (file system):**

Append a dated section to `<repo-root>/WEEKLY_DIGEST.md`. Format defined in [`references/digest-format.md`](references/digest-format.md). The digest accumulates every week — useful for retrospectives AND as future training data for rubric-sdk (Track B).

If `WEEKLY_DIGEST.md` doesn't exist, create it with a brief header explaining what the file is for.

### Step 6 — Summary + next-run confirmation

End the run with the user's project-CLAUDE.md communication structure (for Alate that's the 5-part format). Surface:

1. **What's needed** — the prioritized list (top 3-5 in the summary; full 5-10 above).
2. **What you (user) need to do** — anything that requires the user (e.g. "confirm dependency suggestions from Step 3 that we marked SUGGESTED").
3. **What I (Claude) can do** — anything the skill can take off the user's hands (e.g. "start on Task #1 now").
4. **Summary of what changed this run** — items struck through, dependencies persisted, scores shifted vs last run (read prior `WEEKLY_DIGEST.md` section for diff).
5. **Docs updated** — BACKLOG.md (struck-through items + persisted Depends-on lines), WEEKLY_DIGEST.md (new section), maybe memory files.

Confirm the next scheduled run is on the calendar; surface the next-run timestamp.

## What this skill does NOT do

- It does not delete entries. Confirmed-shipped items get **struck through with a tombstone** (preserves history).
- It does not invent SHAs or rubric scores. If rubric-sdk fails to return a score, the entry is surfaced as "unscored, manual review needed" — never fabricated.
- It does not re-sort BACKLOG.md's P-tier sections or write inline scores into entries. (Both are opt-in extensions you can add later — for now, the digest + inline list is the visibility layer.)
- It does not run on docs the user didn't include in the inventory's confirmed scope.
- It does not pester. Rejected dependency suggestions don't re-surface for 4 weeks. Goal-alignment inferences are surfaced once per run, not re-asked.

## When NOT to use this skill

- The doc is a writing/style document (blog post, marketing copy, design narrative). This skill is for status/planning docs with verifiable claims.
- The user wants to ADD content to a doc (use direct edits).
- The project doesn't have any of the default planning docs AND the user didn't name an alternative — there's nothing to operate on; surface that and exit.
- Non-English docs (detection regexes assume English keywords).

## Tone + style

- **Cite every verdict and every score.** Per the project's anti-pattern AP#20 (if their `CLAUDE.md` references it): every assertion gets a source. For shipping claims, cite the `git log` line. For scores, cite the rubric-sdk's reasoning output. For dependency inferences, cite the content match that triggered the inference.
- **Strike-through, don't delete.** Historical context in closed-out entries is often the whole reason future readers can act on a related item.
- **Be specific about what's stale and what shifted.** "Top priorities have shifted" is useless. "Set up email aliases moved from #4 last week to #1 this week — goal-alignment bonus (closed testing now live) + dependency-unblock bonus (Reddit + BrandIntegration both block on email)" is actionable.
- **Don't pester.** The skill runs weekly; users will get fatigued fast if every run asks 15 confirmation questions. Cluster questions, default to sensible inferences, persist confirmed answers so they don't re-ask.
