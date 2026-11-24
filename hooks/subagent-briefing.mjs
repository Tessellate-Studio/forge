#!/usr/bin/env node
/**
 * SubagentStart hook: adds the forge briefing (hooks/lib/subagent-briefing.js)
 * to every subagent's context, so a subagent reads forge and follows its
 * skills and processes whatever its brief left out (owner, 2026-11-24).
 *
 * Reads nothing from stdin it needs and does no I/O beyond writing its
 * answer, so it cannot be slow. A SubagentStart hook cannot block the agent.
 *
 * OFF SWITCH: set FORGE_SUBAGENT_BRIEFING_DISABLE=1.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { briefing } = require(path.join(here, 'lib', 'subagent-briefing.js'));
const { disabled } = require(path.join(here, 'lib', 'session-start.js'));

if (!disabled(process.env.FORGE_SUBAGENT_BRIEFING_DISABLE)) {
  // additionalContext must sit under hookSpecificOutput with its event name;
  // a top-level key is ignored (see lib/session-start.js).
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: briefing(path.join(here, '..')),
      },
    })
  );
}
