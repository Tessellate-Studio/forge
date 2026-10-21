#!/usr/bin/env node
// checks-gate — exit 0 only when a PR's checks are green. The gate half of a
// merge you were asked for:
//
//   node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo <owner/name> --pr <n> \
//     && gh pr merge <n> -R <owner/name> --squash
//
// It replaces `gh pr checks <n> --watch >/dev/null &&`, whose exit code also
// reads a network blip or not-yet-registered checks as red — lib/gate.js has
// the incidents. It waits for checks to appear, retries a failed read, and ends
// on one RESULT line.
//
// A repo with no CI at all (no workflow files, no required checks) has nothing
// to wait for: after a short grace it ends NO_CI with exit 0, so the same
// command merges a docs repo instead of sitting out the register window and
// failing NO_CHECKS (tessellate-pages#45, 2026-10-21).
//
// No dependency beyond Node, same as safe-merge: this runs by absolute path out
// of a plugin cache, where a missing package fails somewhere nobody sees.

'use strict';

const { spawn } = require('child_process');
const { repoHasCi, waitForChecks, RESULT } = require('./lib/gate');

const EXIT = {
  GREEN: 0,
  INTERNAL: 1,
  USAGE: 2,
  RED: 10,
  NO_CHECKS: 11,
  TIMED_OUT: 12,
};

const DEFAULTS = {
  poll: 20,
  registerTimeout: 600,
  timeout: 7200,
  noCiGrace: 60,
};

const USAGE = `checks-gate — exit 0 only when a PR's checks are green (or its repo has no CI)

  --repo              <owner/name>  required
  --pr                <number>      required
  --poll              <seconds>     between reads            (default ${DEFAULTS.poll})
  --register-timeout  <seconds>     for any check to start   (default ${DEFAULTS.registerTimeout})
  --timeout           <seconds>     for all checks to finish (default ${DEFAULTS.timeout})
  --no-ci-grace       <seconds>     repos with no CI: wait this long for an
                                    app check before NO_CI   (default ${DEFAULTS.noCiGrace})

Exit: 0 green, or no CI in the repo · 10 red · 11 no checks ran · 12 timed out · 2 usage/help · 1 internal
Progress goes to stderr; the one RESULT line goes to stdout.`;

/** Run gh, capturing both streams. Never rejects: a failed read is data here. */
function gh(args) {
  return new Promise(resolve => {
    const child = spawn('gh', args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error =>
      resolve({ stdout: '', stderr: error.message, code: 1 })
    );
    child.on('close', code => resolve({ stdout, stderr, code }));
  });
}

const readChecks = (repo, pr) =>
  gh(['pr', 'checks', pr, '-R', repo, '--json', 'name,bucket']);

/**
 * One `gh api` list read: the names, [] when GitHub says 404 (nothing there),
 * or null when the read failed any other way — repoHasCi treats null as CI.
 */
async function apiList(path, jq) {
  const read = await gh(['api', path, '--jq', jq]);
  if (read.code === 0) {
    return read.stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }
  return /HTTP 404/.test(read.stderr) ? [] : null;
}

/** Whether the PR's repo has any CI: workflows at its head, or required checks on its base. */
async function readRepoHasCi(repo, pr) {
  const view = await gh([
    'pr',
    'view',
    pr,
    '-R',
    repo,
    '--json',
    'headRefOid,baseRefName',
  ]);
  let head;
  try {
    head = JSON.parse(view.stdout);
  } catch {
    return true;
  }
  const branch = encodeURIComponent(head.baseRefName);
  const [workflowFiles, classic, rulesets] = await Promise.all([
    apiList(
      `repos/${repo}/contents/.github/workflows?ref=${head.headRefOid}`,
      '.[].name'
    ),
    apiList(
      `repos/${repo}/branches/${branch}/protection/required_status_checks`,
      '.contexts[]'
    ),
    apiList(
      `repos/${repo}/rules/branches/${branch}`,
      '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
    ),
  ]);
  const requiredChecks = classic && rulesets ? [...classic, ...rulesets] : null;
  return repoHasCi({ workflowFiles, requiredChecks });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      options.help = true;
    } else if (token.startsWith('--')) {
      const key = token
        .slice(2)
        .replace(/-([a-z])/g, (_match, chr) => chr.toUpperCase());
      index += 1;
      options[key] = argv[index];
    }
  }
  return options;
}

const minutes = ms => `${Math.floor(ms / 60000)}m`;

/** The three windows in whole seconds, or the name of the flag that is invalid. */
function parseSeconds(options) {
  const seconds = {};
  for (const key of Object.keys(DEFAULTS)) {
    const value =
      options[key] === undefined ? DEFAULTS[key] : Number(options[key]);
    if (!Number.isInteger(value) || value <= 0) {
      return { invalid: key.replace(/[A-Z]/g, chr => `-${chr.toLowerCase()}`) };
    }
    seconds[key] = value;
  }
  return { seconds };
}

/** One RESULT line and its exit code. */
function render(outcome) {
  const after = minutes(outcome.elapsedMs);
  const lines = {
    [RESULT.GREEN]: [`RESULT: GREEN — ${outcome.detail}`, EXIT.GREEN],
    [RESULT.RED]: [`RESULT: RED — ${outcome.detail}`, EXIT.RED],
    [RESULT.NO_CI]: [
      `RESULT: NO CI — the repo has no workflows and no required checks, and nothing registered within ${Math.round(
        outcome.elapsedMs / 1000
      )}s`,
      EXIT.GREEN,
    ],
    [RESULT.NO_CHECKS]: [
      `RESULT: NO CHECKS — nothing ran within ${after} (${outcome.detail})`,
      EXIT.NO_CHECKS,
    ],
    [RESULT.TIMED_OUT]: [
      `RESULT: TIMED OUT after ${after} — ${outcome.detail}`,
      EXIT.TIMED_OUT,
    ],
  };
  return lines[outcome.result];
}

/** The progress header on stderr: what is gated, and how long it may wait. */
function announce(label, seconds, hasCi) {
  if (!hasCi) {
    process.stderr.write(
      `checks-gate ${label}: no CI in this repo — waiting ${seconds.noCiGrace}s for an app check\n`
    );
  }
  process.stderr.write(
    `checks-gate ${label}: every ${seconds.poll}s, up to ${minutes(
      seconds.timeout * 1000
    )}\n`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Not EXIT.GREEN: this is a gate, and `cli.js --help && gh pr merge` must
  // not merge. Exit 0 means the checks are green, or the repo has no CI at
  // all — nothing else.
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.USAGE;
  }
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(options.repo || '') ||
    !/^\d+$/.test(options.pr || '')
  ) {
    process.stderr.write(
      `--repo <owner/name> and --pr <number> are required\n\n${USAGE}\n`
    );
    return EXIT.USAGE;
  }
  const { seconds, invalid } = parseSeconds(options);
  if (invalid) {
    process.stderr.write(
      `--${invalid} must be a positive whole number of seconds\n`
    );
    return EXIT.USAGE;
  }

  const label = `${options.repo}#${options.pr}`;
  const hasCi = await readRepoHasCi(options.repo, options.pr);
  announce(label, seconds, hasCi);
  const outcome = await waitForChecks({
    read: () => readChecks(options.repo, options.pr),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: () => Date.now(),
    pollMs: seconds.poll * 1000,
    registerTimeoutMs: seconds.registerTimeout * 1000,
    timeoutMs: seconds.timeout * 1000,
    hasCi,
    noCiGraceMs: seconds.noCiGrace * 1000,
    onProgress: read => {
      if (read.state !== 'green') {
        process.stderr.write(`  ${read.state}: ${read.detail}\n`);
      }
    },
  });

  const [line, code] = render(outcome);
  process.stdout.write(`${line}\n`);
  return code;
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    process.stderr.write(`${error.stack || error.message || String(error)}\n`);
    process.exit(EXIT.INTERNAL);
  });
