# ADR-004 — Enforcing reviewer/implementer tool separation in forge workflows

**Status:** accepted — approved via this PR (merge = approve, close = reject)
**Date:** 2026-09-18 · **Tier:** ADR (tactical, reversible, forge plus consumer repos)
**Source:** [RFD-001](./rfd-001-multi-agent-workflow.md), Open Questions, "Real tool-level separation" (unchecked, marked "Needs a decision")

## Context

RFD-001's adversarial-review design depends on the reviewer and skeptic agents
being unable to edit code. Amendment 2 (finding 6) established that this is
**enforced by prompt text only**. No `agent()` call in
`references/workflows/*.js` passes a tool restriction. The option set is
label, phase, schema and isolation. The "Tools: Read, Glob, Grep ..." lines in
the researcher prompts (`researched-build.js` lines 320 and 329) describe what
the agent is meant to do. The runtime does not enforce them.

Real enforcement needs `.claude/agents/<name>.md` definitions with `tools:`
frontmatter, invoked via `agent(..., {agentType})`. Those files are per-repo.
The plugin does not ship them, which is the same portability limit that pushed
RFD-001 to reference files plus `scriptPath`. RFD-001 lists two ways out. It
chose neither.

## Options

1. **Ship agent definitions per consumer repo via `new-app`.** `new-app`
   scaffolds `.claude/agents/{researcher,tester,implementer,reviewer,verifier}.md`
   with `tools:` frontmatter. The workflow scripts pass `agentType` and fall
   back to today's prompt-only path when a definition is missing.
   - Pro: separation holds when a model ignores the prompt.
   - Con: every existing repo (alate, mood-layer, badige, loom) needs a
     backfill PR. The definitions drift per repo, and a plugin version bump no
     longer updates them. Adds a "definitions present?" branch to both
     workflow scripts and their tests.
2. **Accept prompt-level enforcement and stop claiming otherwise.** Reword the
   "Tools:" lines as intent ("You must not edit files"). Record in
   `standards/workflows.md` that separation is behavioural, not a sandbox, and
   keep the existing fail-closed review gate as the backstop.
   - Pro: no new moving parts. It stays plugin-portable and matches what
     already ships.
   - Con: a reviewer that ignores the instruction can still edit the tree. The
     only defence is the `isolation: 'worktree'` boundary plus the review of
     the final diff.
3. **Defer.** Leave the open question as it is until the plugin can ship agent
   types. This keeps a known inaccurate "Tools:" claim in the scripts for an
   unbounded time.

## Recommendation

Option 2 now, and reopen option 1 if Claude Code plugins gain the ability to
ship agent definitions. That was the only reason option 1 was rejected in the
first place.

## Open questions

- Has a reviewer or skeptic agent ever actually edited files in a real run? No
  such incident is recorded. If one is found, it argues for option 1.
- Does the current Claude Code plugin format ship `agents/`? If so, option 1
  loses its portability cost and becomes the clear choice. Check before merging.

## Cost

- Option 2: one small PR in forge that rewords 2 prompt lines, adds a
  paragraph in `standards/workflows.md` and ticks the RFD-001 box. About 30 min.
  No consumer-repo changes.
- Option 1: forge changes to both workflow scripts and tests, `new-app`
  scaffolding, and 4 consumer backfill PRs. About 1 to 2 days, plus ongoing
  drift upkeep.

## Consequences

Merging this PR accepts the recommended option (2), and implementation follows
as a separate PR. Closing it rejects the recommendation. RFD-001's open
question then stays unchecked until someone decides again.
