// Make the `wip` CLI runnable from a bare clone or plugin copy.
//
// WHY THIS EXISTS. 2026-11-17, an alate cloud session: forge was attached by
// hand (a clone, not an installed plugin), so no SessionStart hook ran and
// `node <clone>/tools/work-claim/cli.js claim …` died with MODULE_NOT_FOUND
// on `commander`. The session worked ~20 minutes with no claim. A notice from
// a hook cannot fix that, because the hook is not always there. The CLI has to
// fix itself on its first run.
//
// Dependency-free on purpose: it runs BEFORE commander and chalk are loadable.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// The only runtime deps cli.js and lib/ need. hooks/lib/wip-command.js reads
// this list too, so the two cannot drift.
const CLI_DEPS = ['commander', 'chalk'];

function defaultResolvable(root) {
  return CLI_DEPS.every(dep => {
    try {
      require.resolve(dep, { paths: [root] });
      return true;
    } catch {
      return false;
    }
  });
}

function defaultRun(root, args) {
  // stdout goes to stderr: the CLI's own stdout must stay clean for callers.
  const r = spawnSync('npm', args, {
    cwd: root,
    stdio: ['ignore', 2, 2],
    shell: process.platform === 'win32',
  });
  return { status: r.status, error: r.error };
}

/**
 * Install the plugin's runtime deps if they cannot be resolved.
 *
 * @returns {{ ok: boolean, installed: boolean, message?: string }}
 *   ok=true when the deps resolve (already, or after the install).
 */
function ensureDeps({
  root,
  resolvable = defaultResolvable,
  run = defaultRun,
  exists = fs.existsSync,
  log = msg => process.stderr.write(`${msg}\n`),
}) {
  if (resolvable(root)) {
    return { ok: true, installed: false };
  }
  // `npm ci` needs a lockfile; a plugin copy without one gets `npm install`.
  const lock = exists(path.join(root, 'package-lock.json'));
  const args = [
    lock ? 'ci' : 'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
  ];
  log(
    `wip: dependencies missing in "${root}", running npm ${args.join(' ')} (first run only)…`
  );
  const r = run(root, args);
  if (r.status === 0 && resolvable(root)) {
    return { ok: true, installed: true };
  }
  const why = r.error ? r.error.message : `npm exited with status ${r.status}`;
  return {
    ok: false,
    installed: false,
    message:
      `wip: could not install its dependencies (${why}). ` +
      `Run \`npm ci --omit=dev\` in "${root}" by hand, and tell the user a claim was not taken.`,
  };
}

module.exports = { CLI_DEPS, ensureDeps };
