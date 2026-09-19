# Rewrite patterns — how to fix each Step 1 failure mode, by doc type

Use these as templates. Match the doc's existing house style — don't introduce a new format because a template here looked cleaner. Read the surrounding entries first so the rewrite blends in.

## Table of contents

1. [Issue rewrites](#issue-rewrites)
2. [Regression log rewrites](#regression-log-rewrites)
3. [Anti-pattern memory rewrites](#anti-pattern-memory-rewrites)
4. [General markdown planning doc](#general-markdown-planning-doc)

(The BACKLOG.md templates were removed with the file mode in RFD 004 step 6.
Work items are issues; a closed issue is its own tombstone.)

---

## Issue rewrites

An issue has two surfaces, and each has one job: the **body** says what is true
**now** (edited in place; GitHub keeps the edit history), and **comments** say
what happened (append-only, one per event). A rewrite either corrects the body
or records an event, never both in one place.

Every comment the pulse writes starts with a hidden marker, so a later run can
find its own comment and **edit it instead of posting another**. Re-posting
the same evidence every Sunday is notification noise that teaches people to
mute the issue.

Nothing here is ever deleted. "Strike-through, don't delete" became "close
with a reason, never delete".

### Suspect shipped → evidence comment (cron and manual)

```markdown
<!-- pulse:suspect-shipped -->
**This may already be shipped** (roadmap pulse, <date>).

- Merged PR: #<n> "<title>" (merged <date>), which <what it changed that matches this issue>.
- Default branch: `git branch -r --contains <sha>` lists `origin/<default>`.

If that covers everything under "Done when", this can close. If part is still
open, say which, and the body will be narrowed to it.
```

On a later run, edit this comment's evidence and date. Don't post a second one.

### Close with a reason (manual run, owner confirmed)

```bash
gh issue close <n> -R <owner>/<repo> --reason completed \
  --comment "Shipped in #<pr> (<sha7>, on <default> per `git branch -r --contains <sha7>`). Confirmed by <owner> in the <date> roadmap pulse."
```

For "won't do": `--reason not_planned` with the decision and where it was made
(a decision PR, a conversation date). The body stays as it is. A closed issue
is its own tombstone.

### Narrow the body (partly done, or still pending but partly live)

Edit the body so it says only what is left, and keep one line recording what
was verified done, so the item isn't re-listed next week:

```markdown
### Done when
- [ ] Round-trip with a real order: email received for a restocked item.

Verified done <date>: the pg_cron job runs every 6 h and the endpoint returns 200
(probe output in the comment of <date>). The send path has never executed
with real data (`sent: 0`), which is what's left.
```

Post one comment with the probe output that justified the narrowing.

### Stale citation → body edit + one comment

Edit only the citation in the body (read the body fresh first, so a human's
concurrent edit survives), then comment:

```markdown
<!-- pulse:citation -->
Updated a stale citation in the body: `mobile/src/screens/FitResultScreen.tsx:1055`
→ `mobile/src/screens/fit/FitResult.tsx:412` (file moved in #<n>; symbol
`renderRangeWarning`).
```

### Orphan-shipped → reopen with a history note (manual run)

```bash
gh issue reopen <n> -R <owner>/<repo> --comment "Reopened: closed as shipped on <date>, but the cited fix `<sha7>` is only on `<branch>` — `git branch -r --contains <sha7>` does not list origin/<default>. To close it for real: port `<sha7>` to a fresh branch off <default> and merge a PR that says Closes #<n>."
```

### Deferred without a source → add the rationale (manual run)

Add a `### Why this is deferred` section (or a `Deferred until: <trigger>`
line) to the body, with the reason and its source: the decision doc, the
conversation date, the dependency. The cron run only flags it.

### On hold past its review-by date → reminder comment (cron)

```markdown
<!-- pulse:hold-expired -->
**On hold past its review-by date** (<date> in the comment of <date>). Still
not now? Re-apply the hold with a new date. Otherwise remove `on hold`, or
close it with a reason. (Nothing is closed automatically.)
```

---

## Regression log rewrites

The regression log is a single markdown table — every row uses the same column order. Rewrites must stay inside that schema.

### Orphan-shipped row → correct date + add history note in Lesson column

Append the orphan-history note to the `Lesson / anti-pattern` column inside **bold** so a scanner notices it. Update the `Date` column to the real merge date.

### Watch entry for recurring patterns

After updating multiple rows for the same underlying issue, add a row to the doc's `## Recurring categories` section:

```markdown
- **Fix-logged-as-shipped-from-orphan-branch** — rows 34, 35 (both on `claude/<branch>`, dated <date>, both untrue at the time). Only 2 so far — **watch**; promote to an anti-pattern if a third appears.
```

---

## Anti-pattern memory rewrites

Preserve numbering. NEVER renumber a referenced AP — outgoing references break silently. Strike-through superseded APs and point at successor:

```markdown
## ~~14. Don't trust env-var values raw~~ — superseded by AP#20

This rule is fully subsumed by AP#20. New precedents go to AP#20.
```

---

## General markdown planning doc

For docs that aren't issues, the regression log or anti-patterns (e.g. `RELEASE_V2.md`, `USER_PATHS.md`), match the doc's existing structure:

- Strikethrough convention → use it.
- Status badges (`[DONE]`, `[OPEN]`) → use them.
- Tables → edit rows in place.
- Checklists (`- [ ]` / `- [x]`) → flip the box and add a sourced note.

Default if no convention: strikethrough + `— LANDED <date>` marker.

> **Before collapsing a shipped section, apply the two carve-outs** in
> `standards/workflows.md` → "Docs stay lean". Shipped-ness alone is not
> grounds to collapse:
> 1. **Keep what no diff can give back** — a rejected alternative and why it
>    lost, an investigation that corrected a false belief, external research.
>    The PR link goes to a diff that never contained it.
> 2. **Never collapse test artefacts** — coverage maps, user-path audits, E2E
>    contracts, regression tables. A shipped fix there keeps its full
>    `Was` / `Now` split; both halves are the test.
>
> When in doubt, keep the lines next to the tombstone and say so in the run
> notes. Over-collapsing is unrecoverable; over-keeping costs a few lines.

---

## Cross-doc consistency

If a rewrite changes the status of an item that's also referenced in the regression log (an issue closed or narrowed), **update both in the same run**: the regression-log row in the repo's doc PR, and the issue's comment citing that PR. Same for anti-pattern references. A roadmap-pulse run should leave the corpus internally consistent.

The regression log + domain anti-patterns live in-repo under `<repo-root>/memory/`, so edits to them are normal in-repo doc changes (one PR/commit per repo for the doc rewrites of a run). The shared cross-app guardrails live in `forge/standards/` and are changed via a forge PR, not here.
