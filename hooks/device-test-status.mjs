#!/usr/bin/env node
/**
 * SessionStart hook — surfaces the device-test queue automatically, so a
 * session opens already knowing what's pending instead of someone spawning
 * an agent to poll each thread (see skills/device-test/SKILL.md).
 *
 * Fetches the same data the /forge:device-test drain skill and the `dtq` /
 * device-test-status CLI use (skills/device-test/scripts/queue-lib.js) —
 * read-only, never edits or minimizes a comment.
 *
 * Quiet by design, same principle as forge-freshness.mjs: nothing pending
 * (or `gh` unavailable, or the check times out) prints nothing and exits 0.
 * A hook that nags every session regardless of outcome is its own nuisance.
 * Only speaks up when there's something a human would actually want to know
 * about first thing — an open item, a failure, or a comment whose format
 * has drifted.
 *
 * OFF SWITCH: set FORGE_DEVICE_TEST_STATUS_DISABLE=1.
 *
 * Self-bounded to TIMEOUT_MS so a slow/rate-limited GitHub API can never add
 * noticeable session-start latency — if the check hasn't finished by then,
 * it's abandoned like any other failure (silent, exit 0), same as any repo
 * whose fetch legitimately errored.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TIMEOUT_MS = 12_000;

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { STATUS, checkGhReady, collect } = require(
  path.join(here, '..', 'skills', 'device-test', 'scripts', 'queue-lib.js')
);

function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve(null), ms));
}

async function main() {
  if (/^(1|true|yes|on)$/i.test(process.env.FORGE_DEVICE_TEST_STATUS_DISABLE ?? '')) {
    return;
  }

  const ready = await Promise.race([checkGhReady(), timeout(TIMEOUT_MS)]);
  if (!ready || !ready.ok) {
    return; // no gh, not authenticated, or timed out — an environment fact, not worth a nag
  }

  const results = await Promise.race([collect(), timeout(TIMEOUT_MS)]);
  if (!results) {
    return; // timed out — degrade silently, never block or slow session start
  }

  const lines = [];
  let totalOpen = 0;
  let totalFailed = 0;
  let totalHuman = 0;
  let totalNeedsBuild = 0;
  let totalUnparsed = 0;

  results.forEach(r => {
    if (r.error || !r.issueNumber) {
      return;
    }
    const open = r.items.filter(i => i.state === STATUS.OPEN);
    const failed = r.items.filter(i => i.state === STATUS.FAILED);
    const needsBuild = r.items.filter(i => i.state === STATUS.NEEDS_BUILD);
    const unparsed = r.items.filter(i => i.state === STATUS.UNPARSEABLE);
    const human = open.filter(i => i.needsHuman).length;
    totalOpen += open.length;
    totalFailed += failed.length;
    totalHuman += human;
    totalNeedsBuild += needsBuild.length;
    totalUnparsed += unparsed.length;

    if (open.length || failed.length || needsBuild.length || unparsed.length) {
      const parts = [];
      if (open.length) {
        parts.push(`${open.length} open${human ? ` (${human} needs-human)` : ''}`);
      }
      if (failed.length) {
        parts.push(`${failed.length} failed`);
      }
      if (needsBuild.length) {
        parts.push(`${needsBuild.length} needs-build`);
      }
      if (unparsed.length) {
        parts.push(`${unparsed.length} unparseable`);
      }
      lines.push(`- ${r.key}: ${parts.join(', ')} — ${r.issueUrl}`);
    }
  });

  if (lines.length === 0) {
    return; // every queue empty or fully done — a valid, quiet result
  }

  const summary = `${totalOpen} open, ${totalFailed} failed${
    totalHuman ? `, ${totalHuman} needs-human` : ''
  }${totalNeedsBuild ? `, ${totalNeedsBuild} needs-build` : ''}${
    totalUnparsed ? `, ${totalUnparsed} unparseable` : ''
  }`;

  // additionalContext MUST be nested under hookSpecificOutput with a
  // hookEventName — a top-level additionalContext key is silently ignored
  // ("Hook JSON output had unrecognized keys"), so the model never sees it.
  // Verified against the debug log of a live session, 2026-08-26.
  process.stdout.write(
    JSON.stringify({
      systemMessage: `device-test queue: ${summary} — run \`dtq\` for details`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `The device-test queue (across alate, mood-layer, badige) has pending items:\n` +
          `${lines.join('\n')}\n` +
          `This is informational only — don't act on it unless the user asks. Run \`dtq\` ` +
          `(or \`device-test-status\`) for the live board, or /forge:device-test to drain it.`,
      },
    })
  );
}

main()
  .catch(() => {
    /* never let this hook be why a session starts noisily */
  })
  .finally(() => process.exit(0));
