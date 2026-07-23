---
name: plan
description: >-
  Three-tiered planning framework for architecture and feature decisions —
  auto-detects the right tier based on blast radius and reversibility, then
  runs a structured web-research phase before drafting. ADR for tactical
  decisions (which library, API pattern, data model — ~5 min). Shape Up
  Pitch for feature scoping (what to build, what to cut, time appetite —
  ~30 min). RFD for architecture/design (new system, major refactor,
  cross-repo change — ~1-2 hours). Planning docs persist at
  memory/decisions/ as type-prefixed numbered files (adr-001-...,
  pitch-002-..., rfd-003-...) that become persistent context for future
  sessions. Use whenever the user asks to "plan", "write an ADR", "pitch
  this feature", "write an RFD", "should we use X or Y?", "how should we
  architect this?", "design this system", "what's the right approach for
  X?", or before building any non-trivial feature. Also auto-triggers from
  build-feature Step 0 for feature/architecture changes.
---

# Plan — research-backed decisions before building

## Why this skill exists

The expensive failure mode is building without deciding. A library choice that
gets revisited mid-build. A feature scope that balloons because nobody said
"no-go" up front. An architecture that gets reworked after three PRs land.

Planning is the cheapest phase; rework is the most expensive. This skill makes
planning a 5-minute-to-2-hour ritual backed by real-world research — not a
verbal handwave that evaporates between sessions. The output is a persistent
markdown artifact in the repo that gives Claude (and the user) context in every
future session.

## Framework provenance

These aren't invented — they're adopted from organisations that use them at
scale:

| Tier | Framework | Used by | Source |
|---|---|---|---|
| **ADR** | Architecture Decision Record | Spotify, GitHub, eBay, ThoughtWorks ("Adopt" since 2017) | Michael Nygard, 2011 |
| **Pitch** | Shape Up Pitch | Basecamp/37signals, widely adopted by small product teams | Ryan Singer, *Shape Up*, 2019 |
| **RFD** | Request for Discussion | Oxide Computer Company (500+ RFDs in <5 years) | Bryan Cantrill, Oxide |

---

## Step 0 — Preflight

1. **Read the platform standards.** Before any planning, read:
   `${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md` and
   `${CLAUDE_PLUGIN_ROOT}/standards/authoritative-claims.md`.
2. **Read the sizing guide:**
   `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/sizing-guide.md`.
3. **Scan existing decisions.** Check `memory/decisions/` in the project repo
   for related decision docs. Read any whose titles overlap with the current
   ask — they may already answer the question, or the new decision may need to
   supersede one.

## Step 1 — Size the decision (auto-detect tier)

Run the decision tree from the sizing guide. Evaluate five signals:

| Signal | ADR | Pitch | RFD |
|---|---|---|---|
| Files touched | 1-3 | 4-15 | 15+ or multi-repo |
| Blast radius | Single component | One user flow | Multiple systems |
| Reversibility | Easy revert | Medium (feature PR) | Hard (migration) |
| Cross-repo impact | None | Minimal | Yes |
| Duration uncertainty | Hours-to-day | Days-to-week | Weeks or unknowable |

State the chosen tier and why in one line. The user can override.

**If the user explicitly names a tier** ("write an ADR", "pitch this", "write an
RFD"), use that tier regardless of the matrix.

**Skip planning entirely** for pure bug fixes with known root causes, copy
updates, dep bumps, or config changes. State: "Skipping planning — <reason>."

## Step 2 — Research phase

Read the research protocol:
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/research-protocol.md`.

**When research runs:**
- **RFD:** always.
- **Pitch:** always.
- **ADR:** only when the decision involves a library/framework choice or a
  pattern with multiple viable approaches.

**Three search rounds** (via `WebSearch` + `WebFetch`):

1. **Problem-space** — how top engineering orgs solved this class of problem.
   Target queries: "<problem> architecture", "how <known-org> handles <problem>".
2. **Solution-space** — existing libraries, trade-offs, pitfalls. Target:
   "<solution A> vs <solution B>", "<tool> pitfalls", "<tool> post-mortem".
3. **Validation** (RFD only) — scale concerns, migration challenges, "regret
   <technology>" or "moving away from <technology>".

**Source quality tiers:** Authoritative (docs, RFCs, papers) > Practitioner
(named eng blogs with production data) > Community (context only) > Marketing
(ignore). Every finding cites a URL per the authoritative-claims standard.

**Time caps:** 15 minutes for Pitch, 30 minutes for RFD.

**Fallback:** if WebSearch is unavailable, note "Research skipped — WebSearch
tool unavailable" in the Prior Art section and proceed.

## Step 3 — Draft the planning doc

1. **Determine the next number.** Scan `memory/decisions/` for files matching
   the current tier's prefix:
   - ADR: `adr-NNN-*.md` — find the highest NNN, add 1.
   - Pitch: `pitch-NNN-*.md` — find the highest NNN, add 1.
   - RFD: `rfd-NNN-*.md` — find the highest NNN, add 1.
   If no files exist for that tier, start at 001. Zero-pad to 3 digits.

2. **Generate the slug.** Take the decision title, lowercase it, replace spaces
   and non-alphanumeric characters with dashes, collapse consecutive dashes,
   truncate to 50 characters, trim trailing dashes.

3. **Create `memory/decisions/`** if it does not exist.

4. **Create the file** using the appropriate template from `references/`:
   - ADR: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/adr-template.md`
   - Pitch: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/pitch-template.md`
   - RFD: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/rfd-template.md`

5. **Fill in all sections.** If research was conducted (Step 2), populate the
   "Prior Art" section with sourced findings. If no research, state "No research
   conducted — tactical decision."

## Step 4 — Review with the user and commit

### ADR (tactical)
Quick confirmation: "Here's the ADR — anything to add?" One round. If confirmed,
mark status as "accepted".

### Pitch (feature scope)
Surface key trade-offs and ask for sign-off on:
- The problem statement — are we solving the right thing?
- The appetite — is the time budget right?
- The no-gos — are these acceptable cuts?
- The proposed solution — does the approach make sense?

### RFD (architecture)
Surface key trade-offs and ask for sign-off on:
- The problem statement and background
- The alternatives — did we evaluate the right options?
- The proposed design — are there gaps?
- Open questions — who needs to answer what?

### Commit
1. Commit the planning doc separately from any code:
   `docs: add decision <type>-NNN-<slug>`.
2. If this was triggered from `build-feature`, the doc reference carries
   forward into Step 1 (acceptance criteria): "per decision <type>-NNN".
3. If this supersedes a prior decision, update the prior doc's status:
   "superseded by <type>-NNN-<new-slug>" and add the link.

---

## What this skill does NOT do

- Does not require committee review. The "review" is the user confirming the
  draft in Step 4.
- Does not block builds. If the user says "just build it", skip planning with
  a one-line note.
- Does not enforce a multi-week RFC timeline. All three tiers can complete in a
  single session.
- Does not create planning docs for trivial changes.
- Does not search the web for ADR-tier decisions unless they involve a
  library/framework choice.

## When NOT to use this skill

- The change is a pure bug fix with a known root cause → `build-feature`.
- The change is a copy/content update with no structural decision.
- The user explicitly says "skip planning" or "just build it".
- The decision has already been made and documented in `memory/decisions/`.

---

## Quick reference

- Sizing guide: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/sizing-guide.md`
- ADR template: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/adr-template.md`
- Pitch template: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/pitch-template.md`
- RFD template: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/rfd-template.md`
- Research protocol: `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/research-protocol.md`
- Authoritative-claims standard: `${CLAUDE_PLUGIN_ROOT}/standards/authoritative-claims.md`
- Anti-patterns: `${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md`
