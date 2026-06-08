# Scoring contract — how roadmap-pulse talks to rubric-sdk (Step 4)

This file is the contract roadmap-pulse expects from `@ramsaptami/rubric-sdk`. The SDK is on its own evolution track (Track B) — that track should evolve to meet this contract, not the other way around.

## Table of contents

1. [Input shape (what the skill hands to the SDK)](#input-shape)
2. [Output shape (what the SDK returns)](#output-shape)
3. [Dimension rubrics (what each 0-3 score means)](#dimension-rubrics)
4. [Score adjustments (the skill's overlays on top of SDK output)](#score-adjustments)
5. [Failure modes + fallbacks](#failure-modes--fallbacks)
6. [Invocation via `scripts/invoke_rubric.sh`](#invocation)

---

## Input shape

The skill composes ONE input object per open task:

```json
{
  "title": "Set up email aliases on tessellate.co.in",
  "description": "Truncated to 500 chars. The first paragraph of the BACKLOG entry's body — what the task is, why it matters, the gate it unblocks.",
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

- `title` is the entry's section heading verbatim.
- `description` is truncated to 500 chars — first paragraph is usually enough; the skill should pick the densest paragraph if the first is fluff.
- `context.goals` is the list from Step 2 (user-confirmed).
- `context.dependencies.this_task_depends_on` is the confirmed dependencies that this task is waiting on. Empty = ready to start.
- `context.dependencies.this_task_unblocks` is the confirmed dependencies where OTHER tasks are waiting on THIS task. Many = high dependency-unblock value.

---

## Output shape

The skill expects this back from the SDK:

```json
{
  "impact": 3,
  "complexity": 2,
  "reusability": 1,
  "strategic": 3,
  "total": 9,
  "band": "Must",
  "reasoning": {
    "impact": "Directly unblocks acquisition channels (Reddit) + compliance email handle.",
    "complexity": "Domain registrar email-forwarding setup is 1-2 hours; not low (would be 3) because the user has to configure Google Workspace or Zoho.",
    "reusability": "Aliases are project-specific; some reuse for future Tessellate-domain projects.",
    "strategic": "Critical-path for closed beta acquisition; aligned with the Step 2 goal of 'gates loom'."
  }
}
```

**Conventions:**

- Each axis is a strict integer 0-3.
- `total` = sum of the 4 axes (0-12 range).
- `band` is one of `Must` (9-12), `Nice` (6-8), `Low` (3-5), `Reject` (0-2).
- `reasoning` is a per-axis short prose justification. The skill cites this in the final report — without reasoning, scores aren't actionable.

---

## Dimension rubrics

For when the user (or you, in dev mode) is scoring a task manually because the SDK is unavailable or you're checking the SDK's work.

### Impact (0-3)

- **0** — Trivia / cosmetic only. No user-visible value, no business impact.
- **1** — Marginal improvement. A few users benefit; quality-of-life work.
- **2** — Meaningful improvement to a real user pain or a real business metric (acquisition, retention, support load).
- **3** — Critical-path: unblocks acquisition, prevents user loss, addresses an active legal / compliance gap, or removes a major friction point.

### Complexity / Cost (0-3) — **inverse scoring** (lower complexity = higher score)

- **0** — Multi-week, multi-component, requires research or external partnerships.
- **1** — 1-2 weeks of focused work; touches multiple systems.
- **2** — Few days; touches one system; well-understood.
- **3** — Hours, single-file change OR straightforward config / doc update.

### Reusability (0-3)

- **0** — One-shot. Doesn't apply to future projects or other features.
- **1** — Some reuse — pattern applies elsewhere but isn't a building block.
- **2** — Generalizable component or pattern. Future features will lean on it.
- **3** — Infrastructure-grade. Becomes a foundation other features build on top of.

### Strategic Fit (0-3)

- **0** — Doesn't align with current goals. Speculative or off-roadmap.
- **1** — Tangentially relevant. Nice-to-have for someday.
- **2** — Supports a current focus area but isn't on the critical path.
- **3** — On the critical path for a Step 2 goal. Directly enables a gate the project is currently optimizing for.

---

## Score adjustments

The SDK returns a raw score. The skill applies two overlays on top:

1. **Goal-alignment bonus**: `+1 total` if this task's title or description appears in the Step 2 goal-aligned list. Capped at 12. This bumps a Nice-to-have (6-8) into the Must band (9-12) when the goal is specifically about this task.

2. **Dependency-unblock bonus**: `+1 total` if the task has ≥1 entry in `context.dependencies.this_task_unblocks`. Capped at 12. Tasks that gate other open tasks are higher leverage than equally-scored leaf tasks.

These are **additive** — a task that's BOTH goal-aligned AND a dependency-unblocker gets +2 total (capped at 12).

Document the bonus in the final report so the user sees the math: `Score: 7 (raw) + 1 (goal: closed beta) + 1 (unblocks Reddit + BrandIntegration) = 9 → Must band`.

---

## Failure modes + fallbacks

The rubric-sdk is experimental (v1.0.0, 2 commits, no npm release at time of writing). The skill should fail gracefully when the SDK does:

| Failure | Fallback |
|---|---|
| SDK CLI not installed | Skip scoring for this run; surface in the report as "rubric-sdk not installed — `npm install -g @ramsaptami/rubric-sdk` then re-run." Continue with un-scored prioritization (Step 2 goal-alignment + Step 3 dependency graph still produces a useful ranking). |
| SDK returns malformed JSON | Score that task as `null`; surface in the report as "scoring failed for task X (SDK error)". Don't fail the whole run. |
| SDK takes longer than 30s per task | Time out; treat as malformed-JSON case. |
| SDK CLI requires interactive input the skill can't provide | Try the programmatic API path first (`scripts/invoke_rubric.sh --programmatic`). If that fails too, fall back to skip-and-surface. |

The skill is useful even without scoring — Step 2 + Step 3 alone produce a defensible weekly priority list. Scoring is the icing.

---

## Invocation

The wrapper [`scripts/invoke_rubric.sh`](../scripts/invoke_rubric.sh) takes the input JSON on stdin and returns the output JSON on stdout. Usage from inside the skill:

```bash
echo '<input json>' | bash scripts/invoke_rubric.sh
```

The wrapper tries the CLI first, falls back to the programmatic API, and surfaces a structured error if both fail. The skill should batch invocations sensibly — one per task, sequential (not parallel — the SDK isn't tested for concurrency yet).

For high-task-count weeks (>20 open tasks), the skill MAY skip scoring for tasks whose Step 2 + Step 3 ranking already places them outside the top 15 — those won't make the top-10 list anyway, so the SDK's per-axis reasoning isn't needed for them.
