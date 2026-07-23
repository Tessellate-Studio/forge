# Sizing guide — which planning tier for this decision?

Read this at Step 1 of the plan skill. The tier determines the template, the
research depth, and the time investment.

## The decision tree

    Is this a bug fix with a known root cause?
      YES → skip planning, go to build-feature
      NO  → continue

    Does this change touch more than one repo,
    OR change a shared contract / API / data model,
    OR introduce a new system / service?
      YES → RFD (Request for Discussion)
      NO  → continue

    Does this change introduce a new user-facing feature,
    OR scope a multi-file change across a flow,
    OR require "what to build vs what to cut" decisions?
      YES → Pitch (Shape Up)
      NO  → continue

    Is there a genuine choice between alternatives
    (library A vs B, pattern X vs Y, approach 1 vs 2)?
      YES → ADR (Architecture Decision Record)
      NO  → skip planning, go to build-feature

## Signal matrix (for edge cases)

When the decision tree isn't clear-cut, score these five signals:

| Signal | Weight | ADR (1 pt) | Pitch (2 pts) | RFD (3 pts) |
|---|---|---|---|---|
| Files touched | 2x | 1-3 files | 4-15 files | 15+ or multi-repo |
| Blast radius | 2x | Single component | One user flow | Multiple systems |
| Reversibility | 1x | Easy revert | Medium (feature PR) | Hard (migration) |
| Cross-repo | 1x | None | Minimal | Yes |
| Duration uncertainty | 1x | Hours-to-day | Days-to-week | Weeks or unknowable |

Compute: sum(signal_score * weight). Thresholds:

- 5-8 → ADR
- 9-14 → Pitch
- 15+ → RFD

When the score is on a boundary (8-9 or 14-15), prefer the lighter tier. It's
cheaper to upgrade a Pitch to an RFD mid-draft than to write an unnecessary RFD.

## Override rules

- The user explicitly names a tier → use that tier, regardless of the matrix.
- Data model migration (CREATE TABLE, ALTER TABLE, new Supabase migration) →
  minimum tier is Pitch, even if it's a single file.
- New dependency that's hard to remove (ORM, state library, auth provider) →
  minimum tier is ADR.
- Exploratory question ("should we even do this?") → Pitch. The appetite
  section forces the "is this worth the time?" question.

## When to skip planning entirely

- Pure copy/content updates
- Dependency bumps (unless major version with breaking changes)
- Config changes with no design decision
- Bug fixes where the root cause is already known
- The user explicitly says "skip planning" or "just build it"

When skipping, state: "Skipping planning — <reason>. Proceeding directly to
build." One line, not a paragraph.
