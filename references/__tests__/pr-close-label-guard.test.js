/**
 * Behaviour tests for `.github/workflows/pr-close-label-guard.yml`.
 *
 * The guard is an inline `actions/github-script` body, so like the Workflow
 * scripts this suite already covers it cannot be `require()`d. It is loaded the
 * way github-script runs it: the `script:` string is pulled out of the YAML and
 * wrapped in an async function that receives `github`, `context` and `core`.
 * Running the real string (not a copy of its logic) is the point — it also
 * proves the embedded script still parses, which nothing else checks.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const WORKFLOW = path.join(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'pr-close-label-guard.yml'
);

function loadScript() {
  const doc = YAML.parse(fs.readFileSync(WORKFLOW, 'utf8'));
  const step = doc.jobs.guard.steps.find(
    s => s.uses && s.uses.startsWith('actions/github-script')
  );
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  return new AsyncFunction('github', 'context', 'core', step.with.script);
}

function makeGithub() {
  const calls = { create: [], removeLabel: [], createComment: [] };
  const github = {
    rest: {
      issues: {
        create: async args => {
          calls.create.push(args);
          return { data: { number: 999 } };
        },
        removeLabel: async args => {
          calls.removeLabel.push(args);
          return {};
        },
        createComment: async args => {
          calls.createComment.push(args);
          return {};
        },
      },
    },
  };
  return { github, calls };
}

function makeCore() {
  const logs = [];
  return {
    logs,
    core: { info: m => logs.push(m), warning: m => logs.push(`WARN ${m}`) },
  };
}

async function runGuard({ labels, merged = false, title = 'Some PR' }) {
  const script = loadScript();
  const { github, calls } = makeGithub();
  const { core, logs } = makeCore();
  const context = {
    repo: { owner: 'Tessellate-Studio', repo: 'forge' },
    payload: {
      pull_request: {
        number: 42,
        title,
        merged,
        labels: labels.map(name => ({ name })),
      },
    },
  };
  await script(github, context, core);
  return { calls, logs };
}

describe('pr-close-label-guard', () => {
  test('moves needs-input off an ordinary closed PR into a follow-up issue', async () => {
    const { calls } = await runGuard({ labels: ['needs-input'] });
    expect(calls.create).toHaveLength(1);
    expect(calls.create[0].labels).toEqual(['needs-input']);
    expect(calls.removeLabel.map(c => c.name)).toEqual(['needs-input']);
    expect(calls.createComment[0].body).toContain('#999');
  });

  test('does nothing for a closed PR with no guarded labels', async () => {
    const { calls } = await runGuard({ labels: ['feature'] });
    expect(calls.create).toHaveLength(0);
    expect(calls.removeLabel).toHaveLength(0);
  });

  test('skips a decision PR closed without merging (reject is an answer, not an open question)', async () => {
    const { calls, logs } = await runGuard({
      labels: ['decision'],
      merged: false,
    });
    expect(calls.create).toHaveLength(0);
    expect(calls.removeLabel).toHaveLength(0);
    expect(calls.createComment).toHaveLength(0);
    expect(logs.join('\n')).toMatch(/'decision' PR closed without merging/);
  });

  test('skips a merged decision PR too (merge = approve)', async () => {
    const { calls } = await runGuard({ labels: ['decision'], merged: true });
    expect(calls.create).toHaveLength(0);
  });

  test('a stray needs-input on a decision PR is logged, not turned into an issue', async () => {
    const { calls, logs } = await runGuard({
      labels: ['decision', 'needs-input'],
    });
    expect(calls.create).toHaveLength(0);
    expect(calls.removeLabel).toHaveLength(0);
    expect(logs.join('\n')).toMatch(/also carries 'needs-input'/);
  });

  test('still drops gate-blocked from a closed decision PR', async () => {
    const { calls } = await runGuard({ labels: ['decision', 'gate-blocked'] });
    expect(calls.removeLabel.map(c => c.name)).toEqual(['gate-blocked']);
    expect(calls.create).toHaveLength(0);
  });
});
