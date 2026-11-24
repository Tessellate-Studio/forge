#!/usr/bin/env node
/**
 * SubagentStart hook: adds lib/subagent-briefing.js to every subagent's
 * context (standards/workflows.md → "Subagents start from forge").
 *
 * OFF SWITCH: set FORGE_SUBAGENT_BRIEFING_DISABLE=1.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { briefing } = require(path.join(here, 'lib', 'subagent-briefing.js'));
const { emit, runHook, disabled } = require(path.join(
  here,
  'lib',
  'session-start.js'
));

runHook(async () => {
  if (disabled(process.env.FORGE_SUBAGENT_BRIEFING_DISABLE)) {
    return;
  }
  await emit({
    event: 'SubagentStart',
    context: briefing(path.join(here, '..')),
  });
});
