# Dependency inference — detection + confirmation + persistence (Step 3)

Tasks depend on other tasks. Email-setup blocks Reddit-posts (Reddit needs a working contact email). Privacy-policy-v3.2 blocked the closed-beta launch. Knowing the dependency graph changes prioritization significantly — a task that gates 3 other open tasks deserves a bigger bump than an equally-impactful leaf task.

This file documents how Step 3 spots dependencies, surfaces them for confirmation, and persists confirmed ones into BACKLOG entries so future runs read them directly instead of re-inferring.

## Detection — content signals

For each open task, scan the entry body for these signals indicating a dependency on another open task:

### High-confidence signals

- **Direct title reference**: the entry mentions another open task by its section heading (full or near-full match).
  - Example: an entry mentions "the Build the Shopify merchant plugin entry" — that's a HIGH-confidence dependency on that task.
- **Markdown link to another section in the same doc**: `[see ...](#anchor-name)` where the anchor matches another open task's heading.
- **Explicit dependency phrasing**: "depends on", "blocked by", "requires", "needs", followed by a recognisable task name.
  - Example: "Requires the merchant plugin to ship first."

### Medium-confidence signals

- **Shared file reference**: two open tasks both reference the same `mobile/src/foo.ts` and the prose suggests one task's work modifies the other's expected behaviour.
  - Example: Task A says "extend FitResultScreen.tsx to handle X"; Task B says "FitResultScreen.tsx render path needs Y reworked first."
- **Shared external system**: two tasks both touch the same Supabase table, the same Vercel function, the same Shopify Storefront API key.
- **Implicit prerequisite**: one task's success criteria is the other task's deliverable. Example: "Reddit launch posts" implies a working contact email which is itself a separate task.

### Low-confidence signals

- Tasks in the same `### subsection` or under the same `## Priority` heading — proximity alone is too weak unless backed by content.
- Tasks created within the same week (date proximity).

Don't surface low-confidence inferences in the confirmation pass; they cost user attention for too little payoff.

---

## Confirmation flow

When at least one high or medium signal fires for a task, surface the inference for user confirmation. **Cluster all inferences across all open tasks into ONE batch question** — don't ask 10 separate questions across a long conversation.

Format the confirmation as a single table:

```
## Dependency suggestions (from this run's content scan)

| # | This task | Depends on | Signal | Confidence |
|---|---|---|---|---|
| 1 | Reddit launch posts | Set up email aliases on tessellate.co.in | "needs contact email" in body | High |
| 2 | Get in touch on BrandIntegration | Set up email aliases | shared contact-email infrastructure | Medium |
| 3 | Demand capture v2 — social share | Demand capture v1 — silent tracking | mentioned "v1 ships" as gate | High |

Confirm which to persist:
  [a] Confirm all
  [b] Confirm 1 and 3 only
  [c] Reject all
  [d] Mix — tell me which numbers
```

For each user confirmation: persist the dependency into the dependent task's BACKLOG entry (see persistence below).

For each user rejection: log it to `<repo-root>/.roadmap-pulse-state.json` with a 4-week cooldown so the skill won't re-suggest the same dependency for 4 weeks. Users get fatigued if the same false-positive surfaces every week.

---

## Persistence format

A confirmed dependency goes into the dependent task's BACKLOG entry as a new line directly under the section heading:

**Before:**

```markdown
### Reddit launch posts
Status: draft 2026-05-06. No subs posted to yet.
```

**After:**

```markdown
### Reddit launch posts
**Depends on:** [Set up email aliases on tessellate.co.in](#set-up-email-aliases-on-the-tessellatecoin-domain) (persisted 2026-05-23)

Status: draft 2026-05-06. No subs posted to yet.
```

**Conventions:**

- `**Depends on:**` is the keyword for confirmed dependencies. Future runs read this directly — no re-inference needed.
- Use a markdown link to the depended-on task's heading anchor. The anchor is the heading lowercased, spaces and special chars replaced with `-`.
- Annotate with the persistence date `(persisted YYYY-MM-DD)` so future readers know when this was set.
- Multiple dependencies: multiple lines, each with its own link.

For dependencies inferred in AUTONOMOUS (cron) runs where no user is available to confirm:

- HIGH-confidence: persist as `**Suggested dependency:**` (note: SUGGESTED, not DEPENDS). Marker for the user to review next manual run.
- MEDIUM-confidence: don't persist automatically. Surface in the weekly digest's "needs confirmation" section so the user sees it on Monday.

---

## Reading persisted dependencies

When roadmap-pulse runs, before doing inference:

1. Read each open task's entry body.
2. Look for `**Depends on:** ...` lines — these are pre-confirmed. Skip inference for these.
3. Look for `**Suggested dependency:** ...` lines — these are pending confirmation from a prior autonomous run. Surface in the confirmation table with confidence = "Previously suggested".

The persisted lines become Step 3's primary input. New inference only fires for tasks where no `Depends on:` / `Suggested dependency:` line exists yet, OR when the task's content has changed materially since the last persistence date (heuristic: any commit modified this section since `(persisted YYYY-MM-DD)`).

---

## The dependency graph in Step 4 scoring

Once dependencies are confirmed, Step 4 uses them in two ways:

1. **`context.dependencies.this_task_depends_on`** is set from the entry's `**Depends on:**` lines.
2. **`context.dependencies.this_task_unblocks`** is computed: for each task T, find all other tasks U whose `**Depends on:**` lines reference T. That list goes into T's context.

The dependency-unblock bonus (+1 to total) fires when `this_task_unblocks` has ≥1 entry. A task that gates 3 other tasks doesn't get +3 — the bonus is binary, to keep the math simple. If the user wants finer-grained, the skill can be iterated later.

---

## Cycle detection

Theoretical risk: A depends on B, B depends on A. In practice, with confirmed dependencies this is unlikely (the user wouldn't confirm both directions). The skill still checks:

- After persisting confirmed dependencies, build the directed graph.
- Detect cycles via DFS.
- If a cycle exists: surface it as "Dependency cycle detected: A → B → A. One of these confirmations is probably wrong. Resolve before next run."
- The skill does NOT auto-fix; it surfaces for human decision.
