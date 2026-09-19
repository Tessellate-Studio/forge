# Scoring contract — how roadmap-pulse talks to rubric-sdk (Step 4)

This file is the contract roadmap-pulse expects from `@tessellate-studio/rubric-sdk`. The SDK is on its own evolution track (Track B) — that track should evolve to meet this contract, not the other way around.

## Framework

**RICE** — Intercom's prioritisation framework (38% adoption per 2024 Delibr PM
survey; used by Intercom, Miro, GoFundMe).

Formula: **Score = (Reach × Impact × Confidence) / Effort**

## Table of contents

1. [Input shape (what the skill hands to the SDK)](#input-shape)
   - [Where the inputs come from](#where-the-inputs-come-from)
2. [Output shape (what the SDK returns)](#output-shape)
3. [Axis definitions (what each value means)](#axis-definitions)
4. [Score overlays (the skill's adjustments on top of SDK output)](#score-overlays)
5. [Failure modes + fallbacks](#failure-modes--fallbacks)
6. [Invocation via `scripts/invoke_rubric.sh`](#invocation)

---

## Input shape

The skill composes ONE input object per open task:

```json
{
  "title": "Set up email aliases on tessellate.co.in",
  "description": "Truncated to 500 chars. The issue body's ### What section — what the task is, why it matters, the gate it unblocks.",
  "context": {
    "goals": [
      "Closed beta live — acquisition gates loom",
      "Privacy policy published; data-deletion email must resolve"
    ],
    "dependencies": {
      "this_task_depends_on": [],
      "this_task_unblocks": [
        "Reddit launch plan (needs contact email)",
        "Get in touch on BrandIntegration page"
      ]
    }
  }
}
```

**Conventions:**

- `title` is the **issue title** verbatim.
- `description` is the issue body's `### What` section, else the first 500 characters of the body. Truncated to 500 chars either way.
- `context.goals` is the list from Step 2 (user-confirmed).
- `context.dependencies.this_task_depends_on` is the confirmed dependencies that this task is waiting on. Empty = ready to start.
- `context.dependencies.this_task_unblocks` is the confirmed dependencies where OTHER tasks are waiting on THIS task. Many = high dependency-unblock value.

### Where the inputs come from

Priority lives in the P labels, by the owner's decision (RFD 004). RICE is
advisory: it ranks items within and across the P bands, and it can justify a
*proposed* P change. It never overrules the label.

| Input | Source | Why here |
|---|---|---|
| Reach, Effort | The issue body's `### Reach` / `### Effort (person-days)` sections, **when a human filled them** (any answer but `unknown`). Otherwise the rubric's heuristic, as today | These are the two axes a human knows better than a keyword heuristic, and the form's dropdowns keep them on this contract's scale. When used, recompute `rice_score` with them and say "from the issue" in `reasoning` |
| Impact, Confidence | rubric `evaluateFromContext` (contract unchanged) | The heuristic is what exists. *Proposed, not built:* pass the type label and the "Why / evidence" section into `context`, so a bug with a Sentry id or a repro can earn Confidence 1.0 |
| Goals overlay | Step 2 (RELEASE_V2 + owner overrides) | Unchanged |
| Dependency-unblock overlay | `blocking.totalCount ≥ 1` (native link) | Replaced the parsed BACKLOG `Depends on:` lines (RFD 004) |
| Reusability overlay | Unchanged keyword rule | |
| P label | **Band floor and tie-break** (below) | P is the owner's decision; RICE only proposes |


---

## Output shape

The skill expects this back from the SDK:

```json
{
  "reach": 100,
  "impact": 2,
  "confidence": 0.8,
  "effort": 2,
  "rice_score": 80,
  "reasoning": {
    "reach": "2 high-reach keyword matches (production, launch); unblocks 2 other tasks.",
    "impact": "1 high-impact + 0 medium-impact keyword matches; 2 goal-string overlap; unblocks 2 other tasks.",
    "confidence": "Goals provided; description length 132 (specific).",
    "effort": "0 high-effort + 0 low-effort keyword matches; description length 132; depends on 0 other tasks."
  }
}
```

**Conventions:**

- `reach` is one of: 1 (just me/testing), 10 (early testers), 100 (all current users), 1000 (future users at scale).
- `impact` is one of: 0.25 (minimal), 0.5 (low), 1 (medium), 2 (high), 3 (massive).
- `confidence` is one of: 0.5 (guess), 0.8 (qualitative signal), 1.0 (measured/tested).
- `effort` is person-days: 0.5, 1, 2, 3, 5, 10, or 20.
- `rice_score` = `(reach * impact * confidence) / effort`, rounded to 2 decimal places.
- `reasoning` is a per-axis short prose justification. The skill cites this in the final report — without reasoning, scores aren't actionable.

---

## Axis definitions

### Reach — how many users/events does this touch?

| Value | Meaning | Examples |
|---|---|---|
| **1** | Just me / testing / internal tooling | CI config, debugging aid, admin panel |
| **10** | Early testers / small cohort | Beta tester feature, niche flow |
| **100** | All current users | App-wide change, onboarding, core flow |
| **1000** | Future users at scale | Infrastructure, launch-gating, acquisition |

### Impact — how much does it move the needle per person reached?

| Value | Meaning | Examples |
|---|---|---|
| **0.25** | Minimal — barely noticeable | Subtle visual polish |
| **0.5** | Low — marginal improvement | Minor UX smoothing |
| **1** | Medium — meaningful improvement to a real pain | Quality-of-life fix |
| **2** | High — significant value or friction removal | Feature that removes a support driver |
| **3** | Massive — critical-path or compliance | Launch blocker, legal/security gate |

### Confidence — how validated is the estimate?

| Value | Meaning | What you have |
|---|---|---|
| **0.5** | Guess — "I think this is right" | No data, no user signal, hunch |
| **0.8** | Qualitative signal — "users complained about this" | Bug reports, user feedback, support tickets |
| **1.0** | Measured — "I have data" | Analytics, A/B test, reproduction steps |

### Effort — how much work in person-days?

| Value | Meaning |
|---|---|
| **0.5** | Minutes to an hour. Config, copy, one-liner. |
| **1** | A focused morning or afternoon. |
| **2** | A full day's work. |
| **3** | Two focused days. |
| **5** | A working week. |
| **10** | Two weeks. Multiple systems, research needed. |
| **20** | A month+. Major architecture, external dependencies. |

---

## Score overlays

The SDK returns a raw RICE score. The skill applies three multiplier overlays:

1. **Reusability bonus** — if the task produces a reusable component/pattern
   (keywords: infrastructure, library, sdk, shared, plugin, middleware, etc.),
   multiply RICE score by **1.2×**. This captures the value the old Reusability
   axis provided.

2. **Strategic Fit bonus** — if this task appears in the Step 2 goal-aligned
   list, multiply RICE score by **1.2×**. This captures the value the old
   Strategic Fit axis provided.

3. **Dependency-unblock bonus** — if this task has ≥1 entry in
   `context.dependencies.this_task_unblocks`, multiply RICE score by **1.1×**.
   Tasks that gate other open tasks are higher leverage.

These are **multiplicative** — a task that's both reusable AND goal-aligned AND
a dependency-unblocker gets `score × 1.2 × 1.2 × 1.1 = score × 1.584`.

Document the overlay in the final report so the user sees the math:
`RICE: 80 (raw) × 1.2 (reusable: shared library) × 1.2 (goal: closed beta) × 1.1 (unblocks 2 tasks) = 126.7`

### Prioritisation

Sort all tasks by adjusted RICE score descending. Take the top 5-10 for the
weekly priority list. No fixed band thresholds — RICE scores vary widely by
context, so relative ranking within the current open work is more useful than
absolute buckets.

For the Artifact's Band column and Step 5.5's "Must" test, map to bands by
percentile:
- **Must** — top 20% of scored items
- **Nice** — next 30%
- **Low** — next 30%
- **Reject** — bottom 20%

### The P-band floor

After sorting by adjusted score, apply the owner's P labels:

1. **Floor:** an item never ranks below one that is two or more P levels lower.
   A `P0` never ranks below a `P2` or `P3`; a `P1` never below a `P3`.
   Adjacent bands (`P0` vs `P1`) are ordered by score alone, which is where
   RICE earns its keep. A pairwise comparator cannot express this (it is not
   transitive: P2 > P1 by score, P1 > P0 by score, P0 > P2 by floor), so apply
   it as two lifts over the score order:
   1. Take the `P0` items in score order. Move each one up to just above the
      highest-ranked `P2`/`P3` item that currently sits above it, if any.
   2. Then do the same for the `P1` items against `P3` items.

   Each lift only moves an item up past lower-band items, so it never breaks a
   floor already satisfied, and items keep their score order within a band.
2. **Tie-break:** equal adjusted scores order by P, highest first.
3. **`on hold`** items rank after every non-held item, whatever their score.
4. An item with no P label (or several) is ranked as `P2` provisionally and
   listed in the label-hygiene section.
5. **Proposed P change:** a `P2`/`P3` that lands in the top 20% of raw
   adjusted scores, or a `P0`/`P1` in the bottom 20%, is listed with its
   score and reasoning as a proposal. Only a manual run changes the label, and
   only on the owner's yes.

Percentile bands are computed on the final (floored) order.

### Scores are not written to issues

No score labels (they explode the label list and can't hold numbers), no
per-issue scorecard comments (dozens of notifications a week), no Projects
fields (they need the `project` token scope, which the cron token lacks).
Every score goes in the roadmap Artifact's embedded
`<script type="application/json" id="roadmap-pulse-scores">` block, which the
next run reads back (`digest-format.md`).

---

## Failure modes + fallbacks

The rubric-sdk is experimental (v2.0.0). The skill should fail gracefully:

| Failure | Fallback |
|---|---|
| SDK CLI not installed | Skip scoring; surface "rubric-sdk not installed" in report. Continue with un-scored prioritisation (Step 2 goal-alignment + Step 3 dependency graph still produces a useful ranking). |
| SDK returns malformed JSON | Score that task as `null`; surface "scoring failed for task X" in report. Don't fail the whole run. |
| SDK takes longer than 30s per task | Time out; treat as malformed-JSON case. |
| SDK CLI requires interactive input | Try programmatic API first. If that fails too, fall back to skip-and-surface. |

The skill is useful even without scoring — Step 2 + Step 3 alone produce a defensible weekly priority list.

---

## Invocation

The wrapper [`scripts/invoke_rubric.sh`](../scripts/invoke_rubric.sh) takes the input JSON on stdin and returns the output JSON on stdout. Usage:

```bash
echo '<input json>' | bash scripts/invoke_rubric.sh
```

The wrapper tries the CLI first, falls back to the programmatic API, and surfaces a structured error if both fail. Batch invocations: one per task, sequential.

For high-task-count weeks (>20 open tasks), skip scoring for tasks whose Step 2 + Step 3 ranking already places them outside the top 15.
