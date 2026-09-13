// How a session should invoke the work-claim CLI on THIS machine.
//
// WHY THIS EXISTS. Every skill says `wip claim <repo>#<n>`. On 2026-09-13 the
// global forge install turned out to be an `npm link` made before the `wip`
// bin existed: `dtq` had a shim, `wip` did not. Every `wip claim` failed with
// "command not found", sessions skipped it, and alate went its whole life
// without a single claim. Re-running `npm link` is not a durable fix either —
// session AppData can be a virtualized overlay the next session never sees.
//
// The plugin always ships the CLI itself, so the fallback is to run it from
// the plugin root. Its two runtime deps (commander, chalk) come from the
// plugin's own node_modules; if those are missing, say so rather than hand
// the session a command that cannot run.
//
// Dependency-free, like the rest of hooks/lib: hooks run before anything is
// installed.

const fs = require('fs');
const path = require('path');

const CLI_DEPS = ['commander', 'chalk'];

function onPath(env, platform, exists) {
  // Windows spells it `Path`; env lookups there are case-insensitive but a
  // plain object copy is not.
  const raw = env.PATH ?? env.Path ?? '';
  const exts =
    platform === 'win32'
      ? [
          '',
          ...(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';'),
          '.ps1',
        ]
      : [''];
  return raw
    .split(path.delimiter)
    .filter(Boolean)
    .some(dir => exts.some(ext => exists(path.join(dir, `wip${ext}`))));
}

function defaultDepsResolvable(pluginRoot) {
  return CLI_DEPS.every(dep => {
    try {
      require.resolve(dep, { paths: [pluginRoot] });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * @returns {{ onPath: boolean, command: string, depsMissing: boolean }}
 *   `command` is what to type in place of `wip` — bare `wip`, or
 *   `node "<pluginRoot>/tools/work-claim/cli.js"`.
 */
function resolveWipCommand({
  env = process.env,
  platform = process.platform,
  pluginRoot,
  exists = fs.existsSync,
  depsResolvable = defaultDepsResolvable,
}) {
  if (onPath(env, platform, exists)) {
    return { onPath: true, command: 'wip', depsMissing: false };
  }
  const cli = path.join(pluginRoot, 'tools', 'work-claim', 'cli.js');
  return {
    onPath: false,
    command: `node "${cli}"`,
    depsMissing: !depsResolvable(pluginRoot),
  };
}

/**
 * The one line a session needs when bare `wip` will not work, or null when
 * it will — the hook stays quiet in the normal case.
 */
function wipNotice({ onPath: found, command, depsMissing }, pluginRoot) {
  if (found) {
    return null;
  }
  if (depsMissing) {
    return (
      `\`wip\` is not on PATH and the plugin copy is missing its dependencies, ` +
      `so work claims cannot be taken. Run \`npm ci --omit=dev\` in "${pluginRoot}", ` +
      `then use \`${command}\` wherever a skill says \`wip\` — and tell the ` +
      `user a claim was not taken; never skip it silently.`
    );
  }
  return (
    `\`wip\` is not on PATH on this machine. Wherever a skill or standard says ` +
    `\`wip …\`, run \`${command} …\` instead. A claim that fails must be ` +
    `reported to the user, never skipped silently.`
  );
}

module.exports = { resolveWipCommand, wipNotice };
