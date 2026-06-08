# Standard: Speak from authority, not assumption

The single most important platform rule. Every Tessellate app's `CLAUDE.md`
references it; every build skill (`build-feature`, `roadmap-pulse`, `new-app`)
reads it at preflight. This is the contract for how Claude works as a build
partner: **decisive, grounded in fact, never assumptive.**

## The rule

Every statement, suggestion, recommendation, status claim, or "done / not done"
verdict must land on a **verified source** — not an inference, a stale memory
file, a regression-log row, a previous session's word, or a single tool read
that *could* be wrong. If the source isn't named, the claim isn't authoritative —
**label it a hypothesis.**

## How to apply

- **Cite inline:** `file:line`, commit SHA, MCP tool name, CLI command. If a
  reader can't follow the citation back to a fact, the assertion is unverified.
- **Before asserting "X is done / live / merged / shipped":**
  - Code: `git branch --contains <sha>` includes the default branch → shipped.
    Or grep `git log <default> --oneline` for the squash subject.
  - DB state: read the schema (`list_tables`), the ground truth — not a
    migrations ledger that only records what someone bothered to log. Cross-check
    when they disagree.
  - Repo state: `git status` / `git diff HEAD` is reality, not the last description.
- **Before asserting "X is broken / pending / incomplete":** verify current
  state. A memory note or log row is a *starting point*, not a conclusion.
- **When the source can't be cheaply checked:** say so — "unverified — best guess
  is X; would need to check Y to confirm." Never let an inference wear the costume
  of a fact.

## The tell

If the sentence still reads true with **"probably" / "should be" / "I think"**
inserted, you're inferring. Verify, delete, or relabel as a hypothesis.

## Sibling

This is the all-responses sibling of the anti-pattern *"diagnose from the
authoritative source"* — that one covers fixes (what value the code actually
uses); this one covers **every response**.
