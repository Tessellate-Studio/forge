# Staleness detection — per-failure-mode algorithms (Step 1)

This file is the operational manual for Step 1 of the roadmap-pulse workflow — the honesty pass that strips ghost items before Step 2 onward operates on them. Read this before you start verifying — the gotchas matter, especially around squash merges.

**Two modes.** A migrated repo's open work is GitHub issues (**issue mode**); a repo that hasn't migrated off `BACKLOG.md` yet is read from the file (**file mode**). SKILL.md → "Per-repo mode" says how to tell. Each failure mode below gives the issue-mode check first, then the file-mode check. The probes themselves (git log, `branch --contains`, live-system queries) are the same in both; what changes is where the claim is read and where the verdict is written.

**Unattended runs only comment and report.** In issue mode a cron run never closes or reopens an issue and never changes a P label; it posts or edits one evidence comment and lists the item in the Artifact. The state change happens on a manual run, on the owner's word.

## Table of contents

1. [Already-shipped-but-still-open](#already-shipped-but-still-open)
2. [Shipped-from-orphan-branch](#shipped-from-orphan-branch)
3. [Deferred-without-source](#deferred-without-source)
4. [Stale file:line citations](#stale-fileline-citations)
5. [**Still-pending-but-actually-live**](#still-pending-but-actually-live)
6. [Label hygiene (issue mode)](#label-hygiene-issue-mode)
7. [Cross-failure cases](#cross-failure-cases)
8. [MCP-tracked state (Supabase, etc.)](#mcp-tracked-state)

---

## Already-shipped-but-still-open

### Issue mode

**Symptom:** the issue is open, but the work merged. Usually the PR said "fixes the thing" without the `Closes #N` keyword, or it closed a sibling issue.

**The check, cheapest first:**

1. `closedByPullRequestsReferences` (already in the list call) holds a **merged** PR while the issue is still open. That PR said `Closes #N` and merged, but the close didn't happen (merged into a non-default branch, for example).
2. The issue timeline has a `cross-referenced` event from a merged PR:
   ```bash
   gh api "repos/<owner>/<repo>/issues/<N>/timeline" --paginate \
     --jq '.[] | select(.event=="cross-referenced") | .source.issue | select(.pull_request.merged_at != null) | "\(.number) \(.title) \(.pull_request.merged_at)"'
   ```
   A cross-reference is only a mention. Read the PR before concluding it shipped the item.
3. The file-mode grep below, with a distinctive phrase from the issue title, against `origin/<default>`.

**Verdict:** post **one** evidence comment, starting with the hidden marker `<!-- pulse:suspect-shipped -->` (template: `rewrite-patterns.md` → "Issue rewrites"). On later runs, **edit** that comment rather than posting another. Find it with
`gh api "repos/<owner>/<repo>/issues/<N>/comments" --paginate --jq '.[] | select(.body | contains("pulse:suspect-shipped")) | .id'`
and update it with `gh api -X PATCH "repos/<owner>/<repo>/issues/comments/<id>" -f body=…`. List the issue under "Close these?". A manual run closes it with `--reason completed` and the proof, once the owner confirms.

The partial-implementation gotcha below applies in full: if only part shipped, the verdict is "narrow the body", not "close".

### File mode

**Symptom:** Entry sits in `## P0`, `## P1`, etc. with no strikethrough. The work has actually shipped — usually as a squash-merge under a different SHA than the entry might naively predict.

**Why this happens:** Most repos use squash-merge for PRs. The entry's underlying work gets a fresh squash SHA, and the BACKLOG entry never gets updated because nothing links a PR to a paragraph. (Issues fix this at the root: `Closes #N` closes the item on merge. That is half the reason RFD 004 moved work into issues.)

**The check:**

1. Extract the entry's distinctive subject — the section heading is usually enough.
2. Pull the most distinctive 3-5 words. Avoid generic verbs (`Apply`, `Fix`, `Add`); favor the noun phrase (`Supabase migration blocked_brands`).
3. Run:
   ```bash
   git log master --oneline --grep="<distinctive phrase>" | head -10
   ```
4. If a commit subject matches the entry's intent, the entry is mis-flagged. Verdict: `already-shipped → strike + add merge commit ref`.

**Gotchas:**

- **Multiple matches:** if 3 commits match, read each via `git show <sha>` and pick the one whose changes most plausibly close the entry. Cite that SHA in the rewrite.
- **No match, but you suspect:** if grep finds nothing yet the entry mentions files (`mobile/src/foo.ts`), run `git log master -- mobile/src/foo.ts | head -20` and look for relevant commits.
- **Partial implementation:** an entry like "Add X with Y, Z, and W" might have been partially shipped (X and Y landed, Z and W didn't). Don't blanket-strike — surface as "Partial — X+Y shipped in <sha>, Z+W remain open" and propose splitting the entry.

---

## Shipped-from-orphan-branch

### Issue mode

**Symptom:** an issue was closed `completed` since the last run (the closed-issues list call), but no merged PR is in its timeline and no SHA reachable from the default branch is cited in its closing comment. A session closed it on the strength of a commit that never merged.

**The check:** `closedByPullRequestsReferences` is empty **and** the timeline has no merged cross-referencing PR **and** every SHA cited in the closing comment fails the file-mode `branch --contains` check below against `origin/<default>`.

**Verdict:** a comment with the evidence and an Artifact flag on a cron run; on a manual run, reopen with a history note (`rewrite-patterns.md`). An issue closed `not_planned` is a decision, not a claim of shipping, and is never flagged here.

### File mode

**Symptom:** Entry has strikethrough + a "LANDED" / "FIXED" marker, often with a cited SHA. But the SHA is on a stranded branch (e.g. `claude/<adjective>-<noun>-<hash>` from a prior session) that never merged to master.

**Why this happens:** A prior session wrote a fix, committed it on a session-scoped branch, recorded the SHA in the BACKLOG / regression log as proof of "shipped" — then the session ended and the branch was never pushed or never merged.

**The check:**

1. Extract the cited SHA. Look for 40-char or 7-char hex tokens.
2. Run:
   ```bash
   git branch --contains <sha> 2>&1
   ```
3. If `master` (or your project's default branch) appears in the output, the entry is **verified shipped**.
4. If only `claude/*` / `feat/*` / other non-default branches appear — the entry is **falsely shipped**. Verdict: `orphan-shipped → reopen entry + correct history note`.

**Gotchas:**

- **The SHA doesn't exist locally:** the orphan branch was deleted. Try `git fetch --all` first. If still nothing, the SHA is unverifiable — surface as "Cited SHA `<short>` is unreachable; cannot confirm shipped state."
- **The PR was merged but the cited SHA is the pre-merge branch tip:** common with squash merges. `git branch --contains <pre-merge-sha>` won't list master because the squash commit is a new SHA. Solution: also grep `git log master --oneline --grep="<entry subject>"` for the squash subject.

---

## Deferred-without-source

### Issue mode

**Symptom:** an open `P3` or `on hold` issue whose body has no reason: no *because* clause, no link to a decision doc or brief, no `Deferred until: <trigger>` line (the form a migrated `P4` takes), and, for `on hold`, no applying comment with a review-by date.

**The check:** the same scan as file mode below, over the issue body and, for `on hold`, the comment that applied the label. **Verdict:** Artifact flag; a manual run adds the rationale to the body.

### File mode

**Symptom:** Entry contains `parked` / `deferred to v2` / `out of scope` / `for later` / `dismissed` — but no reasoning, no link to a successor BACKLOG entry, no rationale paragraph.

**Why this matters:** A bare deferral is unactionable in v2 planning. Six months later, nobody can tell why it was parked.

**The check:**

1. For each deferral entry, scan the entry's body (everything between this `###` and the next).
2. Look for any of:
   - A "because" / "since" / "due to" / "this requires" clause
   - A markdown link to another BACKLOG entry: `[see ...](#anchor)`
   - A markdown link to a successor doc (`[backlog/<name>.md](...)`, `docs/briefs/<name>.md`) or to an issue (`#N`, `repo#N`)
   - A paragraph that contains a verb-form clause explaining the gating constraint (e.g. "needs merchant consent", "post-launch only", "depends on X partnership")
3. If none are present, the entry is **deferred-without-source**. Verdict: `propose adding a rationale paragraph`.

**Gotchas:**

- **The rationale lives in a memory file:** before flagging, grep the in-repo memory directory for the entry's subject:
  ```bash
  grep -rli "<entry subject>" memory/
  ```
  If a memory file documents the reason, the BACKLOG entry just needs a reference to it — not new reasoning.

---

## Stale file:line citations

**Issue mode:** run the algorithm below over each open issue body. A confirmed drift is fixed by **editing the body in place** (`gh issue edit N -R <repo> --body-file <file>`; GitHub keeps the edit history), plus **one** comment naming the old → new citation, so the change is visible to anyone watching the issue. This is the one body edit a cron run makes on its own: it changes no state, only a pointer. Read the body fresh right before editing, and change only the citation, so a human's concurrent edit isn't overwritten.

**File mode:**

**Symptom:** Entry cites a path like `mobile/src/screens/FitResultScreen.tsx:1055`, but the file has been refactored — the line number no longer points at the symbol the surrounding text implies.

**The check:**

1. Extract all `path:line` patterns from the doc.
2. For each path: verify the file exists (Glob).
3. For each `path:line`: Read the file at that offset (5 lines context). Compare the symbol the item's prose (issue body or BACKLOG entry) implies with the symbol actually there.
4. Mismatches:
   - **File moved / renamed:** `git log --follow --oneline -- <path>` shows the rename. Update the citation.
   - **Line drifted within file:** `git grep -n "<symbol>" -- <path>` to find the new line. Update.
   - **Symbol deleted:** surface as "Citation points at code that no longer exists. Either the item is itself stale, or the prose needs updating."

**Gotchas:**

- **Don't be over-eager about line drift.** ±5 lines usually still indicates the right place. Only surface large drifts.
- **Gitignored files (`android/`, `ios/`):** skip — line numbers there are inherently fragile.

---

## Still-pending-but-actually-live

**The other four failure modes all hunt in one direction — "claims done, isn't."
This one is the inverse, and nothing was looking for it: "claims pending, is
actually live."** Both are ghosts. The inverse one is worse in practice, because
it manufactures work: it puts steps in front of the user that are already done,
and it hides a shipped feature from prioritisation.

**Found in practice, 2026-08-11 (Alate).** A P1 entry read *"go-live wiring —
PENDING … the cron/Resend path is dark"* and listed four Vercel env/cron steps.
Every one of them was already satisfied and had been for about a month: the
trigger was a `pg_cron` job succeeding every 6 h, its secrets lived in Supabase
Vault rather than Vercel env, and the endpoint was returning HTTP 200. The pulse
had scanned that entry repeatedly and re-reported it as pending each time,
because *nothing in the honesty pass ever probed the live system for an entry
that claimed to be unfinished.* Worse, the stale steps pointed at the wrong
secret store, so following them would have changed nothing and looked like a
failure of the feature.

**The trigger.** Any entry whose remaining work is **external state** rather
than code: an env var, a secret, a cron job, a DB table or row, a deployed
endpoint, a DNS record, a registered runner, a dashboard setting. Signals:
`PENDING`, `user action`, `what's left`, `not live until`, `dark`, `needs
wiring`, `blocked on <console>`.

**The check — probe the system, do not re-read the entry.**

1. **Run the entry's own verification block.** The manual-runbook format
   mandates a `**Verify:**` section precisely so this is possible. *Execute it*
   rather than quoting it. If an entry has no runnable verify block, that is
   itself a finding — report it, because the entry is unfalsifiable.
2. **Probe the mechanism, not the config surface.** A dashboard showing a
   variable proves someone typed something; a 200 from the endpoint proves the
   whole chain. Prefer the deepest observable.
3. **Follow the actual data path before trusting the entry's description of
   it.** The 2026-08-11 case turned on the entry naming the wrong store — read
   the function/handler source to see where it *really* reads from.

Recipes, cheapest first:

```sql
-- Scheduled work: is it registered, active, and succeeding?
select jobid, schedule, command, active from cron.job;
select status, return_message, start_time from cron.job_run_details
  where jobid = <id> order by start_time desc limit 5;

-- What did the endpoint it calls actually return? (pg_net)
select status_code, left(content::text, 400), created
  from net._http_response order by created desc limit 10;

-- Does the feature have data to act on? Zero rows explains a zero-work run
-- WITHOUT proving the send/act path works.
select count(*) from public.<table>;

-- Where does the job really read its secrets? Read the source, don't assume.
select prosrc from pg_proc where proname = '<function>';
```

```bash
# Registered CI runners / infra by name — job history answers "is it alive"
# even when the org endpoint 403s.
gh api repos/<org>/<repo>/actions/runs/<id>/jobs --jq '.jobs[]|"\(.name) \(.runner_name)"'
gh repo list <org> --limit 30 --json name   # does the cited repo exist at all?
```

**Where the claim lives:** in issue mode, the body's "Done when" / `**Verify:**` block and any "what's left"; in file mode, the entry text. On a cron run, the probe output goes in a comment and "Done when" is narrowed in the body; closing waits for a manual run.

**Grading the result — three outcomes, not two:**

| Probe says | Entry becomes |
|---|---|
| Every claimed-pending step is satisfied | **Close it**, citing the probe output verbatim |
| Some satisfied, some genuinely outstanding | **Rewrite to only what is left** — and say what was verified done, so it is not re-listed next week |
| The path runs but has never done real work (0 rows, `sent: 0`) | **Stays open, narrowed** — "wired and running; the *N* path has never executed". Not proven live for users |

That third row is the one to get right. A cron returning `{"ok":true,"sent":0}`
proves the plumbing and proves nothing about the payload. Narrow the entry to
the real remaining test — usually an end-to-end round-trip with actual data —
rather than closing it or leaving the whole thing open.

**Cost control.** These are read-only and cheap, but do not probe every entry.
Probe only entries claiming *external* pending state — typically a handful per
run. Never mutate to test: no inserting a fake row, no sending a real email, no
flipping a setting. If proving it needs a write, that is a finding to hand the
user, not something to do unattended.

---

## Label hygiene (issue mode)

GitHub labels have no mutual exclusion, so the P scheme is enforced here and by the filing helper (`wi new`). Check every open issue in scope (except `device-test`) and every open `decision` PR:

| Finding | Rule | Cron action |
|---|---|---|
| **No P label, or more than one** | Every open work issue has exactly one of `P0`–`P3` | List it; propose one P with the reason |
| **Stale `P0`** | No activity (`updatedAt`) for 14 days on a blocker | List it: either it isn't a P0 or it is stuck |
| **`needs-input` > 14 days** | The question has gone unanswered | List it under "needs you", flagged |
| **`on hold` past its review-by date** | Read the date from the comment that applied the label | **Post a reminder comment**. Never close, never merge (`workflows.md` → "On hold") |
| **Dead `claimed`** | The claim's last touch is older than `wip`'s staleness window | Run `wip sweep` (it owns that label) |
| **`needs-input` on a `decision` PR** | Closing a decision PR is a valid answer, so it must not also carry `needs-input` | List it |
| **`decision` PR open > 14 days** | The owner hasn't answered | List it under "awaiting your yes/no", flagged |
| **Retired `BACKLOG.md` grew** | The pointer file has more than its one line | List it: the freeze guard missed a PR |

Only a manual run changes labels, with the owner.

## Cross-failure cases

Handle in this order:

1. **Citation-stale entries that are also already-shipped** → fix the shipped-claim rewrite; don't bother updating the citation (entry will be struck-through).
2. **Orphan-shipped entries with stale citations** → fix both: reopen the entry AND update the citation.
3. **Deferred-without-source items that defer to a successor that doesn't exist** (a future entry or issue nobody filed) → surface as a dependency: "Defers to X, but no open issue (or entry) X exists."
4. **Suspect-shipped issues with stale citations** → post the evidence comment; don't edit the citation (the issue is likely to close).

---

## MCP-tracked state

Some claims aren't verifiable from git alone.

### Supabase migrations

**Anti-trap:** the Supabase MCP's `list_migrations` only returns rows recorded in `supabase_migrations.schema_migrations`. Migrations applied via the SQL editor do NOT appear in this list — but the table they created IS live.

**The check:**

- `mcp__<supabase-project>__list_migrations` for the migration version.
- If absent: `mcp__<supabase-project>__list_tables --schemas '["public"]' --verbose` — if the table is present with expected columns/RLS/policies, treat the entry as **shipped**.

Precedent: AP#20 in the Alate project (regression log row #42, 2026-05-20).

### Vercel deployment state

`mcp__vercel__list_deployments --projectId <id>` filtered to `READY`, cross-referenced with the cited SHA.

### Sentry issue state

`mcp__sentry__search_issues` for the cited issue. `resolved` + not regressed in recent N days = verified-fixed.

---

## What "good source" looks like

| Weak (rejected) | Strong (use this) |
|---|---|
| "This shipped recently." | `Squash-merged in 2e517d6 ("fix: docked-card double hairline + auto-increment Android versionCode (#131)")` |
| "The table exists." | `Verified via list_tables 2026-05-22: public.blocked_brands present with RLS enabled and 'Service role only' policy.` |
| "The fix is on master." | `git branch --contains 74c88be lists master (verified 2026-05-23).` |
| "It was deferred for v2." | `Deferred to v2 because reading custom.material requires merchant-issued Storefront API tokens (see Build the Shopify merchant plugin entry below).` |
