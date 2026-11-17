// The plugin-version check for an open PR, read through `gh` at the moment it
// is called: the PR's head commit against its base branch's CURRENT tip.
//
// checks-gate runs this right before a merge, because a green CI run is a
// statement about the base as it was when CI ran. If another PR merged since,
// that run is stale — exactly the forge#183/#184 collision. The `gh` runner is
// injected ({stdout, stderr, code}, never rejecting) so this is testable
// without a network.

'use strict';

const { MANIFEST_PATH, STATE, checkBump } = require('./bump');

/**
 * @param {(args: string[]) => Promise<{stdout: string, stderr: string, code: number}>} gh
 * @param {string} repo owner/name
 * @param {string|number} pr
 * @returns {Promise<{state: string, detail: string}>} STATE.OK / FAIL / SKIP,
 *   or state 'error' when GitHub could not be read (never treated as OK).
 */
async function checkPrBump(gh, repo, pr) {
  const view = await gh([
    'pr',
    'view',
    String(pr),
    '-R',
    repo,
    '--json',
    'headRefOid,baseRefName',
  ]);
  let prInfo;
  try {
    prInfo = JSON.parse(view.stdout);
  } catch {
    return {
      state: 'error',
      detail: `could not read ${repo}#${pr}: ${firstLine(view.stderr)}`,
    };
  }

  const readManifest = async ref => {
    const read = await gh([
      'api',
      '-H',
      'Accept: application/vnd.github.raw',
      `repos/${repo}/contents/${MANIFEST_PATH}?ref=${encodeURIComponent(ref)}`,
    ]);
    if (read.code === 0) {
      return read.stdout;
    }
    if (/HTTP 404/.test(read.stderr)) {
      return null;
    }
    throw new Error(
      `reading ${MANIFEST_PATH}@${ref}: ${firstLine(read.stderr)}`
    );
  };

  try {
    return await checkBump({
      readManifest,
      headRef: prInfo.headRefOid,
      baseRef: prInfo.baseRefName,
    });
  } catch (error) {
    return { state: 'error', detail: error.message };
  }
}

const firstLine = text =>
  String(text || '')
    .trim()
    .split('\n')[0] || 'no output';

module.exports = { STATE, checkPrBump };
