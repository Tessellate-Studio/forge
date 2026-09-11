#!/usr/bin/env node
// PreToolUse gate: an agent in a Tessellate repo may merge a PR only through a
// route that cannot merge before CI is green.
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
//     checks-gate's (or `gh pr checks --watch`'s). This only refuses routes
//     where nobody asked.
//
// Failure policy is asymmetric, matching the cost of being wrong: unreadable
// stdin means no command to judge, so allow; a command that is merge-shaped but
// throws during classification is denied. A false deny costs one retry through a
// sanctioned route; a false allow ships unverified code.

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const {
  classifyMergeCommand,
  looksLikeMerge,
  mergeTarget,
  REASON,
} = require('./lib/merge-gate.js');
const { withDeadline } = require('./lib/session-start.js');

const execFileAsync = promisify(execFile);

// The device-test question (forge#104) may take this long. hooks.json gives
// the whole hook 10s; past this the decision goes to the user, not a guess.
const DEVICE_DEADLINE_MS = 7_000;

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
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

/** owner/name of the checkout's origin remote, or null. Local, no network. */
const originSlug = async cwd => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', cwd || '.', 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', timeout: 3_000 }
    );
    const match = stdout
      .trim()
      .match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

/** The PR number a branch/URL selector — or the current branch — names. */
const prNumberFor = async (selector, repo, cwd) => {
  const args = selector ? ['pr', 'view', selector, '-R', repo] : ['pr', 'view'];
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [...args, '--json', 'number', '--jq', '.number'],
      { cwd: cwd || undefined, encoding: 'utf8', timeout: 5_000 }
    );
    return /^\d+$/.test(stdout.trim()) ? stdout.trim() : null;
  } catch {
    return null;
  }
};

/**
 * Does an open device test still verify the PR this command merges?
 * Repos without a device-test queue answer `clear` before any network call,
 * so a forge merge costs one local `git remote` at most.
 */
const deviceCheck = async (command, cwd) => {
  const target = mergeTarget(command);
  if (!target) {
    return {
      status: 'unknown',
      detail: 'could not tell which PR this command merges',
    };
  }
  const repo = target.repo || (await originSlug(cwd));
  if (!repo) {
    return {
      status: 'unknown',
      detail: 'could not tell which repo this merge is in',
    };
  }

  // Loaded lazily: this hook runs before EVERY shell command, and only an
  // allowed merge ever needs the device-test modules.
  const {
    trackedRepo,
    fetchVerification,
  } = require('../skills/device-test/scripts/verification.js');
  if (!trackedRepo(repo)) {
    return { status: 'clear', detail: `${repo} has no device-test queue` };
  }
  const pr = target.pr || (await prNumberFor(target.selector, repo, cwd));
  if (!pr) {
    return {
      status: 'unknown',
      detail: `could not tell which ${repo} PR this merges`,
    };
  }
  return { ...(await fetchVerification(repo, pr)), repo, pr };
};

const DEVICE_REFUSAL = ({ detail, repo, pr }) =>
  [
    `Refused: ${detail} — nobody has seen this change pass on a device yet (forge#104).`,
    '\n\nEither:',
    '\n  1. Run the test first (/forge:device-test), close it `completed` when it passes, then merge; or',
    '\n  2. Merge before a device pass ON PURPOSE, and say so on the PR, where it stays:',
    `\n     gh label create device-unverified -R ${repo} --color d93f0b --description "Merged before its device test passed" || true`,
    `\n     gh pr edit ${pr} -R ${repo} --add-label device-unverified`,
    '\n\nShipping first is often right — an OTA-delivered change can only be tested once it ships.',
    ' What this changes is that it is no longer silent. Do not add the label just to get past this',
    ' hook: if the change has not been thought about, ask the user.',
  ].join('');

const DEVICE_UNKNOWN = reason =>
  `Could not confirm whether an open device test still verifies this PR (${reason}). ` +
  'The merge gate does not read that as clear (forge#104). Approve to merge anyway, ' +
  'or deny and check `dtq` first.';

const REFUSAL = detail =>
  [
    'Refused: this merge does not wait for CI.',
    detail ? `\n${detail}` : '',
    '\n\nUse one of the two sanctioned routes:',
    '\n\n1. Automated merge (crash-monitor, status-check, security-sweep, roadmap-pulse) — the confidence command:',
    '\n   node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo <owner/name> --pr <n> \\',
    '\n     --source <skill> --what "<one line>" [--declare guard|rewrite]',
    '\n   It does NOT wait: it reads CI once and refuses on a fail, zero checks, or a check',
    '\n   still running. Run checks-gate (below) first, as its own step. It writes the',
    '\n   auto-ship ledger row itself.',
    "\n\n2. A merge you were asked for — gate it on checks-gate's OWN exit status:",
    '\n   node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n> && gh pr merge <n> -R <owner/name> --squash',
    '\n   It waits for checks to appear and retries a failed read, so a network blip is not "red".',
    "\n   Never pipe it: `| tail` hands `&&` tail's exit code, not the checks'.",
    '\n   (`gh pr checks <n> --watch >/dev/null && …` is still accepted, but reads those as red.)',
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
        '`node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n> && gh pr merge <n> --squash`.'
    );
    return;
  }

  if (verdict.allow) {
    // A gated merge waits for CI. Whether anyone has seen it work on a phone is
    // a second question, asked only of merges that have already passed the
    // first. safe-merge asks it itself (condition 6), so it is not re-asked.
    if (
      verdict.reason === REASON.GATED_WATCH ||
      verdict.reason === REASON.GATED_CHECKS
    ) {
      const device = await withDeadline(
        deviceCheck(command, payload?.cwd).catch(err => ({
          status: 'unknown',
          detail: err?.message ?? 'lookup failed',
        })),
        DEVICE_DEADLINE_MS
      );
      if (device === null || device.status === 'unknown') {
        decide(
          'ask',
          DEVICE_UNKNOWN(
            device === null
              ? `the lookup took over ${DEVICE_DEADLINE_MS / 1000}s`
              : device.detail
          )
        );
        return;
      }
      if (device.status === 'pending') {
        decide('deny', DEVICE_REFUSAL(device));
        return;
      }
    }
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
        '`node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n> && gh pr merge <n> --squash`.'
    );
    return;
  }
  allow();
});
