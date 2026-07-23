# Research protocol — structured web search for planning decisions

This protocol runs during Step 2 of the plan skill. It uses WebSearch and
WebFetch to ground planning decisions in real-world evidence rather than
ad-hoc suggestions.

## When research runs

- **RFD tier:** ALWAYS. Architecture decisions without prior art research are
  guesswork.
- **Pitch tier:** ALWAYS. Feature scoping benefits from knowing how others
  solved the problem and what pitfalls exist.
- **ADR tier:** ONLY when the decision involves a library/framework choice or a
  pattern with multiple viable approaches. Skip for tactical decisions where the
  answer is well-understood.

## The search sequence

Run searches in this order. Each round narrows based on what the prior round
found.

### Round 1 — Problem-space search

Goal: understand how the problem class is solved in practice.

Search queries (adapt to the specific decision):
- "<problem domain> architecture" or "<problem domain> design"
- "<problem domain> best practices <year>"
- "how <known-good-org> handles <problem domain>"

Example for "RLS vs middleware for row-level access control":
- "row level security vs middleware authorization"
- "Supabase RLS best practices 2025"
- "how Stripe handles multi-tenant data isolation"

### Round 2 — Solution-space search

Goal: find existing tools, libraries, or frameworks that already solve this.

Search queries:
- "<proposed solution> vs <alternative> comparison"
- "<proposed solution> pitfalls" or "<proposed solution> gotchas"
- "<proposed solution> post-mortem" or "<proposed solution> failure"

### Round 3 — Validation search (RFD only)

Goal: find post-mortems, failure reports, or scale concerns.

Search queries:
- "<proposed approach> at scale"
- "<proposed approach> migration challenges"
- "regret <proposed technology>" or "moving away from <technology>"

## Source quality tiers

Not all search results are equal. Rate each source:

| Tier | Examples | Use as |
|---|---|---|
| **Authoritative** | Official docs, published RFCs, peer-reviewed papers, post-mortems from the org that built the tool | Primary evidence — cite directly |
| **Practitioner** | Engineering blog posts from named orgs (Stripe, Spotify, Netflix, Vercel, etc.), conference talks with real production data | Supporting evidence — cite with org name |
| **Community** | Stack Overflow answers, Reddit discussions, personal blog posts | Context only — note as "community consensus", not as authority |
| **Marketing** | Vendor comparison pages, "10 best X" listicles | Ignore unless nothing else exists; note bias |

## How to present findings

In the planning doc's "Prior Art" section, structure findings as three
subsections:

### How others solve this
- **<Org/Source>** (<URL>): <1-2 sentence summary of their approach and
  outcome>. <Relevant to our case because...>

### Existing tools/libraries
- **<Tool name>** (<URL>): <what it does, adoption signal (GitHub stars, npm
  downloads, last commit date)>. <Fits because... / Doesn't fit because...>

### Known pitfalls
- **<Pitfall>** (source: <URL>): <what went wrong and why>. <How to avoid in
  our design.>

## Constraints

- **Time caps:** 15 minutes for Pitch, 30 minutes for RFD. If the search is not
  converging, note "research inconclusive on X" and move on.
- **Source citation is mandatory.** Per the authoritative-claims standard:
  unsourced research is a hypothesis, not prior art.
- **Intellectual honesty:** do not use research to justify a predetermined
  conclusion. Present what you found, including evidence against the proposed
  approach.
- **No results is a valid finding.** "No prior art found for X" is more honest
  than fabricating a citation.
- **Fallback:** if WebSearch is not available, note "Research skipped — WebSearch
  tool unavailable" in the Prior Art section. The planning doc is still valuable
  without research; research is additive.
