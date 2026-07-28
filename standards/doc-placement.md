# Standard: Documentation Placement

Every Tessellate app's documentation follows one structure so readers (humans + Claude Code agents) find guidance consistently, and new docs land in the right place without scattering.

---

## The Rule

**Every Tessellate app must have a `PROJECT_DOCS.md` file at the repo root** that maps every documentation type to its location. This file is the single source of truth for:
- Where each kind of doc belongs (root, `docs/`, `memory/`, `backlog/`, subsystem directories)
- When each doc is updated and by whom
- When to create a new doc vs. add to an existing one
- How to trim shipped features to status + lesson (implementation details belong in git history, not persistent docs)

The structure must follow the template below, adapted to the specific project.

---

## Why

**Consistency**: Agents (and humans) know exactly where to look for rules, planning, processes, research, external setup. No more "where's the launch guide?" or docs scattered across 5 files.

**Efficiency**: New sessions don't re-discover the doc structure or re-invent consolidation. They read `PROJECT_DOCS.md` in the first 2 minutes and know the contract.

**Maintainability**: Shipped features are trimmed to status + lesson instead of keeping long implementation prose. Implementation lives in git history (PRs, commits); docs stay high-level.

**Precedent**: Applied successfully to alate, badige, loom, and mood-layer (2026-07-15). Agents documented doc placement in <30min per repo; humans found guidance immediately on next checkout.

---

## How to Apply

### 1. Create `PROJECT_DOCS.md` at repo root

Copy and adapt the template:

```markdown
# Project Documentation Guide

**Last updated:** YYYY-MM-DD

## 📍 Documentation Structure

### Root Level: Project Rules & Status
*Permanent, multi-session records.*

| File | Purpose | Audience | Update Frequency |
|---|---|---|---|
| **CLAUDE.md** | Working rules for Claude Code (communication, security, testing, branching) | Claude Code | When project rules change |
| **BACKLOG.md** | Out-of-scope work tracker (P0–P4 sections) | Product team | Weekly (if using roadmap-pulse) |
| **RELEASE_V2.md** | Feature completion tracker | Product team | When feature ships |
| ... (add others specific to your project) |

**When to add:** Only project-wide rules, decisions, or status that don't fit in git history or a PR description.

### `docs/`: Operational Guides & External Setup
*Runbooks, checklists, and external-platform configuration.*

| File | Purpose | Audience | Update |
|---|---|---|---|
| **LAUNCH_SEQUENCE.md** | Launch playbook (phases, gates, external setup) | Product + Ops | When launch strategy changes |
| **[DEPENDENCY_ALERTS.md](../../forge/standards/doc-placement.md)** | Dependabot + npm audit triage | Backend team | When alert arrives |
| ... |

**When to add:** External-platform steps, operational checklists, launch sequences, security procedures, setup guides.

### `memory/`: Project-Specific Knowledge
*Anti-patterns, design decisions, bug tracking — outlives individual PRs.*

| File | Purpose | Update |
|---|---|---|---|
| **project_regression_log.md** | Current bugs: symptom → root cause → fix → test → lesson | After each user-reported bug |
| **project_anti_patterns.md** | Project-specific guardrails | When recurring pattern emerges |
| **project_design_vision.md** | Design philosophy, locked decisions | When brand direction changes |
| ... |

**When to add:** Anti-patterns, design decisions, bug logs, recurring issues.

### `backlog/`: Out-of-Scope Features
*Parked features with detail — linked from `BACKLOG.md` entries.*

**When to add:** Feature specs for P2–P4 items.

### Module-Specific (backend/, mobile/ subdirectories)
*Setup, architecture, testing specific to that subsystem.*

**When to add:** Subsystem setup, API architecture, module testing.

---

## Quick Reference: Where Does X Go?

| Question | Answer |
|---|---|
| "This is a working rule for Claude Code" | → `CLAUDE.md` |
| "This is a bug + root cause + lesson" | → `memory/project_regression_log.md` |
| "This is a recurring pattern (3+ similar bugs)" | → `memory/project_anti_patterns.md` |
| "This is an external setup checklist" | → `docs/[SETUP_PLATFORM].md` |
| "This is a parked feature spec" | → `backlog/[feature].md` + link from `BACKLOG.md` |
| "This is a design decision (locked)" | → `memory/project_[topic].md` |

---

## Maintenance

**Every release:**
- [ ] Update feature status in root-level tracker (RELEASE_V2.md or equivalent)

**Every bug fix:**
- [ ] Add row to `memory/project_regression_log.md` (symptom → cause → fix → test → lesson)
- [ ] If pattern repeats 3+x, promote to `memory/project_anti_patterns.md`

**When docs are committed:**
- [ ] Verify they don't duplicate root-level or memory/ docs
- [ ] If shipping a feature, trim prose to status + link to PR
- [ ] If adding anti-pattern, keep it in anti-patterns.md, not scattered

---

## For Claude Code (AI Sessions)

When adding or updating any documentation:
1. **Check `PROJECT_DOCS.md` first** — does this doc type already have a home? If yes, update that file instead of creating a new one.
2. **Never create root-level .md files** unless they're project-wide decisions or rules (same tier as `BACKLOG.md`, `RELEASE_V2.md`).
3. **Trim shipped features to status + lesson** — implementation prose lives in git history, not persistent docs.
4. **Link across docs** — if a `memory/` file relates to a root rule, cross-link.
5. **Update this guide** if a new doc category emerges, so the next session knows.
```

### 2. Update `CLAUDE.md` to reference this standard

Add to your project's `CLAUDE.md` (typically in a "Documentation" section):

```markdown
## Documentation Structure — Reference

All docs follow [`PROJECT_DOCS.md`](./PROJECT_DOCS.md): a single guide mapping every 
documentation type to its location. Check it before creating or moving any doc. 
It reflects the forge platform standard [`forge/standards/doc-placement.md`](https://github.com/Tessellate-Studio/forge/blob/master/standards/doc-placement.md).
```

### 3. Consolidate existing scattered docs (one time)

If docs are scattered across multiple files, consolidate them following the `PROJECT_DOCS.md` guide:
- Launch docs (LAUNCH_PLAN.md + PLAY_CONSOLE_SETUP.md → `docs/LAUNCH_SEQUENCE.md`)
- Setup guides (scattered platform-specific steps → `docs/SETUP_*.md`)
- Shipped features with long prose → trim to status + lesson, move detail to git

---

## Enforcement

**Not enforced in CI** (narrative-only standard). Validation is a code review step:
- Before merging docs, check: does `PROJECT_DOCS.md` say this belongs here? If no, either update PROJECT_DOCS.md or move the doc.
- If a new doc category emerges, update PROJECT_DOCS.md so the next session knows.

---

## Examples

**Alate (2026-07-15):** https://github.com/Tessellate-Studio/alate/blob/master/PROJECT_DOCS.md

**Badige (2026-07-15):** https://github.com/Tessellate-Studio/badige/blob/master/PROJECT_DOCS.md

**Loom (Alate for Brands, 2026-07-15):** https://github.com/Tessellate-Studio/loom/blob/main/PROJECT_DOCS.md

**Mood Layer (2026-07-15):** https://github.com/Tessellate-Studio/mood-layer/blob/master/PROJECT_DOCS.md
