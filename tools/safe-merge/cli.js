#!/usr/bin/env node
// The only way an automation merges a PR in a Tessellate repo.
//
// WHY THIS EXISTS. Two failures, both with a written history:
//
// 1. `gh pr merge --squash --auto` does not wait for CI here. GitHub's
//    auto-merge blocks only on REQUIRED status checks, and these repos are
//    private on the free tier, so `gh api repos/<r>/branches/<b>/protection`
//    403s with "Upgrade to GitHub Pro" and nothing can ever be required.
//    `--auto` then merges instantly, before CI starts, with the identical
//    success message it gives when it genuinely waited. On 2026-08-24 five
//    alate PRs each merged 1-2s after `--auto` with CI still queued. The
//    checks are not missing — alate runs nine of them and they pass — they
//    were simply never waited for. This command waits.
//
// 2. Appending the litmus auto-ship-log row was a CRITICAL-RULES-level prose
//    obligation, and prose obligations get skipped: 2 of the 4 crash-monitor
//    PRs merged into alate on 2026-09-01/03 have no row. So the append happens
//    here, as a consequence of merging rather than a thing to remember.
//
// There is NO `--auto` code path and no `--force`. A gate the caller can
// decline to invoke is not a gate, which is why this performs the merge
// itself rather than returning a verdict for someone to honour.
//
// No commander, no chalk, no dependency beyond Node. This runs by absolute
// path out of a plugin cache; every `require` of a package is a way for it to
// fail somewhere the caller cannot see.

'use strict';

const { spawn } = require('child_process');
const {
  routeFix,
  summariseChecks,
  classifyFiles,
  detectDependencyChanges,
  isRevertOfAutoFix,
} = require('./lib/route');

const EXIT = {
  MERGED: 0,
  INTERNAL: 1,
  USAGE: 2,
  REFUSED: 10,
  MERGED_LOG_FAILED: 11,
};

const COOLDOWN_DAYS = 14;
const LEDGER_REPO = 'Tessellate-Studio/litmus';
const LEDGER_PATH = 'auto-ship-log.md';

const REQUIRED_FLAGS = ['repo', 'pr', 'source', 'what', 'declare'];

const USAGE = `safe-merge — merge an automated fix only when the checks that exist have passed

  --repo     <owner/name>        required
  --pr       <number>            required
  --source   <skill name>        required  (crash-monitor, status-check, ...)
  --what     <one line>          required  (for the auto-ship log)
  --declare  guard|rewrite       required  (see "declaration ratchet" in lib/route.js)
  --why      <free text>         optional  (recorded, never routed on)
  --dry-run                      optional  (print the verdict, merge nothing)

Exit: 0 merged · 10 refused · 11 merged but the log append failed · 2 usage · 1 internal`;

// ---------------------------------------------------------------------------
// Process plumbing
// ---------------------------------------------------------------------------

/**
 * Run a command, capturing stdout. `shell: false` on purpose — but note that
 * on Windows this means the target must be a real executable, not a `.cmd`
 * shim (`npm` is `npm.cmd` and would ENOENT here; `gh` and `git` are .exe).
 * An ENOENT is reported as a distinct failure so an environment problem never
 * reads as a property of the fix being judged.
 */
function run(command, args, input) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      resolve({
        ok: false,
        code: null,
        stdout: '',
        stderr: String(error.message),
      });
    });
    child.on('close', code => {
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

const gh = (args, input) => run('gh', args, input);

// ---------------------------------------------------------------------------
// Observers. Each returns {status, detail} and decides nothing.
// ---------------------------------------------------------------------------

/** CI. Fetch only — the bucket-to-status rules live in summariseChecks, where they are tested. */
async function observeCi(repo, pr) {
  const result = await gh([
    'pr',
    'checks',
    String(pr),
    '-R',
    repo,
    '--json',
    'name,bucket',
  ]);
  if (!result.ok && !result.stdout) {
    const detail = result.stderr || 'gh pr checks failed';
    return {
      status: 'unknown',
      detail: `gh-unavailable: ${detail}`.slice(0, 200),
    };
  }
  let checks;
  try {
    checks = JSON.parse(result.stdout);
  } catch (error) {
    return { status: 'unknown', detail: 'could not parse gh pr checks output' };
  }
  return summariseChecks(checks);
}

/**
 * Cooldown, read from the server's commit history rather than a ledger.
 * A ledger has to be written and the writer kept forgetting; a revert cannot
 * fail to record itself. Reading from GitHub rather than a local checkout also
 * means no `git fetch` and no dependence on a clone existing.
 */
async function observeCooldown(repo, paths) {
  if (!paths.length) {
    return { status: 'unknown', detail: 'no paths to check' };
  }
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86400000).toISOString();
  const subjects = [];
  for (const path of paths) {
    const query = `repos/${repo}/commits?since=${since}&path=${encodeURIComponent(
      path
    )}`;
    const result = await gh(['api', query, '--jq', '.[].commit.message']);
    if (!result.ok) {
      return {
        status: 'unknown',
        detail: `commit history unreadable: ${result.stderr}`.slice(0, 200),
      };
    }
    subjects.push(...result.stdout.split('\n').filter(Boolean));
  }
  if (isRevertOfAutoFix(subjects)) {
    const hit = subjects.find(subject =>
      /^revert[\s"':]/i.test(subject.trim())
    );
    return {
      status: 'active',
      detail: `revert in last ${COOLDOWN_DAYS}d: ${hit.slice(0, 80)}`,
    };
  }
  return {
    status: 'clear',
    detail: `no revert touching these paths in ${COOLDOWN_DAYS}d (${subjects.length} commits scanned)`,
  };
}

/** Diff facts. Line counts are production-only, so a big test file never fails the shape check. */
async function observeDiff(repo, pr) {
  const result = await gh([
    'pr',
    'view',
    String(pr),
    '-R',
    repo,
    '--json',
    'files',
  ]);
  if (!result.ok) {
    return null;
  }
  let files;
  try {
    files = JSON.parse(result.stdout).files || [];
  } catch (error) {
    return null;
  }
  const classified = classifyFiles(files.map(file => file.path));
  const production = new Set(classified.production);
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const file of files) {
    const path = String(file.path).replace(/\\/g, '/').replace(/^\.\//, '');
    if (production.has(path)) {
      linesAdded += file.additions || 0;
      linesRemoved += file.deletions || 0;
    }
  }
  return {
    productionFiles: classified.production,
    testFiles: classified.test,
    docFiles: classified.doc,
    ...detectDependencyChanges(classified.production),
    linesAdded,
    linesRemoved,
  };
}

// ---------------------------------------------------------------------------
// The auto-ship log
// ---------------------------------------------------------------------------

function insertLedgerRow(markdown, row) {
  const lines = markdown.split('\n');
  let last = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\|\s*20\d\d-\d\d-\d\d\s*\|/.test(lines[index])) {
      last = index;
    }
  }
  if (last === -1) {
    return null;
  }
  lines.splice(last + 1, 0, row);
  return lines.join('\n');
}

async function appendLedgerRow(row) {
  const read = await gh([
    'api',
    `repos/${LEDGER_REPO}/contents/${LEDGER_PATH}`,
  ]);
  if (!read.ok) {
    return {
      ok: false,
      detail: read.stderr || 'could not read the auto-ship log',
    };
  }
  let current;
  try {
    current = JSON.parse(read.stdout);
  } catch (error) {
    return { ok: false, detail: 'could not parse the auto-ship log response' };
  }
  const markdown = Buffer.from(current.content, 'base64').toString('utf8');
  const updated = insertLedgerRow(markdown, row);
  if (updated === null) {
    return {
      ok: false,
      detail: 'no dated table row found — the log format changed',
    };
  }
  const body = JSON.stringify({
    message: 'chore(auto-ship-log): record an automated merge',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha: current.sha,
    branch: 'main',
  });
  const write = await gh(
    [
      'api',
      `repos/${LEDGER_REPO}/contents/${LEDGER_PATH}`,
      '-X',
      'PUT',
      '--input',
      '-',
    ],
    body
  );
  return write.ok
    ? { ok: true }
    : { ok: false, detail: write.stderr || 'PUT failed' };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const FOOTER = [
  'This says the fix passed the checks that exist. It does not say the fix is',
  'correct — no test here covered the crash being fixed, which is why it',
  'reached production.',
].join('\n');

function renderVerdict(verdict, options) {
  const width = Math.max(...verdict.checks.map(check => check.name.length));
  const rows = verdict.checks.map(
    check =>
      `  ${check.name.padEnd(width)}  ${check.status.padEnd(7)}  ${
        check.evidence
      }`
  );
  const head = `safe-merge ${options.repo}#${options.pr} — ${
    verdict.route === '4a' ? 'MERGE' : 'REFUSE'
  }`;
  const why = options.why
    ? [`  declared: ${options.declare} — ${options.why}`]
    : [];
  return [head, '', ...rows, ...why].join('\n');
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      options.dryRun = true;
    } else if (token === '--help' || token === '-h') {
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

function usageError(message) {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  return EXIT.USAGE;
}

/**
 * Merge, then record. The append is a consequence of merging rather than a
 * thing the caller has to remember, and its failure gets its own exit code —
 * a merged PR with no breadcrumb is a different situation from a refusal, and
 * the two must not be reported the same way.
 */
async function mergeAndRecord(options) {
  const merge = await gh([
    'pr',
    'merge',
    String(options.pr),
    '-R',
    options.repo,
    '--squash',
  ]);
  if (!merge.ok) {
    process.stderr.write(`\nmerge failed: ${merge.stderr}\n`);
    return EXIT.REFUSED;
  }
  process.stdout.write(`\nMerged ${options.repo}#${options.pr}.\n`);

  const today = new Date().toISOString().slice(0, 10);
  const prLink = `[#${options.pr}](https://github.com/${options.repo}/pull/${options.pr})`;
  const repoName = options.repo.split('/').pop();
  const note = options.why ? `${options.what} — ${options.why}` : options.what;
  const row = `| ${today} | ${options.source} | ${repoName} | ${prLink} | ${note} | safe-merge |`;

  const logged = await appendLedgerRow(row);
  if (!logged.ok) {
    process.stderr.write(
      `\nAUTO-SHIP LOG APPEND FAILED: ${logged.detail}\n` +
        'The merge happened and the breadcrumb is MISSING. Add this row by hand:\n' +
        `${row}\n`
    );
    process.stdout.write(`\n${FOOTER}\n`);
    return EXIT.MERGED_LOG_FAILED;
  }
  process.stdout.write(`Auto-ship log updated.\n\n${FOOTER}\n`);
  return EXIT.MERGED;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.MERGED;
  }
  const missing = REQUIRED_FLAGS.filter(flag => !options[flag]);
  if (missing.length) {
    return usageError(
      `missing required flag(s): ${missing.map(flag => `--${flag}`).join(', ')}`
    );
  }
  if (options.declare !== 'guard' && options.declare !== 'rewrite') {
    return usageError('--declare must be exactly "guard" or "rewrite"');
  }

  const diff = await observeDiff(options.repo, options.pr);
  const [ci, cooldown] = await Promise.all([
    observeCi(options.repo, options.pr),
    observeCooldown(options.repo, diff ? diff.productionFiles : []),
  ]);
  const verdict = routeFix({
    diff,
    ci,
    cooldown,
    declaredClass: options.declare,
  });

  process.stdout.write(`${renderVerdict(verdict, options)}\n`);

  if (verdict.route === '4b') {
    process.stdout.write('\nRefused. The PR stays open for a human.\n');
    return EXIT.REFUSED;
  }
  if (options.dryRun) {
    process.stdout.write('\n--dry-run: would merge. Nothing was changed.\n');
    return EXIT.MERGED;
  }

  return mergeAndRecord(options);
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    process.stderr.write(`${error.stack || error.message || String(error)}\n`);
    process.exit(EXIT.INTERNAL);
  });
