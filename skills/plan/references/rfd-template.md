# RFD template — Request for Discussion

Use for architecture and design decisions: new systems, major refactors,
cross-repo changes, data model redesigns. ~1-2 hours to write. Answers "how
should we build this system?"

Provenance: Oxide Computer Company (Bryan Cantrill). 500+ RFDs produced in
under 5 years. Starts as "a collaborative extension of an engineer's notebook."

## The template

Create the file at `memory/decisions/rfd-NNN-<slug>.md`:

```markdown
# RFD NNN: <Title>

**Date:** YYYY-MM-DD
**State:** prediscussion | discussion | published | committed | abandoned
**Author:** <who>

## Background

Why does this RFD exist? What's the current state of the system? What problem
or opportunity created the need for this design?

Enough context that a reader unfamiliar with the codebase understands the
starting point. 1-3 paragraphs.

## Prior Art

(Filled by the research phase — Step 2 of the plan skill)

How have other engineering orgs approached this class of problem? What existing
systems, papers, or frameworks are relevant? What post-mortems document failure
modes?

Each finding cites its source URL. Distinguish "they did X and it worked" from
"they did X and it failed because Y."

### How others solve this
- **<Org/Source>** (<URL>): <summary of approach + outcome>

### Existing tools/libraries
- **<Tool>** (<URL>): <what it does, adoption signal, fit assessment>

### Known pitfalls
- **<Pitfall>** (source: <URL>): <what went wrong, how to avoid>

## Proposal

The design. This is the core of the RFD.

Structure by subsystem or concern. Use diagrams (text-based — ASCII or mermaid)
where they clarify. Cover:

- **Data model:** what tables/types/schemas change or are created
- **API surface:** what endpoints/contracts change or are created
- **Control flow:** how requests/events move through the system
- **Security model:** auth, RLS, data access boundaries
- **Migration path:** how to get from current state to proposed state without
  breaking running systems

## Alternatives Considered

What other approaches were evaluated and why were they rejected?

For each alternative: 2-3 sentences on what it is, 2-3 sentences on why it
lost. This section is the most durable — it prevents future engineers from
re-proposing a rejected path.

## Implementation Plan

Ordered list of steps to implement the proposal. Each step is a shippable unit
(a PR or a deploy). Include:

1. <Step>: <what it does, what it touches, estimated effort>
2. ...

## Open Questions

Unresolved issues that need input before the RFD can move to "committed" state.
Each question names who can answer it.

- [ ] <Question> — needs input from <who>
```

## State machine

- **prediscussion** — author is still drafting, not ready for feedback.
- **discussion** — ready for feedback. In the solo-founder + AI workflow, this
  is "thinking out loud with Claude" — the AI reviews the proposal for gaps.
- **published** — discussion complete, design agreed-on.
- **committed** — implementation has begun. Changes to the design require a new
  RFD or an amendment section.
- **abandoned** — RFD written but work never started or was superseded. State
  why in a one-line note.

## Conventions

- Alternatives Considered is mandatory. An RFD without alternatives is a rubber
  stamp, not a design process.
- The Implementation Plan must be ordered by dependency (what must ship first)
  and each step must be independently shippable.
- Open Questions block the move from "discussion" to "published". All must be
  resolved (answered or explicitly deferred to implementation).
- In the solo-founder workflow, states can move quickly — prediscussion →
  discussion → published → committed can happen in a single session. The states
  exist for the DOCUMENT's lifecycle, not for a multi-week review process.
