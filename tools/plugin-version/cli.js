#!/usr/bin/env node
// plugin-version — exit 0 only when the PR's `.claude-plugin/plugin.json`
// version is strictly above the base branch's CURRENT version.
//
//   node tools/plugin-version/cli.js --base-ref origin/master   # local checkout
//   node tools/plugin-version/cli.js --repo <owner/name> --pr <n> # live, via gh
//
// `--base-ref` compares the working tree (or `--head-ref`) against a git ref;
// fetch the base first so the ref is the current tip. `--repo/--pr` reads both
// from GitHub at call time. lib/bump.js has the incident and the rule.
//
// Exit: 0 bumped, or the base carries no manifest · 10 not bumped · 1 could not
// read · 2 usage.

'use strict';

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MANIFEST_PATH, STATE, checkBump } = require('./lib/bump');
const { checkPrBump } = require('./lib/remote');

const EXIT = { OK: 0, INTERNAL: 1, USAGE: 2, FAIL: 10 };

const USAGE = `plugin-version — exit 0 only when ${MANIFEST_PATH} "version" is above the base's

  --base-ref <ref>              compare against this git ref (fetch it first)
  --head-ref <ref>              head side for --base-ref   (default: the working tree)
  --repo <owner/name> --pr <n>  compare the PR's head with its base's current tip, via gh

Exit: 0 bumped (or no manifest on the base) · 10 not bumped · 1 could not read · 2 usage`;

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      options.help = true;
    } else if (token.startsWith('--')) {
      options[token.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] =
        argv[(i += 1)];
    }
  }
  return options;
}

/** The manifest at a git ref, or null when the ref has no such file. */
const gitManifest = ref =>
  new Promise((resolve, reject) => {
    if (ref === null) {
      const file = path.join(process.cwd(), MANIFEST_PATH);
      resolve(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
      return;
    }
    execFile(
      'git',
      ['show', `${ref}:${MANIFEST_PATH}`],
      { encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          return resolve(stdout);
        }
        if (/does not exist|exists on disk, but not in/.test(stderr)) {
          return resolve(null);
        }
        return reject(new Error(String(stderr).trim() || error.message));
      }
    );
  });

const gh = args =>
  new Promise(resolve => {
    const child = spawn('gh', args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', error =>
      resolve({ stdout: '', stderr: error.message, code: 1 })
    );
    child.on('close', code => resolve({ stdout, stderr, code }));
  });

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.USAGE;
  }

  let outcome;
  if (options.baseRef) {
    try {
      outcome = await checkBump({
        readManifest: ref => gitManifest(ref),
        headRef: options.headRef || null,
        baseRef: options.baseRef,
      });
    } catch (error) {
      outcome = { state: 'error', detail: error.message };
    }
  } else if (
    /^[\w.-]+\/[\w.-]+$/.test(options.repo || '') &&
    /^\d+$/.test(options.pr || '')
  ) {
    outcome = await checkPrBump(gh, options.repo, options.pr);
  } else {
    process.stderr.write(
      `--base-ref, or --repo and --pr, is required\n\n${USAGE}\n`
    );
    return EXIT.USAGE;
  }

  const verdict = {
    [STATE.OK]: ['OK', EXIT.OK],
    [STATE.SKIP]: ['SKIP', EXIT.OK],
    [STATE.FAIL]: ['NOT BUMPED', EXIT.FAIL],
  }[outcome.state] || ['ERROR', EXIT.INTERNAL];
  process.stdout.write(`RESULT: ${verdict[0]} — ${outcome.detail}\n`);
  return verdict[1];
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(EXIT.INTERNAL);
  });
