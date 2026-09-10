#!/usr/bin/env node
/**
 * SessionStart hook — surfaces the device-test queue automatically, so a
 * session opens already knowing what's pending instead of someone spawning
 * an agent to poll each repo (see skills/device-test/SKILL.md).
 *
 * Fetches the same data the /forge:device-test drain skill and the `dtq` /
 * device-test-status CLI use (skills/device-test/scripts/queue-lib.js) —
 * read-only.
 *
 * Quiet when every queue was read and nothing is pending, or when `gh` is not
 * installed or authenticated (an environment fact, not worth a nag).
 *
 * NOT quiet when the queue could not be read — a repo fetch that errored, or
 * the whole check running out of time. It used to abandon those silently, and
 * silence reads as "nothing pending": session start said nothing about a queue
 * with 22 open tests in it (forge#135). "Could not find out" is its own
 * answer. What to say lives in lib/device-test-summary.js, which has tests.
 *
 * OFF SWITCH: set FORGE_DEVICE_TEST_STATUS_DISABLE=1.
 *
 * ONE deadline over the whole check, not one per stage: two 12-second races
 * back to back can take 24 seconds, past the 15-second budget in hooks.json,
 * and then the harness kills the hook before it can say anything at all.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TIMEOUT_MS = 12_000;

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { checkGhReady, collect } = require(path.join(
  here,
  '..',
  'skills',
  'device-test',
  'scripts',
  'queue-lib.js'
));
const { emit, withDeadline, runHook, disabled } = require(path.join(
  here,
  'lib',
  'session-start.js'
));
const { summariseQueue, unreadableNotice } = require(path.join(
  here,
  'lib',
  'device-test-summary.js'
));

async function readQueue() {
  const ready = await checkGhReady();
  if (!ready || !ready.ok) {
    return { skip: true };
  }
  return { results: await collect() };
}

async function main() {
  if (disabled(process.env.FORGE_DEVICE_TEST_STATUS_DISABLE)) {
    return;
  }

  const outcome = await withDeadline(readQueue(), TIMEOUT_MS);
  if (outcome === null) {
    await emit(unreadableNotice(`did not finish in ${TIMEOUT_MS / 1000}s`));
    return;
  }
  if (outcome.skip) {
    return;
  }

  const summary = summariseQueue(outcome.results);
  if (summary) {
    await emit(summary);
  }
}

runHook(main);
