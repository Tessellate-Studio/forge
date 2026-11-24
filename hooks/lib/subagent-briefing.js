/**
 * What every subagent is told when it starts (owner, 2026-11-24): "any
 * subagent spun up is meant to take a look at forge and the required skills
 * and processes to be followed".
 *
 * The parent writes a subagent's brief, and a brief can leave the process
 * out: a subagent then works from its task alone and misses the rules the
 * parent works under. Added by the SubagentStart hook
 * (hooks/subagent-briefing.mjs), so it does not depend on the parent
 * remembering. Rule text: standards/workflows.md → "Subagents start from forge".
 *
 * Paths are absolute so a subagent working in another repo can read them.
 */
const path = require('path');

function briefing(root) {
  const std = f => path.join(root, 'standards', f);
  const skill = s => path.join(root, 'skills', s, 'SKILL.md');
  return [
    'Forge briefing (every subagent gets this; standards/workflows.md, "Subagents start from forge").',
    '',
    'Your brief decides WHAT to do. Forge decides HOW. Before you act:',
    "1. Read the CLAUDE.md at the root of the repo you are working in: that project's rules.",
    `2. Read the forge standards for your kind of work: ${std(
      'workflows.md'
    )} (process), ${std('anti-patterns.md')} (guardrails) and ${std(
      'authoritative-claims.md'
    )} (evidence).`,
    '3. Follow the forge skill for the work, by reading its SKILL.md:',
    `   - a code change, bug fix or CI change: ${skill('build-feature')}`,
    `   - planning a decision: ${skill('plan')}`,
    `   - a device test: ${skill('device-test')}`,
    '   A read-only task (search, read, review) needs steps 1-2 only as far as they bear on what you report.',
    '',
    'Rules that hold inside a subagent too:',
    "- PRs open as draft. Never mark one ready and never merge: that is the owner's call.",
    '- If you own a work item, claim it (`wip claim <repo>#<n>`) before the first edit, and release it when you hand back.',
    '- Fix the root cause, not one instance; label a contained fix as contained. A bug report starts with 🐛.',
    '- Never skip git hooks (`--no-verify`) or signing.',
    '- Every claim cites a source (file:line, SHA, command output) or is labelled a hypothesis.',
    '',
    'If your brief conflicts with a standard or skill, do not pick one silently: say so in your report.',
  ].join('\n');
}

module.exports = { briefing };
