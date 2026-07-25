# RFD 001: Multi-Agent Workflow System for Forge

**Date:** 2026-07-23
**State:** committed
**Author:** Saptami Ram (with Claude)

## Background

Every forge skill runs as a single agent. When `build-feature` needs research,
testing, implementation, review, AND device verification, one context window
does all five. Three costs follow: context bloat (research pages, test output,
and review notes all compete in one window); no adversarial separation (the
"reviewer" already wrote the code it's reviewing, so it rationalizes rather than
refutes); and no parallelism (independent work runs serially).

Claude Code already provides the primitives — custom agent types, the `Workflow`
tool with `agent()` / `parallel()` / `pipeline()` / `phase()`, and worktree
isolation — but forge used none of them. This RFD introduces a multi-agent
system that separates the build into specialized agents that cross-validate each
other, coordinated by deterministic workflow scripts, and wires it into the
existing skills with graceful single-agent fallback.

Sized as an RFD (not a Pitch) because it introduces a new system with cross-repo
impact: forge defines it, and every repo that installs the forge plugin consumes
it.

## Prior Art

Research ran via the plan skill's own protocol (this RFD dogfoods it). The
sharpest open question was E2E gate positioning, once build minutes stopped being
a constraint (move to Oracle CI).

### How others solve this
- **Google Testing Blog — "Just Say No to More End-to-End Tests"**
  (https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html):
  70/20/10 unit/integration/E2E pyramid. E2E inflate runtime + flakiness, so they
  run separately (nightly / parallel), NOT serially blocking every commit.
  Google/Meta trunk-based dev has no feature-branch E2E at all — coverage moves
  post-merge with bisection + feature flags. Authoritative.
- **Shape Up / ADR / RFD provenance** (already adopted in the `plan` skill):
  agent roles mirror the separation these frameworks assume between deciding,
  building, and reviewing.

### Existing tools/libraries
- **Claude Code Workflow tool** (built-in): `agent()`, `parallel()`,
  `pipeline()`, `phase()`, schema-validated structured returns, worktree
  isolation. The system is built entirely on these — no external orchestration
  dependency.
- **Merge-queue tooling — Aviator / Graphite / Trunk.io**
  (https://www.aviator.co/blog/impact-of-flaky-test-in-merge-queue/): the
  required-vs-informational split — required set = unit/type/lint/security;
  informational set = E2E/visual/perf, run post-merge. Practitioner.

### Known pitfalls
- **Flaky E2E as a required gate** (source: Aviator, above): a test that fails 5%
  of the time becomes a pipeline-stopping event once it gates merges — it blocks
  good PRs and, in a merge queue, halts everyone. Avoid by keeping the full suite
  informational/post-merge.
- **Smoke/full conflation** (source: E2E strategy guides, e.g.
  https://getautonoma.com/blog/e2e-testing-strategy-ai-teams): running the full
  20-40 min suite pre-merge destroys feedback speed. Avoid by carving a <10 min
  critical-path smoke subset for the pre-merge gate and running the full suite
  post-merge.

## Proposal

### Agent roles (5)

Read-only vs write boundaries enforce separation. All Sonnet — workers do
bounded tasks; Opus stays on the main-loop supervisor.

| Role | Tools | Separation |
|---|---|---|
| researcher | Read/Glob/Grep/WebSearch/WebFetch | read-only; also the RFD cross-repo blast-radius map |
| tester | Read/Glob/Grep/Edit/Write/Bash | tests ONLY; never sees implementation |
| implementer | all tools | worktree isolation; commits its own code |
| reviewer | Read/Glob/Grep/Bash | read-only — can only report, not rationalize |
| verifier | Read/Bash/Browser | read-only; on-device measurement, numbers not vibes |

Charters live in `references/agents/*-prompt.md` (plugin-shipped, so available in
every consuming repo; also usable directly by skills via the Agent tool).

### Workflow scripts (2)

- **`researched-build(tier)`** — full pipeline. Tier-branched: research (2 rounds
  pitch / 3 rfd) → [rfd] cross-repo blast-radius → failing tests → implement
  (worktree) → review (single reviewer pitch; multi-lens panel + skeptic
  verification rfd) with fix loop → device verify (UI only) with fix loop.
- **`adversarial-review`** — standalone quality gate. Parallel reviewers per lens
  → dedup by file+line+category → independent skeptics refute each finding →
  only survivors of a skeptical majority are reported.

Scripts live in `references/workflows/*.js`, invoked via the Workflow tool's
`scriptPath`. The **script is the supervisor** (deterministic JS) — no separate
supervisor agent spends tokens on orchestration.

### Communication model

Agents return structured JSON via the `schema` option; the script routes one
agent's output into the next's prompt. No handoff files — the git repo is the
shared state (reviewer reads the diff the implementer committed). The Workflow
sandbox can't read files at runtime, so agent prompts are mirrored from the
`.md` charters into the scripts.

### E2E gate positioning (research-backed)

- **Pre-merge (blocking):** testID contract check (reviewer) + optional litmus
  `@smoke` subset (<10 min).
- **Post-merge on master (advisory):** full litmus suite; red → regression log +
  implementer fix PR + bisect. Does not block.
- **Scheduled:** existing litmus nightly regression.

### What stays in the main loop

Acceptance-criteria confirmation, worktree→branch integration + push, the
separate doc/status commit, PR creation (opens ready per merge-on-green — no user
gate), CI + E2E trigger/poll, merge, and the retro. These need user interaction,
git plumbing across the worktree boundary, or full session context.

## Alternatives Considered

- **Handoff files for agent communication.** Agents write structured markdown/JSON
  to a shared dir; the next agent reads it. Rejected: adds moving parts and failure
  modes that schema-validated returns already handle, and the git repo already
  serves as durable shared state. Three fewer things to break.
- **A dedicated supervisor agent.** A coordinator agent that decides what runs
  next. Rejected: orchestration should be deterministic, not a token-spending LLM
  decision. The workflow script is the supervisor.
- **`.claude/agents/` + `.claude/workflows/` per repo.** The native home for agent
  types and saved workflows. Rejected: those directories are per-repo, NOT shipped
  by the plugin — forge couldn't distribute them to consuming repos. Reference
  files under the plugin + `scriptPath` invocation solve the portability.
- **Full E2E as a pre-merge blocking gate.** Rejected on research: even
  unlimited-scale orgs don't block merges on full E2E (flakiness + feedback
  speed). Cost was never the deciding factor.
- **Opus for worker agents.** Rejected: workers do bounded, well-scoped tasks
  where Sonnet excels; Opus is reserved for the supervising main loop.

## Implementation Plan

1. **Agent charters** — `references/agents/{researcher,tester,implementer,reviewer,verifier}-prompt.md`. (done — a769a25)
2. **Workflow scripts** — `references/workflows/{researched-build,adversarial-review}.js`; exclude from forge eslint/prettier as runtime payload. (done — 6cada38)
3. **Skill integration** — build-feature (Steps 1.5 / 5.5 / 5.7 / 6.5), plan (Step 2), CLAUDE.base.md, version 0.3.0 → 0.4.0. (done — bbf051a)
4. **This RFD** — persist the decision. (this commit)

## Amendment — first live run (2026-07-23)

`adversarial-review` ran for the first time, reviewing this RFD's own merged
diff (f3ce2d5). The machinery worked (20 agents, 0 errors, skeptics filtered
8 raw findings → 5 confirmed) — but **it reviewed the wrong repo.** The `args`
payload reached the script as a JSON string, so `input.diff` / `criteria` /
`crossRepo` all read undefined; reviewers received an empty DIFF section and
silently improvised by reviewing the diff in their working directory (the alate
session repo). Every confirmed finding was about alate's CI migration, none
about the target.

Lessons folded back into the scripts (fix/workflow-target-hardening):

1. **Fail loudly on a missing target.** Both scripts now normalize stringified
   args and return a structured error instead of running target-less. A silent
   wrong-target review is the worst failure mode — it produces confident
   findings about the wrong code.
2. **Diff by file, with a manifest.** `adversarial-review` now accepts
   `diffPath` (reviewers Read the exact bytes; no re-encoding corruption) and
   `files` (a target manifest reviewers must verify before judging — mismatch
   returns a "target-mismatch" blocker instead of an improvised review).
3. **Doc/code drift fixed.** This RFD claimed `researched-build` reuses
   `adversarial-review` as a nested sub-workflow; the merged code inlined a
   duplicate panel instead. Now real: the skill passes `reviewScriptPath` and
   the RFD review phase calls `workflow({scriptPath})`, with the inline panel
   kept as fallback. The dead `standards` parameter is now consumed.
4. **Calibration honesty:** the run caught none of the three defects a manual
   re-read found (the drift above, the dead parameter, diff-transport
   fragility) — because the broken input path severed it from the target. The
   manual pass and the live failure were complementary, not redundant.

## Open Questions

- [ ] **Tester → implementer test handoff across worktrees.** `isolation: 'worktree'`
  spawns a fresh worktree per agent, so the tester and implementer don't share one.
  Current design: tester returns test file contents via schema; implementer
  materializes them in its worktree, confirms they fail, then implements. Confirm
  this holds in a real run vs. a shared build-worktree approach — needs input from
  the first live `researched-build` execution.
- [ ] **Worktree branch integration mechanics.** Cleanest way to bring the
  implementer's committed worktree branch onto the feature branch (cherry-pick /
  merge / rebase) — TBD against how Claude Code exposes the worktree ref.
- [ ] **litmus `@smoke` tag.** The pre-merge smoke subset assumes a litmus
  critical-golden-path job that doesn't exist yet. Deferred to a follow-up litmus
  PR — until then the full suite runs post-merge only.
