'use strict';

const { mergeTarget } = require('../lib/merge-gate.js');

// The sanctioned manual route, exactly as standards/workflows.md spells it.
const gated = merge =>
  `gh pr checks 752 -R Tessellate-Studio/alate --watch >/dev/null && ${merge}`;

describe('mergeTarget — which PR a merge names (forge#104)', () => {
  it('reads the number and repo from the documented form', () => {
    expect(
      mergeTarget(gated('gh pr merge 752 -R Tessellate-Studio/alate --squash'))
    ).toEqual({ repo: 'Tessellate-Studio/alate', pr: '752', selector: null });
  });

  it('takes the PR from the merge, not from the checks before it', () => {
    const cmd =
      'gh pr checks 1 -R o/r --watch >/dev/null && gh pr merge 2 -R o/r --squash';
    expect(mergeTarget(cmd).pr).toBe('2');
  });

  it('reads --repo=, #N and flags in any order', () => {
    expect(mergeTarget('gh pr merge --squash --repo=o/r #41')).toEqual({
      repo: 'o/r',
      pr: '41',
      selector: null,
    });
  });

  it('does not mistake a quoted subject for the PR selector', () => {
    const cmd = 'gh pr merge --subject "fix 99 things" 752 -R o/r --squash';
    expect(mergeTarget(cmd)).toEqual({
      repo: 'o/r',
      pr: '752',
      selector: null,
    });
  });

  it('never reads a redirection as the PR', () => {
    expect(mergeTarget('gh pr merge --squash >/dev/null')).toEqual({
      repo: null,
      pr: null,
      selector: null,
    });
    expect(mergeTarget('gh pr merge --squash 2>&1')).toEqual({
      repo: null,
      pr: null,
      selector: null,
    });
  });

  it('reads a PR URL', () => {
    expect(
      mergeTarget(
        'gh pr merge https://github.com/Tessellate-Studio/loom/pull/131 --squash'
      )
    ).toEqual({ repo: 'Tessellate-Studio/loom', pr: '131', selector: null });
  });

  it('leaves repo and number unstated when the command does not state them', () => {
    expect(mergeTarget('gh pr merge --squash')).toEqual({
      repo: null,
      pr: null,
      selector: null,
    });
    expect(mergeTarget('gh pr merge fix/some-branch --squash')).toEqual({
      repo: null,
      pr: null,
      selector: 'fix/some-branch',
    });
  });

  it('reads the REST merge path', () => {
    expect(
      mergeTarget(
        "gh api -X PUT 'repos/Tessellate-Studio/alate/pulls/752/merge'"
      )
    ).toEqual({ repo: 'Tessellate-Studio/alate', pr: '752', selector: null });
  });

  it('returns null for what it cannot read — never a guess', () => {
    expect(mergeTarget('ls -la')).toBeNull();
    expect(
      mergeTarget(
        "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'"
      )
    ).toBeNull();
  });
});
