/**
 * The text every subagent starts with. Rule and reasons:
 * standards/workflows.md → "Subagents start from forge".
 *
 * It POINTS at the standards and skills (by section heading) and does not
 * restate their rules: a copy here would drift from the one source the day a
 * rule changes. Root given once, so a subagent in another repo can read the
 * files; reading scoped to what the task touches, so a fan-out of search
 * agents does not each read 140 KB of standards.
 */

function briefing(root) {
  return [
    'Forge briefing (from the forge plugin, for every subagent).',
    `Forge root: ${root}`,
    '',
    'Your brief says WHAT to do; forge says HOW. Before acting:',
    "1. Read the CLAUDE.md at the root of the repo you work in (the project's rules).",
    '2. If your prompt is a forge agent charter (references/agents/), the charter is your process; follow it and skip 3.',
    '3. Follow the forge skill for your work: skills/build-feature/SKILL.md for a code change, bug fix or CI change; skills/plan/SKILL.md for a decision; skills/device-test/SKILL.md for a device test.',
    '',
    'Read the standards sections your task touches, by heading (headings first, not whole files):',
    '- standards/workflows.md: "Draft first, then merge on green" before any PR; "Work claims" before editing an issue you own; "Root-cause fixes, not band-aids" and "Bug-fix pre-flight" on a bug; "Quality pass before commit" before a commit; "Summary markers" for your report.',
    '- standards/anti-patterns.md before writing code; standards/authoritative-claims.md for anything you claim.',
    'A read-only task (search, read, review) reads only what bears on its report.',
    '',
    'If your brief conflicts with a standard or skill, do not pick one silently: say so in your report.',
  ].join('\n');
}

module.exports = { briefing };
