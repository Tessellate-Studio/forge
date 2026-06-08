#!/usr/bin/env bash
# invoke_rubric.sh — wrapper for @ramsaptami/rubric-sdk
#
# Takes a single task's input JSON on stdin and returns the SDK's output
# JSON on stdout. Tries the CLI first, falls back to programmatic API,
# surfaces a structured error if both fail.
#
# Why this wrapper exists:
#   The roadmap-pulse skill calls rubric-sdk per open task. Hand-writing
#   CLI strings on every call (with proper JSON quoting on Windows + Unix)
#   is brittle. This wrapper centralises the invocation so the skill body
#   can stay focused on what to score, not how.
#
# Usage from the skill:
#   echo '<input json>' | bash scripts/invoke_rubric.sh
#
# Input shape (from references/scoring-contract.md):
#   { title, description, context: { goals, dependencies } }
#
# Output shape:
#   { impact, complexity, reusability, strategic, total, band, reasoning }
#
# On any failure, prints a single line of JSON to stdout:
#   { "error": "<reason>", "fallback": "<skip|manual>" }
# and exits non-zero.

set -uo pipefail

INPUT_JSON="$(cat)"

if [[ -z "${INPUT_JSON// }" ]]; then
  echo '{"error":"empty input","fallback":"skip"}'
  exit 1
fi

# --- Attempt 1: programmatic API (preferred — matches the contract) ---
#
# Calls a tiny inline Node script that requires the SDK and invokes
# `evaluateFromContext(input)` — the module-level function added in
# rubric-sdk PR #1 (commit 9ff27f2) that meets this skill's contract
# (4-axis 0-3 scores + total + band + reasoning).
#
# Package-name fallback: the package.json on rubric-sdk's master is
# currently `@company/rubric-sdk`, but the README + this skill use
# `@ramsaptami/rubric-sdk` (which matches the GitHub owner). Try
# both names so this wrapper works regardless of which name is
# installed locally.
if command -v node >/dev/null 2>&1; then
  # NODE_PATH must include npm's global node_modules so a globally-installed
  # rubric-sdk is resolvable by `require()`. Without this, `npm install -g`
  # works but `require('@scope/pkg')` from arbitrary cwd returns
  # "Cannot find module". Capture the global root once and prepend it.
  if command -v npm >/dev/null 2>&1; then
    GLOBAL_NODE_MODULES="$(npm root -g 2>/dev/null)"
    if [[ -n "$GLOBAL_NODE_MODULES" ]]; then
      export NODE_PATH="$GLOBAL_NODE_MODULES${NODE_PATH:+:$NODE_PATH}"
    fi
  fi
  RESULT="$(node -e '
    const input = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    const candidates = ["@tessellate-studio/rubric-sdk", "@ramsaptami/rubric-sdk", "@company/rubric-sdk"];
    let sdk = null;
    let lastErr = null;
    for (const name of candidates) {
      try { sdk = require(name); break; }
      catch (e) { lastErr = e; }
    }
    if (!sdk) {
      console.error("rubric-sdk not installed under any expected name: " + candidates.join(", "));
      process.exit(3);
    }
    if (typeof sdk.evaluateFromContext !== "function") {
      console.error("rubric-sdk is installed but does not export evaluateFromContext (need PR #1 or later)");
      process.exit(3);
    }
    try {
      const out = sdk.evaluateFromContext(input);
      console.log(JSON.stringify(out));
      process.exit(0);
    } catch (e) {
      console.error(e.message || String(e));
      process.exit(2);
    }
  ' 2>/dev/null <<< "$INPUT_JSON")"
  RC=$?
  if [[ $RC -eq 0 && -n "$RESULT" ]]; then
    echo "$RESULT"
    exit 0
  fi
fi

# --- Attempt 2: CLI fallback ---
#
# Some installs only expose the CLI. Try the non-interactive batch mode if
# rubric-sdk supports it. We pipe stdin so the SDK can consume the input
# JSON without us needing to know about its argv shape.
if command -v rubric >/dev/null 2>&1; then
  RESULT="$(echo "$INPUT_JSON" | rubric evaluate --json --no-interactive 2>/dev/null)"
  RC=$?
  if [[ $RC -eq 0 && -n "$RESULT" ]]; then
    echo "$RESULT"
    exit 0
  fi
fi

# --- Both paths failed — surface a structured error ---
#
# The skill catches this and falls back per references/scoring-contract.md
# (skip-and-surface — Step 2 + Step 3 still produce a defensible ranking
# without scoring).
echo '{"error":"rubric-sdk unavailable or both invocation paths failed. Install via npm or check the SDK contract in references/scoring-contract.md.","fallback":"skip"}'
exit 4
