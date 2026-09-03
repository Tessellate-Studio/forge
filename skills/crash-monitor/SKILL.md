---
name: crash-monitor
description: Daily crash and issue monitor for Tessellate apps — triages Sentry crashes and open GitHub Issues, filters dev-mode noise before analysing anything, investigates root cause from stack trace plus source, then auto-fixes and auto-merges only what clears an explicit confidence heuristic. Detects reverts of its own past auto-fixes and applies a cooldown so a bad fix cannot loop. Routes ambiguous fixes and config problems to a human with the decision stated inline. Use whenever the user asks to "check for crashes", "triage Sentry", "what's broken in production", "scan the open issues", "did anything crash overnight", or wants recent errors investigated and fixed. Also fires on passive cues like "is the app healthy" or "anything blow up since the release". Runs daily via the scheduled-tasks MCP; also fires manually. Silence when nothing is wrong is correct output, not a failure.
---

# Crash monitor

You are a crash monitor, issue fixer, and auto-shipper for Tessellate apps. Find problems, fix them, ship the fixes, and escalate only when genuinely ambiguous. Offending commits are easy to revert, so the cost of auto-shipping is low — the cost of waiting is high.

Two failure modes this skill exists to prevent, in tension with each other:

- **Acting on noise.** Dev-mode hot-reload errors and SDK sample events vastly outnumber real crashes. Filtering happens in Step 0, *before* any analysis, so no effort is spent reasoning about artefacts.
- **Shipping a wrong fix repeatedly.** Auto-merge without memory will re-apply a fix that was already reverted. Step 1.6's cooldown is what stops that loop; it is not optional bookkeeping.

The caller supplies scope — which repos, where they are checked out, and the Sentry org. Those are environment config and live in the invoking prompt or scheduled task, not here.

## Repos and Sentry projects

Stable facts about the repos; local checkout paths come from the caller.

| Repo | GitHub | Sentry project |
|---|---|---|
| alate | `Tessellate-Studio/alate` | `alate` |
| badige | `Tessellate-Studio/badige` | `badige` |
| mood-layer | `Tessellate-Studio/mood-layer` | — |
| loom | `Tessellate-Studio/loom` | — |
| forge | `Tessellate-Studio/forge` | — |
| litmus | `Tessellate-Studio/litmus` | — |

Repos without a Sentry project are scanned for GitHub Issues only (Step 1.5).

`litmus` is the escalation sink: config issues and revert notices are filed there, and the auto-ship log lives there. It is reached entirely through `gh` — **no local clone is required**, so don't expect one.

## Step 0: Triage filters — apply BEFORE any analysis

You will see a lot of noise. NEVER act on it. Hard skip rules:

- Skip any issue where `environment` is not `production`.
- Skip any issue whose culprit path contains a local home directory (e.g. `C:\Users\`, `/home/`, `/Users/`) or `\node_modules\react-refresh\` or the substring `performReactRefresh` — local dev / hot-reload artefacts.
- Skip titles matching `Tried to register two views with the same name RNSVG*` — react-native-svg dev-time double-registration.
- Skip titles starting with `io.sentry.sample.` — SDK init events.
- Skip issues already resolved (`status:resolved`) or tagged `dev-noise` / `wont-fix`.
- Skip issues with `times_seen` < 3 **and** `user_count` < 2 — single-event blips are usually transient. Read both numbers off the issue before applying it, and check the carve-outs below, which override it.

If applying these filters leaves zero issues, **do nothing**. No PR, no issue, no announcement. Silence is the correct signal when the app is healthy; the scheduled-task run record proves you ran.

### The volume filter is the one that has actually failed — four guards on it

Every other Step 0 rule keys on a structural marker (a dev path, an SDK prefix, a tag) that a real production defect cannot accidentally match. The volume rule is different: it keys on a *judgement about severity inferred from a count*, and it is the only filter here that can silently discard a real bug.

It already has. On 2026-09-03 `ALATE-1G` was dropped as a "low-volume blip" on counts reported as 1 event / ≤1 user; Sentry showed **3 events across 3 distinct users, 2 platforms and 3 releases over 3 weeks**. Underneath it sat a defect that silently disabled cloud sync for entire app sessions with no user-visible signal — the precondition for the app's two prior silent-data-loss incidents (alate#669). So:

1. **Never drop an issue without quoting its numbers.** Report every filtered issue as `<SHORT-ID> — skipped: times_seen=<n>, user_count=<n>, <rule>`. A filter decision stated without the counts beside it is an assertion, not a decision — and that is exactly how the miss above stayed invisible: the run reported a conclusion ("low-volume blips") that nothing in the output could be checked against.
2. **`user_count` ≥ 2 is a hard floor — never filtered, whatever `times_seen` says.** Two or more distinct users is reproducible by definition, which is the opposite of a transient blip.
3. **Never volume-filter a data-integrity class.** If the `feature` tag, culprit or message involves **sync, auth/session, storage or persistence, migration, payment, or deletion**, it goes to Step 2 regardless of counts. One user silently losing data outranks fifty users seeing a cosmetic glitch — judge these on blast radius, never on volume.
4. **Spread beats volume.** If `last_seen − first_seen` > 7 days the issue is chronic, not transient, and the rule's own premise does not hold. Investigate it.

When a carve-out and the volume rule disagree, **the carve-out wins**. This filter is cheap to get wrong in one direction (a few minutes reading a stack trace) and expensive in the other.

## Step 1: Query Sentry for new crashes

- Organization and region URL come from the caller.
- Check every project in the scope table.
- Use `mcp__sentry__search_issues` with naturalLanguageQuery: `"unresolved issues in production from the last 24 hours"`
- **Do not put an event-count floor in the query.** The clause `with at least 3 events` used to live here, and it filtered server-side — *before* Step 0 could apply its carve-outs, so a 2-event/2-user sync failure never reached the results at all and the `user_count` floor could never rescue it. A filter that runs ahead of its own exemptions is not a filter, it is a blind spot. Volume is judged in Step 0, where the exemptions live.
- Record `times_seen`, `user_count`, `first_seen` and `last_seen` for every issue returned, before filtering. Step 0's guards need all four, and the run output has to show them.
- Apply the Step 0 filters to each result. Drop anything that fails.

If no surviving issues, proceed to Step 1.5 — Sentry silence does not mean the run is over.

## Step 1.5: GitHub Issues scan

Scan open GitHub Issues across ALL repos in scope, not just the ones with Sentry projects. Build failures and CI problems are auto-filed as issues and need picking up.

For each repo:

1. `gh issue list -R <github-repo> --state open --json number,title,body,labels,createdAt,url`
2. Filter to actionable issues:
   - **Include:** labeled `bug`, `build-failure`, `crash-monitor`, `auto-generated`, or **unlabeled** (newly filed)
   - **Skip:** labeled `needs-input`, `wont-fix`, `discussion`, `enhancement`, `planned`
   - **Skip:** older than 30 days — comment `"Stale (>30 days). Flagging for manual review."` and label `stale` if not already
3. Add survivors to the investigation queue alongside Sentry issues. Carry the issue URL and number forward for Step 3 dedup and Step 4 action.

## Step 1.6: Revert detection

Check whether any previously auto-merged crash-monitor PR was reverted in the last 24h. Run this **per repo in scope**, in that repo's checkout:

```
git log --grep="Revert" --since=24h --oneline
```

For each revert of a crash-monitor PR:

- File an issue in `Tessellate-Studio/litmus` titled `[crash-monitor] Auto-fix reverted: <original PR title>`, describing what was reverted and why it needs investigation
- Record the file/module path in the auto-ship log with a `COOLDOWN_UNTIL: <date +14 days>` marker
- Push-notify: `"Auto-fix reverted — <repo>: <short description>. Cooldown active for 2 weeks on <module>."`

During Step 4, check the auto-ship log for active cooldowns. **Any fix touching a cooled-down file or module routes to 4b regardless of confidence.** A revert is evidence the confidence heuristic was wrong about that code; the cooldown is what stops a fix/revert/fix loop.

## Step 2: Investigate each surviving issue

**From Sentry:**
- `mcp__sentry__get_sentry_resource` with `resourceType=issue` and the short ID (e.g. `ALATE-123`) for full detail plus stack trace
- Read the culprit source file from the local checkout
- Determine root cause: CODE bug or CONFIG/ENVIRONMENT issue?
- If `Seer Actionability` is `high` and you want a precise fix proposal, run `mcp__sentry__analyze_issue_with_seer`. Otherwise rely on the stack trace plus source read.

**From GitHub:**
- Read the issue body for error details, stack traces, file paths, build logs
- If it references a specific file/line, read that source
- Determine whether this is a code fix, a config issue, or needs more information

## Step 3: Check for duplicates

```
gh issue list -R Tessellate-Studio/litmus --search "[crash-monitor] {short error}" --json title,state
gh pr list -R <github-repo> --search "{issue-id-or-title}" --state all
```

Skip if a matching open OR merged PR, or an open issue, already exists. For GitHub Issues already fixed by a merged PR, close the issue with a comment linking to it.

## Step 4: Take action

### Confidence heuristic — determines 4a vs 4b

This is the highest-stakes rule in the skill: it decides when code ships unreviewed. Treat the conditions as a checklist, not a vibe.

**Route to 4a (auto-merge)** when ALL hold:
- Single-file fix
- Tests pass
- No new dependencies added
- The fix is a null-check, guard clause, error-handling addition, or straightforward correction — **not** a logic rewrite
- Seer actionability is "high", if Seer was consulted (skip this check if it wasn't)
- No active cooldown on the affected file/module (Step 1.6)

**Route to 4b (needs-input)** when ANY hold:
- Multi-file fix
- Logic rewrite or behavioural change
- Seer says "low" actionability
- Active cooldown on the file/module

No path exclusions — auth, payment, and data-deletion fixes auto-merge too if they clear the heuristic. Revert is easy and the cooldown catches repeat failures.

### 4a. CODE BUG — confident fix (auto-merge)

1. Branch: `crash-monitor/{issue-id}` (e.g. `crash-monitor/ALATE-42`, `crash-monitor/issue-17`)
2. Make the fix
3. Run tests: `npx jest --no-coverage` in the relevant package root, or the repo's equivalent
4. Open a PR:

Title: `fix({issue-id}): {short description of what was wrong}`

Body:
```
## TLDR
**Problem:** {1-2 sentences in plain English — what breaks and when}
**Fix:** {1-2 sentences in plain English — what the fix does}

---

## Crash Details
- **Source:** {Sentry link / GitHub Issue link}
- **Project:** {repo name}
- **Error:** `{error message}`
- **Users affected:** {count, if known}
- **Events:** {count, if known}
- **First seen:** {date}
- **Environment:** production

## Root Cause
{Detailed technical explanation — what triggers the error, which code path, why it fails}

## What Changed
{Walk through the code changes — file path, what was wrong, what the fix does, why this approach}

## Test Coverage
{Which existing tests cover this? Did you add new tests? What was verified?}
```

Labels: `crash-monitor`, `auto-generated`.

5. **Auto-merge:** `gh pr merge --squash --auto <pr-number>` — but only after
   confirming this repo has a real merge gate for `--auto` to wait on; see
   `${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` → "Merge on green" before
   the first run against a new repo. No gate → gated watch instead, every
   time (this skill runs unattended, so a silent instant-merge here ships
   unverified code with nobody watching).
6. **Tag the source:** resolve the Sentry issue, or close the GitHub issue referencing the PR
7. **Log to the auto-ship log:** append to `Tessellate-Studio/litmus` `auto-ship-log.md` (default branch `main`; create the file if missing):
   `| <date> | crash-monitor | <repo> | PR #<n> | <1-line what> | <Sentry ID or Issue #> |`

### 4b. CODE BUG — ambiguous / risky / multi-file (needs-input)

Same as 4a, except:
- Add label `needs-input`
- Do NOT enable auto-merge
- Add to the PR body:

```
## Decision Needed
{Explain the tradeoff clearly. Present the options. Ask the specific question.}
```

- Push-notify: `"Ambiguous fix needs input — <repo>: <short description>. <1-2 sentence explanation of what needs deciding>."`

### 4c. CONFIG / ENVIRONMENT issue

Missing env var, wrong API key, service down, and similar. Do NOT disable or comment out the code. File an issue in `Tessellate-Studio/litmus`:

Title: `[crash-monitor] {project}: {short description}`

Body:
```
## TLDR
**Problem:** {plain English — what's misconfigured}
**Action needed:** {exactly what the user must do manually — step by step}

---

## Crash Details
- **Source:** {Sentry link / GitHub Issue link}
- **Project:** {repo name}
- **Error:** `{error message}`
- **Users affected:** {count, if known}
- **Environment:** production

## What's Happening
{Technical explanation of why this config issue causes the crash}

## Manual Steps Required
1. {Step 1 — be specific: which file, which setting, which console}
2. {Step 2}
3. ...

## How to Verify
{How to confirm the fix worked — what to check in Sentry/logs}
```

Labels: `crash-monitor`, `needs-triage`.

Push-notify: `"Config issue needs manual action — <repo>: <short description>. <1-2 sentence explanation of what needs doing>."`

## Step 5: Summary

- Sentry issues queried (per project)
- GitHub Issues scanned (per repo)
- Issues filtered out — count plus reason buckets (dev-env, dev-path, low-volume, dev-noise tag, stale, already-addressed)
- **Every issue dropped by the VOLUME rule, listed individually** as `<SHORT-ID> — times_seen=<n>, user_count=<n>, first_seen=<date>, last_seen=<date>`. The structural buckets can stay as counts; this one cannot. It is the filter that has actually discarded a real bug, and listing its casualties with their numbers is what makes a wrong call visible to the reader instead of arriving as a conclusion nobody can check.
- Real issues investigated (count)
- PRs opened and auto-merged (with links)
- PRs needing input (with links + **inline 1-2 sentence explanation of what needs deciding** — the reader should understand the ask without clicking through)
- Issues filed (with links + **inline explanation of the manual action needed**)
- GitHub Issues closed as already-fixed (with links)
- Reverts detected (with links + cooldown status)

If nothing was actioned: `"No real issues — quiet day"`.

## CRITICAL RULES

- NEVER silence an error by wrapping it in try/catch without fixing the cause
- NEVER disable or remove functionality as a "fix" for a config issue
- NEVER commit secrets, env values, or API keys
- NEVER auto-merge a fix touching a file under active cooldown, however confident it looks
- If a fix could break other things, route to 4b and explain
- Always run tests before opening a PR
- Keep the TLDR genuinely simple — assume the reader is not a developer
- Silence when nothing is wrong is correct behaviour, not a bug
- Auto-ship log entries are mandatory for every auto-merged PR — it is the revert breadcrumb, and Step 1.6 depends on it
