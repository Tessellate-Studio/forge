// The only module that talks to GitHub — through the `gh` CLI, like
// tools/work-claim. Every command takes an injectable `run`, so tests swap in
// a fake and no test can reach the network.
//
// Writes go through a Pacer (RFD 004 §5.6): serial, ≥3 s apart, a hard
// 400-per-rolling-hour budget under GitHub's 500/h secondary limit, and on a
// rate-limit error honour retry-after, else back off 60 → 120 → 240 s and
// stop. Stopping is safe because the ledger is flushed after every write.

const { execFileSync } = require('child_process');

const OWNER = 'Tessellate-Studio';
const MIN_GH = [2, 94, 0]; // --parent / --blocked-by / issueType arrived in 2.94
const LIST_LIMIT = 3000;

const slug = repo => (repo.includes('/') ? repo : `${OWNER}/${repo}`);

function defaultRun(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseVersion(out) {
  const m = String(out).match(/gh version (\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
}

function versionAtLeast(v, min = MIN_GH) {
  for (let i = 0; i < 3; i++) {
    if (v[i] > min[i]) {
      return true;
    }
    if (v[i] < min[i]) {
      return false;
    }
  }
  return true;
}

function errText(e) {
  return `${e && e.message} ${e && e.stderr ? e.stderr : ''}`;
}
const isRateLimit = e =>
  /rate limit|secondary rate|HTTP 429|abuse detection/i.test(errText(e));
function retryAfterMs(e) {
  const m = errText(e).match(/retry[- ]after:?\s*(\d+)/i);
  return m ? Number(m[1]) * 1000 : null;
}

class BudgetExceeded extends Error {}

class Pacer {
  constructor({
    minIntervalMs = 3000,
    hourlyBudget = 400,
    backoffMs = [60000, 120000, 240000],
    sleep = ms => new Promise(r => setTimeout(r, ms)),
    now = () => Date.now(),
  } = {}) {
    Object.assign(this, { minIntervalMs, hourlyBudget, backoffMs, sleep, now });
    this.stamps = [];
    this.last = null;
    this.writes = 0;
  }

  async write(fn) {
    for (let attempt = 0; ; attempt++) {
      if (this.last !== null) {
        const gap = this.now() - this.last;
        if (gap < this.minIntervalMs) {
          await this.sleep(this.minIntervalMs - gap);
        }
      }
      const hourAgo = this.now() - 3600000;
      this.stamps = this.stamps.filter(t => t > hourAgo);
      if (this.stamps.length >= this.hourlyBudget) {
        throw new BudgetExceeded(
          `write budget of ${this.hourlyBudget}/hour reached — stopping; re-run later, the ledger resumes`
        );
      }
      this.stamps.push(this.now());
      this.last = this.now();
      try {
        const out = await fn();
        this.writes++;
        return out;
      } catch (e) {
        if (!isRateLimit(e) || attempt >= this.backoffMs.length) {
          throw e;
        }
        await this.sleep(retryAfterMs(e) ?? this.backoffMs[attempt]);
      }
    }
  }
}

function makeGithub({ run = defaultRun } = {}) {
  const json = (args, input) => JSON.parse(run(args, input) || 'null');

  function list(kind, repo, { state = 'all', fields, limit = LIST_LIMIT }) {
    const rows = json([
      kind,
      'list',
      '-R',
      slug(repo),
      '--state',
      state,
      '-L',
      String(limit),
      '--json',
      fields,
    ]);

    // `gh … list` truncates silently at -L. A full page means we cannot
    // tell "all of them" from "the first N", and dedupe on a partial list
    // is how duplicates get filed — so refuse rather than guess.
    if (rows.length >= limit) {
      throw new Error(
        `${kind} list for ${repo} hit the ${limit} limit — refusing to dedupe on a partial list`
      );
    }
    return rows;
  }

  return {
    version: () => parseVersion(run(['--version'])),
    listIssues: (repo, o = {}) =>
      list('issue', repo, { fields: 'number,title,body,state,labels', ...o }),
    listPrs: (repo, o = {}) =>
      list('pr', repo, {
        state: 'open',
        fields: 'number,title,state,labels,isDraft',
        ...o,
      }),
    listLabels: repo =>
      json([
        'label',
        'list',
        '-R',
        slug(repo),
        '-L',
        '500',
        '--json',
        'name,color,description',
      ]),
    createLabel: (repo, l) =>
      run([
        'label',
        'create',
        l.name,
        '-R',
        slug(repo),
        '--color',
        l.color,
        '--description',
        l.description,
      ]),

    // `l.name` is the label as it exists; `l.newName` renames (case fixes).
    editLabel: (repo, l) =>
      run([
        'label',
        'edit',
        l.name,
        '-R',
        slug(repo),
        ...(l.newName && l.newName !== l.name ? ['--name', l.newName] : []),
        '--color',
        l.color,
        '--description',
        l.description,
      ]),
    viewIssue: (repo, n) =>
      json([
        'issue',
        'view',
        String(n),
        '-R',
        slug(repo),
        '--json',
        'number,title,body,comments,labels,state',
      ]),
    createIssue(repo, { title, body, labels = [], parent }) {
      const args = [
        'issue',
        'create',
        '-R',
        slug(repo),
        '--title',
        title,
        '--body-file',
        '-',
      ];
      if (labels.length) {
        args.push('--label', labels.join(','));
      }
      if (parent) {
        args.push('--parent', String(parent));
      }
      const url = run(args, body).trim().split('\n').pop();
      const m = url.match(/\/issues\/(\d+)$/);
      if (!m) {
        throw new Error(`gh issue create returned no issue URL: ${url}`);
      }
      return { number: Number(m[1]), url };
    },
    comment: (repo, n, body) =>
      run(
        ['issue', 'comment', String(n), '-R', slug(repo), '--body-file', '-'],
        body
      ),
    addLabels: (repo, n, labels) =>
      run([
        'issue',
        'edit',
        String(n),
        '-R',
        slug(repo),
        '--add-label',
        labels.join(','),
      ]),
    removeLabels: (repo, n, labels) =>
      run([
        'issue',
        'edit',
        String(n),
        '-R',
        slug(repo),
        '--remove-label',
        labels.join(','),
      ]),

    // Close, never delete: deletion is irreversible and not an agent action
    // (RFD 004 §7). There is deliberately no delete method in this module.
    closeIssue: (repo, n, { reason = 'not planned', comment } = {}) => {
      const args = [
        'issue',
        'close',
        String(n),
        '-R',
        slug(repo),
        '--reason',
        reason,
      ];
      if (comment) {
        args.push('--comment', comment);
      }
      return run(args);
    },
  };
}

module.exports = {
  makeGithub,
  Pacer,
  BudgetExceeded,
  parseVersion,
  versionAtLeast,
  isRateLimit,
  retryAfterMs,
  slug,
  MIN_GH,
  LIST_LIMIT,
};
