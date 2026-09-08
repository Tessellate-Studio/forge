#!/usr/bin/env node
/**
 * SessionStart hook — tells a session what OTHER sessions are already working
 * before it picks anything up. That is where the collision actually happens:
 * by the time an agent has opened an issue and started reading code, it has
 * usually already decided to work it.
 *
 * Reads the same data as the `wip` board (tools/work-claim/lib/claim.js) —
 * every issue/PR carrying the `claimed` label, and the 🚧 claim comment on it.
 * Read-only: never posts, edits, labels or releases a claim. Taking and
 * releasing claims is the working session's job (standards/workflows.md →
 * "Work claims").
 *
 * Quiet by design, same principle as forge-freshness.mjs and
 * device-test-status.mjs: nothing claimed (or `gh` unavailable, or the check
 * times out) prints nothing and exits 0. Only speaks when another session is
 * demonstrably in flight, or when a claim has gone silent long enough to be
 * free to take over.
 *
 * OFF SWITCH: set FORGE_WORK_CLAIMS_DISABLE=1.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TIMEOUT_MS = 12_000;

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const {
  STALE_MINUTES,
  collect,
  describeClaim,
  claimDetails,
} = require(path.join(here, '..', 'tools', 'work-claim', 'lib', 'claim.js'));

function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve(null), ms));
}

async function main() {
  if (/^(1|true|yes|on)$/i.test(process.env.FORGE_WORK_CLAIMS_DISABLE ?? '')) {
    return;
  }

  // ONE deadline for the whole hook, not one per await. Racing each stage
  // against its own TIMEOUT_MS makes the true worst case the SUM of the
  // stages, which is how a "12 second" hook overruns hooks.json's 15s budget.
  // No `gh auth status` preflight either: every fetch already degrades to
  // `{error, items: []}` on an unauthenticated gh, and this hook skips those
  // silently — so the probe bought nothing and cost a full serial round trip.
  const results = await Promise.race([collect(), timeout(TIMEOUT_MS)]);
  if (!results) {
    return; // timed out — degrade silently, never slow session start
  }

  const live = [];
  const stale = [];

  results.forEach(r => {
    if (r.error) {
      return;
    }
    r.items.forEach(item => {
      const where = `${r.key}#${item.number}`;
      if (item.claim) {
        const c = item.claim;
        // describeClaim is the one place the "who holds it, how idle, what it
        // is parked on" phrasing lives — the `wip` board and this hook must not
        // drift into two different vocabularies for the same state.
        const parts = [`- ${where} ${item.title} — ${describeClaim(c)}`];

        // Same rows the board prints, same order, from one definition —
        // this block used to be a hand-kept copy and had already lost
        // `related`.
        claimDetails(c).forEach(([label, value]) => {
          parts.push(`  ${label}${value}`);
        });
        parts.push(`  ${item.url}`);
        live.push(parts.join('\n'));
      } else if (item.claims.some(c => c.held)) {
        stale.push(
          `- ${where} ${item.title} — claim silent >${STALE_MINUTES} min, free to take over: ${item.url}`
        );
      }
    });
  });

  if (live.length === 0 && stale.length === 0) {
    return; // nothing in flight anywhere — a valid, quiet result
  }

  const summary = [
    live.length ? `${live.length} in flight` : '',
    stale.length ? `${stale.length} stale` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const sections = [];
  if (live.length) {
    sections.push(
      `Other sessions are already working these items — do NOT start on one ` +
        `without resuming or taking over its claim first:\n${live.join('\n')}`
    );
  }
  if (stale.length) {
    sections.push(
      `Claims that have gone silent (holder presumed gone; take over with ` +
        `\`wip claim <repo>#<n> --force\` and say so):\n${stale.join('\n')}`
    );
  }

  // additionalContext MUST be nested under hookSpecificOutput with a
  // hookEventName — a top-level additionalContext key is silently ignored,
  // so the model never sees it. Same shape as device-test-status.mjs.
  process.stdout.write(
    JSON.stringify({
      systemMessage: `work claims: ${summary} — run \`wip\` for the board`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `${sections.join('\n\n')}\n` +
          `This is informational only — don't act on it unless the user asks. ` +
          `Run \`wip\` for the live board. When THIS session picks up an issue or ` +
          `PR, claim it: \`wip claim <repo>#<n> --doc <planning doc>\`.`,
      },
    })
  );
}

main()
  .catch(() => {
    /* never let this hook be why a session starts noisily */
  })
  .finally(() => process.exit(0));
