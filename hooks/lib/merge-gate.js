/**
 * Decide whether a shell command the model is about to run is an UNGATED merge.
 *
 * WHY THIS EXISTS. `tools/safe-merge/cli.js` says it in its own header: "A gate
 * the caller can decline to invoke is not a gate." That is true of safe-merge
 * itself. Until this file existed, forge wired only SessionStart hooks — all
 * informational — so "never merge by any route other than the confidence
 * command" was a prose obligation, and prose obligations get skipped. Measured:
 *
 *   - 2026-08-24, alate: five PRs merged 1-2s after `gh pr merge --auto`, CI
 *     still queued. `--auto` waits only on REQUIRED checks and these repos are
 *     private on the free tier, so nothing can ever be required.
 *   - 2026-07-25, forge PR #22: merged past a RED Security Scan through
 *     `gh pr checks --watch | tail && gh pr merge` — the pipe hands `&&` tail's
 *     exit status, not the checks'.
 *   - 2026-09-08: the session that wrote this hook merged two PRs with a bare
 *     `gh pr merge --squash`. Checks were green and were read first, so the
 *     outcome was right — but nothing verified that, which is the point.
 *
 * All three are shapes this classifier refuses.
 *
 * Pure and synchronous: the caller supplies the command string. A false DENY
 * costs one retry through a sanctioned route; a false ALLOW ships unverified
 * code. Every ambiguous construct below therefore resolves to deny.
 */

'use strict';

/** Verdict reasons, exported so the tests bind to constants rather than prose. */
const REASON = {
  NOT_A_MERGE: 'not-a-merge',
  SAFE_MERGE: 'safe-merge',
  GATED_WATCH: 'gated-watch',
  GATED_CHECKS: 'gated-checks',
  UNGATED: 'ungated',
  AUTO_FLAG: 'auto-flag',
  ADMIN_FLAG: 'admin-flag',
  UNPARSEABLE: 'unparseable-control-flow',
};

// A merge can be spelled three ways against the GitHub API. Blocking only the
// obvious one would move the problem rather than solve it.
const GH_PR_MERGE = /\bgh\s+(?:[^|&;]*?\s)?pr\s+merge\b/;
const GH_API = /\bgh\s+api\b/;
const GH_API_GRAPHQL = /\bgh\s+api\s+graphql\b/;
const REST_MERGE_PATH = /\/pulls\/\d+\/merge\b/;
const GRAPHQL_MERGE_MUTATION = /\bmergePullRequest\b/;

/** safe-merge performs the merge itself, via spawn('gh', …) inside the CLI. */
const SAFE_MERGE_INVOCATION = /safe-merge[/\\]cli\.js/;

/**
 * Blank the CONTENTS of heredoc bodies, keeping the delimiters.
 *
 * A heredoc body is DATA, never command position — it is a commit message, a PR
 * body, a file being written. Without this, writing *about* a banned command
 * blocks the very commit that bans it: this function exists because
 * `git commit -F - <<'EOF' … gh pr merge --squash --auto … EOF` was refused by
 * this hook on 2026-09-09, and that commit's whole purpose was removing that
 * flag from four skills.
 *
 * Handles `<<DELIM`, `<<'DELIM'`, `<<"DELIM"` and `<<-DELIM`. The terminator
 * must be alone on its line, which is what the shell requires anyway.
 *
 * @param {string} text
 * @returns {string}
 */
function stripHeredocBodies(text) {
  // Two passes, because the two forms terminate differently and the shell is
  // strict about it. `<<-DELIM` strips leading TABS, so its terminator may be
  // indented; plain `<<DELIM` requires the terminator at column 0. Matching the
  // shell's own rule keeps this from blanking text the shell would execute.
  return (
    text

      // `<<-DELIM` … indented terminator permitted
      .replace(
        /(<<-\s*)(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2[\s\S]*?^[ \t]*\3$/gm,
        (_m, opener, quote, delim) =>
          `${opener}${quote}${delim}${quote}\n${delim}`
      )

      // `<<DELIM` … terminator must start the line
      .replace(
        /(<<\s*)(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2[\s\S]*?^\3$/gm,
        (_m, opener, quote, delim) =>
          `${opener}${quote}${delim}${quote}\n${delim}`
      )
  );
}

/**
 * Blank the CONTENTS of quoted spans, keeping the quotes so token structure
 * survives. Command words are then whatever sits outside quotes.
 *
 * This exists because a commit message or a doc edit legitimately contains the
 * text `gh pr merge` — this very hook's PR does — and blocking those would make
 * the gate something to route around rather than something to satisfy. Matching
 * command position instead of raw substring is what keeps it credible.
 *
 * Heredocs are stripped FIRST: their bodies routinely contain unbalanced quotes
 * (an apostrophe in prose), which would otherwise desynchronise the quote
 * scanner for the rest of the command.
 *
 * Deliberately blunt about escaped quotes: over-stripping hides a merge only
 * when the whole command is quoted, which is not runnable anyway, whereas
 * under-stripping produces the false positives this is here to remove.
 *
 * @param {string} text
 * @returns {string}
 */
function stripQuotedSpans(text) {
  return stripHeredocBodies(text)
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""');
}

/**
 * `gh pr checks … --watch` with its OWN exit status intact. `--watch` alone is
 * not enough: it must be the thing `&&` tests.
 */
const CHECKS_WATCH = /\bgh\s+pr\s+checks\b/;
const WATCH_FLAG = /(?:^|\s)--watch\b/;

/**
 * `node <path>/checks-gate/cli.js …` — the preferred gate, because `--watch`'s
 * exit code also reads a network blip or not-yet-registered checks as red
 * (tools/checks-gate/lib/gate.js). Matched on the RAW segment, since the path
 * is usually quoted ("${CLAUDE_PLUGIN_ROOT}/…"), but only as node's FIRST
 * argument: `echo "…checks-gate/cli.js"` or `node -e "…checks-gate/cli.js…"`
 * mention the path without running the gate.
 */
const CHECKS_GATE_INVOCATION =
  /^node\s+(?:"[^"]*checks-gate[/\\]cli\.js"|'[^']*checks-gate[/\\]cli\.js'|[^\s"'|]*checks-gate[/\\]cli\.js)(?=\s|$)/;

/**
 * Does this command attempt a merge at all? Kept separate so the caller can
 * fail CLOSED on a classifier error only for commands that are merge-shaped,
 * rather than blocking every Bash call if something here throws.
 *
 * @param {string} command
 * @returns {boolean}
 */
function looksLikeMerge(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return false;
  }

  // The safe-merge path may itself be quoted ("${CLAUDE_PLUGIN_ROOT}/…"), so it
  // is matched against the raw string. It counts as a merge attempt so that the
  // classifier can report WHY it was allowed rather than shrugging at it.
  if (SAFE_MERGE_INVOCATION.test(command)) {
    return true;
  }

  // Everything else must appear at command position — outside quotes — while
  // the payloads it carries (a REST path, a GraphQL mutation) are inherently
  // inside quotes and so are matched against the raw string.
  const bare = stripQuotedSpans(command);
  return (
    GH_PR_MERGE.test(bare) ||
    (GH_API.test(bare) && REST_MERGE_PATH.test(command)) ||
    (GH_API_GRAPHQL.test(bare) && GRAPHQL_MERGE_MUTATION.test(command))
  );
}

/**
 * Split on top-level `&&`, leaving other operators in place so the caller can
 * detect them. Deliberately naive about quoting and subshells: anything it
 * cannot read confidently is reported and denied rather than guessed at.
 *
 * @param {string} command
 * @returns {string[]}
 */
function splitOnAnd(command) {
  return command.split(/&&/).map(segment => segment.trim());
}

/**
 * Flags and sequencing that disqualify a command before its structure is even
 * read. Split out of classifyMergeCommand only to keep that function within the
 * repo's 50-line ceiling; the order here is still load-bearing.
 *
 * @param {string} bare  the command with quoted spans blanked
 * @returns {{allow: boolean, reason: string, detail?: string} | null} null = nothing disqualifying
 */
function disqualifyingForm(bare) {
  // --auto is never correct in this org. GitHub's auto-merge blocks only on
  // REQUIRED checks; the private repos cannot have any, so it merges on the
  // spot while reporting the same success as a genuine wait. There is no
  // gated form of this flag — refuse it before looking at anything else.
  if (/(?:^|\s)--auto\b/.test(bare)) {
    return {
      allow: false,
      reason: REASON.AUTO_FLAG,
      detail:
        '`--auto` waits only on REQUIRED status checks. Every private repo here is on ' +
        'GitHub Free, where branch protection 403s, so nothing can ever be required and ' +
        '`--auto` merges immediately — with the identical success message it gives when it ' +
        'genuinely waited (alate, 2026-08-24: five PRs merged 1-2s after the call).',
    };
  }

  // --admin bypasses whatever protection does exist. A gate with a documented
  // bypass flag is not a gate.
  if (/(?:^|\s)--admin\b/.test(bare)) {
    return {
      allow: false,
      reason: REASON.ADMIN_FLAG,
      detail: '`--admin` exists to bypass merge requirements. Remove it.',
    };
  }

  // Beyond this point the only permissible shape is a gated watch, and that
  // requires reading the control flow. `;` and `||` both sever the gate: `;`
  // runs the merge regardless of the check's outcome, and `||` runs it
  // precisely WHEN the check failed. Neither has a legitimate reading here.
  if (/;|\|\|/.test(bare)) {
    return {
      allow: false,
      reason: REASON.UNPARSEABLE,
      detail:
        'The merge is sequenced with `;` or `||`, so it does not depend on the check passing ' +
        '(`||` would run it *because* the check failed). Use a single `&&`.',
    };
  }

  return null;
}

const PIPED_GATE_DETAIL =
  'The check is piped, so `&&` tests the LAST command in the pipe, not the checks — ' +
  '`| tail` succeeds even when a check is red (forge PR #22 merged past a red Security ' +
  'Scan this way). Gate on the command itself, never a pipe: `node …/checks-gate/cli.js ' +
  '--repo R --pr N && …`, or redirect: `gh pr checks N --watch >/dev/null && …`.';

/**
 * The last question, once nothing disqualifying is present: is the merge
 * actually gated on a check whose exit status `&&` will test?
 *
 * @param {string} command  raw, so quoted REST/GraphQL payloads stay visible
 * @param {string} bare     quoted spans blanked, so structure is readable
 * @returns {{allow: boolean, reason: string, detail?: string}}
 */
function gatedWatchVerdict(command, bare) {
  // Two aligned views of the same pipeline: raw segments carry the quoted
  // payloads that identify a REST or GraphQL merge, stripped segments carry the
  // structure. They align only while no `&&` hides inside quotes — if the split
  // disagrees, the command is not something to reason about confidently.
  const rawSegments = splitOnAnd(command);
  const bareSegments = splitOnAnd(bare);
  if (rawSegments.length !== bareSegments.length) {
    return { allow: false, reason: REASON.UNPARSEABLE };
  }

  const mergeIndex = rawSegments.findIndex(segment => looksLikeMerge(segment));
  if (mergeIndex === -1) {
    // The merge spans a boundary this splitter cannot see. Refuse rather than guess.
    return { allow: false, reason: REASON.UNPARSEABLE };
  }

  const gateIndex = bareSegments
    .slice(0, mergeIndex)
    .findIndex(
      (segment, index) =>
        CHECKS_GATE_INVOCATION.test(rawSegments[index]) ||
        (CHECKS_WATCH.test(segment) && WATCH_FLAG.test(segment))
    );
  if (gateIndex === -1) {
    return {
      allow: false,
      reason: REASON.UNGATED,
      detail: 'Nothing in this command waits for CI before the merge runs.',
    };
  }

  // The pipe trap, and the reason this is checked rather than assumed:
  // `gh pr checks N --watch | tail && gh pr merge` gives `&&` TAIL's exit
  // status. tail succeeds on a red check, so the merge fires. forge PR #22
  // (2026-07-25) merged past a red Security Scan exactly this way.
  // `>/dev/null` is a redirection, not a pipe, and is the documented form.
  if (/\|/.test(bareSegments[gateIndex])) {
    return { allow: false, reason: REASON.UNGATED, detail: PIPED_GATE_DETAIL };
  }

  const viaChecksGate = CHECKS_GATE_INVOCATION.test(rawSegments[gateIndex]);
  return {
    allow: true,
    reason: viaChecksGate ? REASON.GATED_CHECKS : REASON.GATED_WATCH,
  };
}

/**
 * @param {string} command  the exact shell string the model wants to run
 * @returns {{allow: boolean, reason: string, detail?: string}}
 */
function classifyMergeCommand(command) {
  if (!looksLikeMerge(command)) {
    return { allow: true, reason: REASON.NOT_A_MERGE };
  }

  // safe-merge is the sanctioned automated route. It waits for CI itself and
  // has no --auto or --force path, so nothing further needs checking here.
  if (SAFE_MERGE_INVOCATION.test(command)) {
    return { allow: true, reason: REASON.SAFE_MERGE };
  }

  // Flags and control flow are read at command position too, so a `--auto`
  // mentioned inside a commit message or a PR body is prose, not an argument.
  const bare = stripQuotedSpans(command);

  const disqualified = disqualifyingForm(bare);
  if (disqualified) {
    return disqualified;
  }

  return gatedWatchVerdict(command, bare);
}

/** `gh pr merge` flags that consume the next token as their value. */
const VALUE_FLAGS = new Set([
  '-R',
  '--repo',
  '-t',
  '--subject',
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-A',
  '--author-email',
  '--match-head-commit',
]);

/**
 * Which PR a merge command targets, as far as the command itself says.
 *
 * Used only AFTER classifyMergeCommand allows a merge, to ask a second question
 * (forge#104: does an open device test still verify it?). A field left null
 * means "not stated here" — the caller resolves it from the checkout (origin
 * remote, current branch) or treats it as unknown. Never a guess.
 *
 * @param {string} command
 * @returns {{repo: string|null, pr: string|null, selector: string|null} | null}
 *   null = no target this parser can read (a GraphQL mutation)
 */
function mergeTarget(command) {
  const segment = splitOnAnd(String(command || '')).find(s =>
    looksLikeMerge(s)
  );
  if (!segment) {
    return null;
  }

  const rest = segment.match(/repos\/([\w.-]+\/[\w.-]+)\/pulls\/(\d+)\/merge/);
  if (rest) {
    return { repo: rest[1], pr: rest[2], selector: null };
  }

  // Tokens come from the quote-blanked form, so a quoted --subject counts as
  // one token rather than smearing its words into positional arguments.
  const tokens = stripQuotedSpans(segment).trim().split(/\s+/);
  const start = tokens.findIndex(
    (token, i) => token === 'merge' && tokens[i - 1] === 'pr'
  );
  if (start === -1) {
    return null;
  }

  let repo = null;
  let selector = null;
  for (let i = start + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (/^\d*[<>|]/.test(token)) {
      break; // a redirection (`>/dev/null`, `2>&1`) ends the argument list
    }
    if (token === '-R' || token === '--repo') {
      repo = tokens[i + 1] || null;
      i += 1;
    } else if (token.startsWith('--repo=')) {
      repo = token.slice('--repo='.length);
    } else if (VALUE_FLAGS.has(token)) {
      i += 1;
    } else if (!token.startsWith('-') && token && selector === null) {
      selector = token;
    }
  }

  const url =
    selector && selector.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (url) {
    return { repo: repo || url[1], pr: url[2], selector: null };
  }
  const number = selector && selector.match(/^#?(\d+)$/);
  return {
    repo,
    pr: number ? number[1] : null,
    selector: number ? null : selector,
  };
}

module.exports = { classifyMergeCommand, looksLikeMerge, mergeTarget, REASON };
