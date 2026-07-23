# Shape Up Pitch template

Use for feature scoping: what to build, what to cut, how much time to spend.
~30 min to write. Answers "should we build this, and if so, what shape should it
take?"

Provenance: Ryan Singer, *Shape Up* (Basecamp/37signals, 2019). Designed for
teams of 1-3 people working in fixed-time, variable-scope cycles.

## The template

Create the file at `memory/decisions/pitch-NNN-<slug>.md`:

```markdown
# Pitch NNN: <Feature name>

**Date:** YYYY-MM-DD
**Status:** proposed | accepted | rejected (<reason>) | built (<PR link>)
**Appetite:** <time budget — e.g. "1 day", "3 days", "1 week">

## Problem

What pain or opportunity motivates this? Who feels it? What happens today
without this feature?

Ground it in a specific user story or observed behaviour, not an abstract
requirement. 3-5 sentences.

## Appetite

How much time is this worth? Not an estimate of how long it WILL take — a
budget for how long it SHOULD take. If it can't be done in this budget, the
scope needs cutting, not the timeline extending.

State the appetite and what it includes / excludes at that budget.

## Solution

What is the proposed approach? Describe the key elements — the screens, flows,
data changes, API changes. Use breadboard sketches (text-based flow diagrams)
or fat-marker sketches (rough layout descriptions), not pixel-perfect mockups.

Focus on the WHAT and WHY of the solution shape, not implementation detail.

## Prior Art

(Filled by the research phase — Step 2 of the plan skill)

How have other orgs solved this class of problem? What existing
libraries/frameworks address this? What pitfalls are documented?

Each finding cites its source URL.

### How others solve this
- **<Org/Source>** (<URL>): <summary of approach + outcome>

### Existing tools/libraries
- **<Tool>** (<URL>): <what it does, adoption signal, fit assessment>

### Known pitfalls
- **<Pitfall>** (source: <URL>): <what went wrong, how to avoid>

## Rabbit Holes

What looks simple but isn't? What areas could consume the entire appetite if
not explicitly bounded? Call them out so the builder knows to time-box or avoid.

- <Rabbit hole>: <why it's dangerous, how to bound it>

## No-gos

What are we explicitly NOT building in this cycle? What related features or
edge cases are out of scope?

- <No-go>: <why it's out>
```

## Conventions

- Appetite is a budget, not an estimate. "1 day" means "if this takes more than
  a day, descope — don't extend."
- Rabbit Holes are the most valuable section. They prevent the 80/20 trap (80%
  done in 20% of the time, then the last 20% takes 80%).
- No-gos prevent scope creep. They are explicit commitments to NOT do something
  this cycle.
- Status moves: proposed → accepted (building it) → built (PR link). Or
  proposed → rejected (one-line reason).
