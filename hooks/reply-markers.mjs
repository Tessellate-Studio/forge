#!/usr/bin/env node
// Stop hook: a final chat reply that is a report (two or more top-level points)
// follows "Summary markers" (standards/workflows.md). The PR-body half of the
// rule is report-markers.mjs; this is the half no tool call carries, so only a
// Stop hook can see it. Logic: lib/report-markers.js.
//
// It nudges once: `stop_hook_active` means this stop already follows a nudge,
// so it always allows then, and a reply that still misses is let through rather
// than looping. Anything it cannot read is allowed.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  finalReplyText,
  checkReply,
  REPLY_NUDGE,
} = require('./lib/report-markers.js');

const allow = () => process.exit(0);

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return allow();
  }
  if (payload?.stop_hook_active) {
    return allow();
  }
  let text =
    typeof payload?.last_assistant_message === 'string'
      ? payload.last_assistant_message
      : null;
  if (text === null) {
    try {
      text = finalReplyText(
        readFileSync(payload.transcript_path, 'utf8')
          .split('\n')
          .filter(Boolean)
      );
    } catch {
      return allow();
    }
  }
  const verdict = checkReply(text);
  if (verdict.ok) {
    return allow();
  }
  process.stdout.write(
    JSON.stringify({ decision: 'block', reason: REPLY_NUDGE(verdict) })
  );
  process.exit(0);
};

main().catch(() => allow());
