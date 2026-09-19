# Dependency inference — detection + confirmation + persistence (Step 3)

Tasks depend on other tasks. Email-setup blocks Reddit-posts (Reddit needs a working contact email). Privacy-policy-v3.2 blocked the closed-beta launch. Knowing the dependency graph changes prioritization significantly — a task that gates 3 other open tasks deserves a bigger bump than an equally-impactful leaf task.

This file documents how Step 3 reads the confirmed graph, spots the missing edges, surfaces them for confirmation, and persists confirmed ones so future runs read them directly instead of re-inferring.

The graph is GitHub's native issue dependencies and sub-issues. (The `**Depends on:**` lines of BACKLOG entries were retired with the file mode in RFD 004 step 6.)

## The confirmed graph (read this first)

The open-issue list call already returns it:

- `blockedBy` / `blocking` — native "blocked by / blocking" links (GA 2025-08-21). They work **across repos**, with up to 50 per relationship type. These are the confirmed dependencies; nothing else needs to be read.
- `parent` / `subIssuesSummary` — sub-issues (≤100 per parent, cross-repo). A parent is **not** a dependency of its children; it is a rollup (see "Parent/child" below).

An issue with ≥1 native link is **not re-inferred**, unless its body changed after the link was created (compare `updatedAt` of the body edit, via the timeline, with the link's creation event).


## Detection — content signals

For each open item without a confirmed edge, scan its title and body for these signals of a dependency on another open item:

### High-confidence signals

- **An issue reference next to dependency phrasing**: `#N`, `repo#N` or an issue URL within a few words of "depends on", "blocked by", "after", "requires", "needs", "waiting on". Example: "Needs loom#171 to land first."
- **Direct title reference**: the item mentions another open item by its title (full or near-full match).
  - Example: an issue mentions "the Build the Shopify merchant plugin issue" — that's a HIGH-confidence dependency on that task.
- **Explicit dependency phrasing**: "depends on", "blocked by", "requires", "needs", followed by a recognisable task name.
  - Example: "Requires the merchant plugin to ship first."

### Medium-confidence signals

- **Shared file reference**: two open tasks both reference the same `mobile/src/foo.ts` and the prose suggests one task's work modifies the other's expected behaviour.
  - Example: Task A says "extend FitResultScreen.tsx to handle X"; Task B says "FitResultScreen.tsx render path needs Y reworked first."
- **Shared external system**: two tasks both touch the same Supabase table, the same Vercel function, the same Shopify Storefront API key.
- **Implicit prerequisite**: one task's success criteria is the other task's deliverable. Example: "Reddit launch posts" implies a working contact email which is itself a separate task.

### Low-confidence signals

- Tasks with the same P label or area label — proximity alone is too weak unless backed by content.
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

For each user confirmation: persist it (see persistence below).

For each user rejection: log it to `<repo-root>/.roadmap-pulse-state.json` with a 4-week cooldown so the skill won't re-suggest the same dependency for 4 weeks. Users get fatigued if the same false-positive surfaces every week.

---

## Persistence

**Manual runs only.** A confirmed dependency becomes a native link on the dependent issue:

```bash
gh issue edit <dependent-number> -R <owner>/<dependent-repo> --add-blocked-by <blocker-issue-url>
```

Use the blocker's full URL so cross-repo links resolve. That is the whole record: no body line, no marker, no comment. The next run reads it back from `blockedBy`.

**Cron runs persist nothing to issues.** There is no user to confirm, and a write that nobody asked for is exactly what the unattended-run guardrail forbids. High-confidence suggestions go in the Artifact's **"Needs confirmation"** section (`digest-format.md`), with the content match that triggered each. Medium-confidence ones go there too, below a divider. The `**Suggested dependency:**` marker is not used for issues: it needed a file to live in.

---

## The dependency graph in Step 4 scoring

Once dependencies are confirmed, Step 4 uses them in two ways:

1. **`context.dependencies.this_task_depends_on`** is the item's open blockers: `blockedBy` nodes that are still open.
2. **`context.dependencies.this_task_unblocks`** is the open items waiting on it: `blocking` nodes.

The dependency-unblock bonus (×1.1) fires when `this_task_unblocks` has ≥1 entry. A task that gates 3 other tasks doesn't get +3 — the bonus is binary, to keep the math simple. If the user wants finer-grained, the skill can be iterated later.

---

## Parent/child

Sub-issues give a second signal:

- A **parent** is scored as the rollup of its **open** children: its Reach and Impact are the maximum over them, its Effort is their sum, and it is listed with "(N open sub-issues)". Children are scored in their own right too.
- Only **leaf** issues (no open sub-issues) are auto-build candidates in Step 5.5. Building a parent means building several things at once.
- A parent whose children are all closed while it is still open is an "already shipped?" candidate for Step 1.

## Cycle detection

Theoretical risk: A depends on B, B depends on A. In practice, with confirmed dependencies this is unlikely (the user wouldn't confirm both directions). The skill still checks:

- After persisting confirmed dependencies, build the directed graph from every edge: native links and this run's confirmations.
- Detect cycles via DFS.
- If a cycle exists: surface it as "Dependency cycle detected: A → B → A. One of these confirmations is probably wrong. Resolve before next run."
- The skill does NOT auto-fix; it surfaces for human decision.
