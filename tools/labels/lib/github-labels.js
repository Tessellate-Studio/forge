// The label-only GitHub calls bootstrap needs to merge a duplicate label and
// retire one (RFD 005 §4). Kept OUT of backlog-migrate's github.js on
// purpose: that module has no delete method at all (RFD 004 §7, pinned by its
// test), and only tools/labels/bootstrap.js may delete a label — a label, never
// an issue. The REST issues endpoints serve PRs too, so one path covers both.

const { execFileSync } = require('child_process');
const { makeGithub } = require('../../backlog-migrate/lib/github');

const OWNER = 'Tessellate-Studio';
const slug = repo => (repo.includes('/') ? repo : `${OWNER}/${repo}`);

function defaultRun(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function makeLabelGithub({ run = defaultRun } = {}) {
  return {
    ...makeGithub(),
    labelledItems: (repo, name) =>
      run([
        'api',
        '--paginate',
        `repos/${slug(
          repo
        )}/issues?state=all&per_page=100&labels=${encodeURIComponent(name)}`,
        '--jq',
        '.[].number',
      ])
        .split('\n')
        .filter(Boolean)
        .map(Number),
    addLabelTo: (repo, n, name) =>
      run([
        'api',
        '-X',
        'POST',
        `repos/${slug(repo)}/issues/${n}/labels`,
        '-f',
        `labels[]=${name}`,
      ]),
    removeLabelFrom: (repo, n, name) =>
      run([
        'api',
        '-X',
        'DELETE',
        `repos/${slug(repo)}/issues/${n}/labels/${encodeURIComponent(name)}`,
      ]),

    // Deletes the LABEL (the items stay). Bootstrap calls it for a duplicate
    // whose items were moved first, or a retired label still on nothing.
    deleteLabel: (repo, name) =>
      run(['label', 'delete', name, '-R', slug(repo), '--yes']),
  };
}

module.exports = { makeLabelGithub };
