# Rewrite patterns — how to fix each Step 1 failure mode, by doc type

Use these as templates. Match the doc's existing house style — don't introduce a new format because a template here looked cleaner. Read the surrounding entries first so the rewrite blends in.

## Table of contents

1. [BACKLOG.md rewrites](#backlog-md-rewrites)
2. [Regression log rewrites](#regression-log-rewrites)
3. [Anti-pattern memory rewrites](#anti-pattern-memory-rewrites)
4. [General markdown planning doc](#general-markdown-planning-doc)

---

## BACKLOG.md rewrites

### Already-shipped → strike + tombstone

**Before** (entry sits under `## P1`, no strikethrough):

```markdown
### Apply the Supabase migration for `blocked_brands`
**Path:** `backend/supabase/migrations/blocked_brands.sql`

Migration file exists but hasn't been applied. Until applied,
`/api/brand-optout` returns 500 and the scraper's blocklist check
fails open (no-op).
```

**After:**

```markdown
### ~~Apply the Supabase migration for `blocked_brands`~~ — ALREADY APPLIED, verified <date>
**Path:** `backend/supabase/migrations/blocked_brands.sql`

Verified live on project `alate` (`<project-id>`) via MCP
`list_tables`: `public.blocked_brands` exists with the expected
columns, RLS enabled, "Service role only" policy active.

Provenance note: the project's `supabase_migrations` table only
tracks one row, so `list_migrations` did not surface this one.
Trust `list_tables` over `list_migrations` when verifying applied
state on this project.
```

### Orphan-shipped → reopen with history note

**Before:**

```markdown
### ~~Share-intent route fails where direct paste succeeds (Armani)~~ — LANDED <date>
Fix commit: `b9269e4` on branch `claude/<adjective>-<noun>-<hash>`.
```

**After:**

```markdown
### Share-intent route fails where direct paste succeeds (Armani) — reopened, fix needs porting

**Status:** the fix exists as commit `b9269e4` on the orphan branch
`claude/<adjective>-<noun>-<hash>` but `git branch --contains b9269e4`
does NOT list `master`. The fix was prematurely marked LANDED.

**To close this for real:** cherry-pick `b9269e4` onto a fresh
`fix/share-intent-normalise` branch off master, run jest, open a PR.
Update this entry with the new merge SHA on completion.
```

### Deferred-without-source → add rationale

**After (add a `Why this exists in BACKLOG` block):**

```markdown
### Build the Shopify merchant plugin
Longer-term play. Not a launch blocker.

**Why this exists in BACKLOG (rationale added <date>):**

The merchant plugin is the consent path for reading brand metadata
that the public storefront pages don't expose. Specific use cases:

- Brand-defined material / fabric metafields — canonical example is
  Oshin Sarin's `custom.material` per-product metafield.
- Brand-uploaded size charts + fit notes — public Shopify JSON gives
  availability per variant but NOT brand-uploaded fit metadata.

Anything that needs brand metadata which is NOT on the public
storefront pages eventually routes through here.
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

For docs that aren't BACKLOG / regression log / anti-pattern, match the doc's existing structure:

- Strikethrough convention → use it.
- Status badges (`[DONE]`, `[OPEN]`) → use them.
- Tables → edit rows in place.
- Checklists (`- [ ]` / `- [x]`) → flip the box and add a sourced note.

Default if no convention: strikethrough + `— LANDED <date>` marker.

---

## Cross-doc consistency

If a rewrite in BACKLOG.md changes the status of an item that's also referenced in the regression log, **update both atomically**. Same for anti-pattern references. A roadmap-pulse run should leave the corpus internally consistent.

The regression log + domain anti-patterns live in-repo under `<repo-root>/memory/`, so edits to them are normal in-repo doc changes (same PR/commit as the planning-doc rewrites). The shared cross-app guardrails live in `forge/standards/` and are changed via a forge PR, not here.
