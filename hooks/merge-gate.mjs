#!/usr/bin/env node
// PreToolUse gate: an agent in a Tessellate repo may merge a PR only through a
// route that actually waits for CI.
//
// This is the enforcement layer under `standards/workflows.md` → "Merge on
// green". Everything else forge wires at SessionStart is INFORMATIONAL; this is
// the first hook that can refuse. It exists because the rule it enforces was
// prose, and prose gets skipped — see the three measured incidents in
// lib/merge-gate.js.
//
// WHAT IT DOES NOT DO, deliberately:
//
//   - It does not touch the human. PreToolUse sees the model's tool calls only.
//     Anything typed in your own terminal, or clicked in the GitHub UI, is
//     unaffected — this constrains the agent, not you.
//   - It does not intercept safe-merge's own merge. That CLI shells out with
//     spawn('gh', …, {shell:false}) from inside Node, which is a child process
//     rather than a tool call, so the hook never sees it. No exemption needed;
//     the allow-rule for safe-merge covers only the model INVOKING the CLI.
//   - It does not judge whether the checks passed. That is safe-merge's job, or
//     `gh pr checks --watch`'s. This only refuses routes where nobody asked.
//
// Failure policy is asymmetric, matching the cost of being wrong: unreadable
// stdin means no command to judge, so allow; a command that is merge-shaped but
// throws during classification is denied. A false deny costs one retry through a
// sanctioned route; a false allow ships unverified code.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyMergeCommand, looksLikeMerge } = require('./lib/merge-gate.js');

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

/** Emit a PreToolUse decision in the shape forge's other hooks already use. */
const decide = (permissionDecision, permissionDecisionReason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason,
      },
    })
  );
  process.exit(0);
};

const allow = () => process.exit(0);

const REFUSAL = detail =>
  [
    'Refused: this merge does not wait for CI.',
    detail ? `\n${detail}` : '',
    '\n\nUse one of the two sanctioned routes:',
    '\n\n1. Automated fix (crash-monitor, status-check, security-sweep) — the confidence command:',
    '\n   node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo <owner/name> --pr <n> \\',
    '\n     --source <skill> --what "<one line>" --declare guard|rewrite',
    '\n   It waits for CI, refuses on a fail, treats zero-checks and still-running as unknown',
    '\n   rather than a pass, and writes the auto-ship ledger row itself.',
    "\n\n2. A merge you were asked for — gate it on the check command's OWN exit status:",
    '\n   gh pr checks <n> -R <owner/name> --watch >/dev/null && gh pr merge <n> -R <owner/name> --squash',
    "\n   Redirect, never pipe: `| tail` hands `&&` tail's exit code, not the checks'.",
    '\n\nIf the merge genuinely should bypass CI, say so and ask the user — do not reshape the ',
    'command to get past this hook.',
  ].join('');

// Set once the command is known to be merge-shaped, so the top-level catch
// below can honour the same asymmetry the rest of this file does. Without it a
// late throw would fall through to allow() — a gate that fails open on an
// unexpected error is the bug this whole hook exists to prevent.
let mergeShapedCommandSeen = false;

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    // No readable tool call means nothing to judge.
    allow();
    return;
  }

  // Both shell tools carry the command on tool_input.command. Anything else
  // (Read, Edit, an MCP call) cannot merge a PR from a shell string.
  const toolName = payload?.tool_name;
  if (toolName !== 'Bash' && toolName !== 'PowerShell') {
    allow();
    return;
  }

  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || command.length === 0) {
    allow();
    return;
  }

  let mergeShaped = true;
  try {
    mergeShaped = looksLikeMerge(command);
  } catch {
    // Could not tell. Fall through to the classifier, which fails closed.
  }
  if (!mergeShaped) {
    allow();
    return;
  }
  mergeShapedCommandSeen = true;

  let verdict;
  try {
    verdict = classifyMergeCommand(command);
  } catch (err) {
    decide(
      'deny',
      `Refused: the merge gate could not classify this command (${
        err?.message ?? 'unknown error'
      }). ` +
        'This fails closed on purpose. Merge through safe-merge, or through ' +
        '`gh pr checks <n> --watch >/dev/null && gh pr merge <n> --squash`.'
    );
    return;
  }

  if (verdict.allow) {
    allow();
    return;
  }

  decide('deny', REFUSAL(verdict.detail));
};

main().catch(err => {
  if (mergeShapedCommandSeen) {
    decide(
      'deny',
      `Refused: the merge gate errored while judging a merge command (${
        err?.message ?? 'unknown error'
      }). ` +
        'It fails closed. Merge through safe-merge, or through ' +
        '`gh pr checks <n> --watch >/dev/null && gh pr merge <n> --squash`.'
    );
    return;
  }
  allow();
});
