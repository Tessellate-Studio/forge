#!/usr/bin/env node
// PreToolUse gate: a PR body published by an agent follows "Summary markers"
// (standards/workflows.md). Logic and rationale: lib/report-markers.js.
//
// Failure policy: this guards report style, not shipped code, so anything it
// cannot read (no stdin, an unexpandable body-file path, a body passed some way
// it does not parse) is ALLOWED. Only a body it read and found unmarked is
// denied; the cost of that is one retry with markers added.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  isPrBodyCommand,
  extractBody,
  checkBody,
  REFUSAL,
} = require('./lib/report-markers.js');

const allow = () => process.exit(0);

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/** Expand $VAR, ${VAR} and %VAR% from the environment; null if any is unset. */
const expand = p => {
  let missing = false;
  const out = p.replace(
    /\$\{(\w+)\}|\$(\w+)|%(\w+)%/g,
    (_, a, b, c) => process.env[a || b || c] ?? ((missing = true), '')
  );
  return missing ? null : out;
};

const main = async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return allow();
  }
  const tool = payload?.tool_name;
  const command = payload?.tool_input?.command;
  if ((tool !== 'Bash' && tool !== 'PowerShell') || !isPrBodyCommand(command)) {
    return allow();
  }

  const found = extractBody(command);
  if (!found) {
    return allow();
  }
  let body = found.text;
  if (found.file) {
    const p = expand(found.file);
    if (!p || p === '-') {
      return allow();
    }
    try {
      body = readFileSync(path.resolve(payload?.cwd || '.', p), 'utf8');
    } catch {
      return allow();
    }
  }

  const verdict = checkBody(body);
  if (verdict.ok) {
    return allow();
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: REFUSAL(verdict),
      },
    })
  );
  process.exit(0);
};

main().catch(() => allow());
