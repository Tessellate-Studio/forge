// The SessionStart hook contract, in one place.
//
// WHY THIS EXISTS. Three hooks (forge-freshness, device-test-status,
// work-claims) each hand-rolled the same three things: the output envelope, a
// deadline race, and an exit tail that must never let a hook be the reason a
// session starts noisily. The envelope in particular carried a warning comment
// pasted verbatim into all three:
//
//   "additionalContext MUST be nested under hookSpecificOutput with a
//    hookEventName — a top-level additionalContext key is silently ignored"
//
// That comment exists because the shape was got wrong once and the model never
// saw the output; it cost a live debugging session to find. A warning repeated
// in three files is a warning that will be missed in the fourth — the next
// hook gets written by copying one of these, and the copy is where the
// contract drifts. Encoding it here means a hook cannot get the shape wrong
// without changing this file, which has tests.
//
// Kept dependency-free on purpose: hooks run before anything is installed and
// must not pull in chalk, commander, or any network client.

/**
 * Emit a SessionStart result and nothing else.
 *
 * @param {object} out
 * @param {string} out.systemMessage one line the user sees
 * @param {string} out.context       what the model is told (may be long)
 */
function emit({ systemMessage, context }) {
  const payload = JSON.stringify({
    systemMessage,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context,
    },
  });

  // Resolve once the write has been accepted, and let the caller exit only
  // after that.
  //
  // DEFENSIVE, not a diagnosed incident: `process.exit()` discards whatever
  // is still buffered, and stdout to a pipe is asynchronous once the payload
  // outgrows the buffer. I could not reproduce truncation on this platform
  // (120 KB survived both with and without the await, to a pipe and to a
  // file), so this is insurance against a sink where it does bite, not a fix
  // for an observed loss. The quiet runs that prompted the look were the
  // 12-second collect() deadline returning null — the designed quiet path.
  return new Promise(resolve => process.stdout.write(payload, resolve));
}

/**
 * Resolve to `null` if `promise` has not settled within `ms`.
 *
 * ONE deadline per hook, not one per await: racing each stage separately makes
 * the true worst case the SUM of the stages, which is how a "12 second" hook
 * overruns a 15-second budget. Note this does not cancel the loser — anything
 * spawning subprocesses must bound them itself.
 */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), ms);
    if (timer.unref) {
      timer.unref();
    }
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Run a hook body. Never throws, never blocks, always exits 0.
 *
 * A SessionStart hook that fails loudly is worse than one that says nothing:
 * its failure lands in front of the user at the exact moment they are trying
 * to start work, and none of these hooks carry information worth that.
 */
function runHook(main) {
  return main()
    .catch(() => {
      /* never let a hook be why a session starts noisily */
    })
    .then(() => process.exit(0));
}

/** True when an off-switch env var is set to anything truthy. */
function disabled(value) {
  return /^(1|true|yes|on)$/i.test(value ?? '');
}

module.exports = { emit, withDeadline, runHook, disabled };
