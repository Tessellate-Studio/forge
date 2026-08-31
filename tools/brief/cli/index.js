#!/usr/bin/env node

// `brief <command...>` — run any command, print a token-cheap summary of its
// output instead of the raw dump. Not git-specific: this wraps whatever
// command is given (git, npm, test runners, build tools, ...).
//
// Rules that keep this safe to use by default:
//  - Non-zero exit → always print the FULL output, never summarized. A
//    failure is exactly the moment you can't afford to lose information.
//  - Zero exit + small output → printed as-is, no summarization overhead.
//  - Zero exit + large output → head/tail kept, middle collapsed to a
//    count; the untouched original is always saved to disk and its path
//    printed, so nothing is ever unrecoverable.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  summarizeOutput,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
} = require('../lib/summarize');

function usage() {
  console.log(`brief <command...> - run a command, print a token-cheap summary of its output

Usage:
  brief <command> [args...]
  brief --full <command> [args...]   # skip summarization, print everything

Env overrides:
  BRIEF_MAX_LINES   max lines to show before truncating (default ${DEFAULT_MAX_LINES})
  BRIEF_MAX_BYTES   max bytes to show before truncating (default ${DEFAULT_MAX_BYTES})

A non-zero exit code always prints the full output — only successful,
large output gets summarized. When output is summarized, the untouched
original is saved to disk and the path is printed so it can be read back.`);
}

function saveLogPath() {
  const dir = path.join(os.tmpdir(), 'forge-brief');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${stamp}-${process.pid}.log`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const forceFull = argv[0] === '--full';
  const rest = forceFull ? argv.slice(1) : argv;

  if (rest.length === 0) {
    usage();
    process.exit(1);
  }

  return { forceFull, command: rest.join(' ') };
}

function printFull(exitCode, stdout, stderr, forceFull) {
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
  console.log(
    forceFull
      ? `[exit ${exitCode}] (--full: not summarized)`
      : `[exit ${exitCode}] (failure: full output shown, not summarized)`
  );
}

function printSummarized(exitCode, stdout, stderr) {
  const maxLines = parseInt(process.env.BRIEF_MAX_LINES, 10) || DEFAULT_MAX_LINES;
  const maxBytes = parseInt(process.env.BRIEF_MAX_BYTES, 10) || DEFAULT_MAX_BYTES;
  const summary = summarizeOutput(stdout, { maxLines, maxBytes });

  if (stdout) {
    process.stdout.write(`${summary.text}${summary.text.endsWith('\n') ? '' : '\n'}`);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }

  if (!summary.truncated) {
    console.log(`[exit ${exitCode}]`);
    return;
  }

  const savedPath = saveLogPath();
  fs.writeFileSync(savedPath, stdout, 'utf8');
  console.log(
    `[exit ${exitCode}] ${summary.totalLines} lines / ${summary.totalBytes} bytes total, ` +
      `${summary.omitted} omitted — full output: ${savedPath}`
  );
}

function main() {
  const { forceFull, command } = parseArgs(process.argv.slice(2));

  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const exitCode = result.status === null ? 1 : result.status;

  console.log(`$ ${command}`);

  if (exitCode !== 0 || forceFull) {
    printFull(exitCode, stdout, stderr, forceFull);
  } else {
    printSummarized(exitCode, stdout, stderr);
  }

  process.exit(exitCode);
}

main();
