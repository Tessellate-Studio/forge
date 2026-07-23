# ADR template — Architecture Decision Record

Use for tactical decisions: which library to use, which API pattern, which data
model shape, how to wire a specific integration. ~5 min to write; answers one
focused question.

Provenance: Michael Nygard (2011). Adopted by Spotify, GitHub, eBay;
ThoughtWorks Technology Radar "Adopt" since 2017.

## The template

Create the file at `memory/decisions/adr-NNN-<slug>.md`:

```markdown
# ADR NNN: <Title — imperative mood>

**Date:** YYYY-MM-DD
**Status:** accepted | superseded by <type>-NNN
**Deciders:** <who participated>

## Context

What is the issue that motivates this decision? What forces are at play
(technical, business, timeline)?

2-4 sentences. Not a novel — just enough that a reader 6 months from now
understands why this came up.

## Decision

What is the change that we're proposing and/or doing?

State it as an imperative: "We will use X" / "We will adopt pattern Y" /
"We will not use Z because...". One paragraph.

## Consequences

What becomes easier or harder as a result of this decision?

- **Positive:** <what this enables>
- **Negative:** <what this costs or constrains>
- **Neutral:** <downstream effects that are neither good nor bad>
```

## Conventions

- Title is imperative-mood: "Use RLS not middleware", "Adopt Zustand for client
  state", "Pin expo-updates to SDK 53".
- Status starts as "accepted" for ADR — no review gate; the decision is the act
  of writing it. Changes to "superseded by <type>-NNN" if a later decision
  replaces it.
- Keep the total under 30 lines of prose. If it needs more, it's probably a
  Pitch or RFD.
