'use strict';

const {
  classifyMergeCommand,
  looksLikeMerge,
  REASON,
} = require('../lib/merge-gate.js');

const allowed = cmd => classifyMergeCommand(cmd).allow;
const reasonFor = cmd => classifyMergeCommand(cmd).reason;

describe('commands that are not merges at all', () => {
  // The gate sits in front of EVERY Bash call, so a false positive here is a
  // broken session, not an inconvenience.
  it.each([
    'ls -la',
    'git merge origin/master',
    'gh pr create --title x --body y',
    'gh pr checks 131 -R o/r --watch',
    'gh pr view 131 --json mergeable,mergeStateStatus',
    'gh pr list --state open',
    'npm test',
    'git log --oneline -1 && echo done',
    'node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo o/r --pr 131',

    // Mentioning the words in prose (a commit message, a heredoc) is not a merge.
    'git commit -m "document why gh pr merge --auto is banned"',
  ])('allows %s', cmd => {
    expect(looksLikeMerge(cmd)).toBe(false);
    expect(allowed(cmd)).toBe(true);
  });
});

describe('the three incidents this hook exists for', () => {
  it('refuses the bare merge that shipped loom#131 and mood-layer#111 (2026-09-08)', () => {
    const cmd =
      'gh pr merge 131 -R Tessellate-Studio/loom --squash --delete-branch';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses --auto, which merged five alate PRs in 1-2s (2026-08-24)', () => {
    const cmd = 'gh pr merge 267 --squash --auto';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.AUTO_FLAG);
  });

  it('refuses the pipe trap that merged forge#22 past a red Security Scan (2026-07-25)', () => {
    const cmd = 'gh pr checks 22 --watch | tail -5 && gh pr merge 22 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('explains the pipe trap rather than just refusing', () => {
    const { detail } = classifyMergeCommand(
      'gh pr checks 22 --watch | tail && gh pr merge 22'
    );
    expect(detail).toMatch(/piped/i);
    expect(detail).toMatch(/>\/dev\/null/);
  });
});

describe('the two sanctioned routes', () => {
  it('allows the safe-merge CLI', () => {
    const cmd =
      'node "${CLAUDE_PLUGIN_ROOT}/tools/safe-merge/cli.js" --repo Tessellate-Studio/alate ' +
      '--pr 42 --source crash-monitor --what "null guard" --declare guard';
    expect(allowed(cmd)).toBe(true);
    expect(reasonFor(cmd)).toBe(REASON.SAFE_MERGE);
  });

  it('allows safe-merge invoked by an absolute Windows path', () => {
    const cmd =
      'node "C:/Users/x/.claude/plugins/cache/tessellate-forge/forge/0.12.7/tools/safe-merge/cli.js" ' +
      '--repo o/r --pr 1 --source status-check --what "x" --declare guard';
    expect(allowed(cmd)).toBe(true);
  });

  it('allows the documented gated watch', () => {
    const cmd =
      'gh pr checks 131 -R o/r --watch >/dev/null && gh pr merge 131 -R o/r --squash';
    expect(allowed(cmd)).toBe(true);
    expect(reasonFor(cmd)).toBe(REASON.GATED_WATCH);
  });

  it('allows a gated watch with extra steps after the merge', () => {
    const cmd =
      'gh pr checks 5 --watch >/dev/null && gh pr merge 5 --squash --delete-branch && git pull';
    expect(allowed(cmd)).toBe(true);
  });
});

describe('the checks-gate CLI as the gate', () => {
  // `gh pr checks --watch` exits non-zero on a network blip or before any check
  // has registered, so it reads as red when nothing failed (alate#752, #791).
  // checks-gate polls bucket state instead, and must be accepted in its place.
  const GATE =
    'node "${CLAUDE_PLUGIN_ROOT}/tools/checks-gate/cli.js" --repo o/r --pr 131';

  it('allows checks-gate gating the merge with &&', () => {
    const cmd = `${GATE} && gh pr merge 131 -R o/r --squash`;
    expect(allowed(cmd)).toBe(true);
    expect(reasonFor(cmd)).toBe(REASON.GATED_CHECKS);
  });

  it('allows it by absolute Windows path', () => {
    const cmd =
      'node "C:/Users/x/.claude/plugins/cache/tessellate-forge/forge/0.15.0/tools/checks-gate/cli.js" ' +
      '--repo o/r --pr 1 && gh pr merge 1 -R o/r --squash';
    expect(allowed(cmd)).toBe(true);
  });

  it('allows it by an unquoted path', () => {
    const cmd =
      'node tools/checks-gate/cli.js --repo o/r --pr 1 && gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(true);
  });

  it('refuses it piped — `&&` would test the pipe, not the gate', () => {
    const cmd = `${GATE} | tail -3 && gh pr merge 131 --squash`;
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses it AFTER the merge', () => {
    const cmd = `gh pr merge 131 --squash && ${GATE}`;
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses a command that only mentions the path', () => {
    const cmd = 'echo "tools/checks-gate/cli.js" && gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses node running something else that mentions the path', () => {
    const cmd =
      'node -e "console.log(\'tools/checks-gate/cli.js\')" && gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });
});

describe('control flow that severs the gate', () => {
  it('refuses `;` — the merge runs regardless of the check', () => {
    const cmd = 'gh pr checks 1 --watch >/dev/null ; gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNPARSEABLE);
  });

  it('refuses `||` — that merges BECAUSE the check failed', () => {
    const cmd = 'gh pr checks 1 --watch >/dev/null || gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNPARSEABLE);
  });

  it('refuses a watch that comes AFTER the merge', () => {
    const cmd = 'gh pr merge 1 --squash && gh pr checks 1 --watch >/dev/null';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses `gh pr checks` without --watch — it returns immediately', () => {
    const cmd = 'gh pr checks 1 >/dev/null && gh pr merge 1 --squash';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('refuses --admin, which exists to bypass requirements', () => {
    const cmd =
      'gh pr checks 1 --watch >/dev/null && gh pr merge 1 --squash --admin';
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.ADMIN_FLAG);
  });
});

describe('the other two spellings of a merge', () => {
  it('refuses a raw REST merge', () => {
    const cmd =
      'gh api --method PUT repos/Tessellate-Studio/loom/pulls/131/merge';
    expect(looksLikeMerge(cmd)).toBe(true);
    expect(allowed(cmd)).toBe(false);
  });

  it('refuses a GraphQL mergePullRequest mutation', () => {
    const cmd =
      'gh api graphql -f query=\'mutation { mergePullRequest(input:{pullRequestId:"X"}) { clientMutationId } }\'';
    expect(looksLikeMerge(cmd)).toBe(true);
    expect(allowed(cmd)).toBe(false);
  });

  it('allows a REST merge that is properly gated', () => {
    const cmd =
      'gh pr checks 131 --watch >/dev/null && gh api --method PUT repos/o/r/pulls/131/merge';
    expect(allowed(cmd)).toBe(true);
  });

  it('does not mistake an unrelated /merge path read for a merge', () => {
    expect(looksLikeMerge('gh api repos/o/r/pulls/131 --jq .mergeable')).toBe(
      false
    );
  });
});

describe('gh invoked with global flags before the subcommand', () => {
  it('still sees the merge', () => {
    const cmd = 'gh --repo Tessellate-Studio/loom pr merge 131 --squash';
    expect(looksLikeMerge(cmd)).toBe(true);
    expect(allowed(cmd)).toBe(false);
  });
});

describe('heredoc bodies are DATA, not command position', () => {
  // The flag spelling is assembled rather than written literally, so this test
  // file does not itself trip a scan looking for it.
  const AUTO = `--${'auto'}`;
  const MERGE = 'gh pr merge';

  it('allows a commit message that mentions the banned flag', () => {
    // Not hypothetical: this exact shape was refused on 2026-09-09, and the
    // commit it blocked was the one REMOVING that flag from four skills.
    const cmd = `git commit -q -F - <<'MSGEOF'\nfix: stop using ${MERGE} --squash ${AUTO}\nMSGEOF`;
    expect(allowed(cmd)).toBe(true);
  });

  it('allows a PR body that mentions it', () => {
    const cmd = `gh pr create --body "$(cat <<BODYEOF\nnever run ${MERGE} ${AUTO}\nBODYEOF\n)"`;
    expect(allowed(cmd)).toBe(true);
  });

  it('allows an INDENTED terminator under the <<- form', () => {
    // `<<-` strips leading tabs, so its terminator may be indented. Anchoring
    // every terminator to column 0 re-broke this case once already.
    const cmd = `git commit -F - <<-EOT\n\t${MERGE} 1\n\tEOT`;
    expect(allowed(cmd)).toBe(true);
  });

  it('still catches a real merge AFTER a heredoc closes', () => {
    const cmd = `cat <<'EOF' > f.txt\nhello\nEOF\n${MERGE} 5 --squash`;
    expect(allowed(cmd)).toBe(false);
    expect(reasonFor(cmd)).toBe(REASON.UNGATED);
  });

  it('still catches the banned flag outside a heredoc', () => {
    expect(reasonFor(`${MERGE} 5 ${AUTO}`)).toBe(REASON.AUTO_FLAG);
  });
});

describe('input hygiene', () => {
  it.each([undefined, null, '', 42, {}])('treats %p as not-a-merge', value => {
    expect(looksLikeMerge(value)).toBe(false);
  });
});
