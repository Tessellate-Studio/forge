/**
 * Test harness for the Workflow-runtime scripts in `references/workflows/`.
 *
 * Those scripts cannot be `require()`d: they are ESM-ish module bodies with
 * injected globals (`agent`, `parallel`, `phase`, `log`, `args`, `workflow`,
 * `budget`) plus top-level `await` and a top-level `return`. That is exactly why
 * they are excluded from forge's eslint/prettier (see .eslintignore) — they are
 * runtime payload, not forge Node source.
 *
 * This harness reproduces how the runtime actually loads them — strip the
 * `export` off `meta`, wrap the body in an async function, run it in a `vm` with
 * the globals stubbed — so tests can drive the real pipeline and inspect the
 * real prompts. Running the script (rather than importing a prompt builder) is
 * deliberate: it also proves the script still parses, which is the only check
 * that has ever guarded these files.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', 'workflows');

/**
 * Wrap a workflow script the way the Workflow runtime does.
 * Throws a SyntaxError if the script does not parse — this IS the parse check.
 */
function compile(source, filename) {
  const body = source.replace(/export\s+const\s+meta/, 'const meta');
  return new vm.Script(`(async function () {\n${body}\n})`, { filename });
}

/**
 * Load and run a workflow script with stubbed runtime globals.
 *
 * @param {string} name        script filename under references/workflows/
 * @param {object} opts
 * @param {*}      opts.args   the `args` global handed to the script
 * @param {Function} opts.agent  (prompt, options) => result; defaults to a stub
 *                               that returns schema-shaped results by label
 * @returns {Promise<{result: *, calls: Array, logs: string[]}>}
 *   `calls` is every agent() invocation as { label, phase, prompt, options }.
 */
async function runWorkflow(name, { args = {}, agent: agentImpl } = {}) {
  const filename = path.join(WORKFLOWS_DIR, name);
  const script = compile(fs.readFileSync(filename, 'utf8'), filename);

  const calls = [];
  const logs = [];

  const agent = async (prompt, options = {}) => {
    calls.push({ label: options.label, phase: options.phase, prompt, options });
    return agentImpl ? agentImpl(prompt, options) : defaultAgentResult(options);
  };

  const sandbox = vm.createContext({
    args,
    agent,
    log: message => logs.push(String(message)),
    phase: () => {},
    parallel,
    pipeline,
    workflow: async () => null,
    budget: { total: null, spent: () => 0, remaining: () => Infinity },
    JSON,
    Math,
    Set,
    Map,
    Array,
    Object,
    Boolean,
    String,
    Number,
    Promise,
    Error,
    console,
  });

  const result = await script.runInContext(sandbox)();
  return { result, calls, logs };
}

/** Barrier fan-out. A thunk that throws resolves to null, as in the runtime. */
function parallel(thunks) {
  return Promise.all(
    thunks.map(thunk =>
      Promise.resolve()
        .then(() => thunk())
        .catch(() => null)
    )
  );
}

/**
 * Each item through every stage; a throwing stage drops that item to null.
 * Unused by today's two scripts, which both fan out with parallel() — it's here
 * because the harness emulates the runtime's global surface, and a script that
 * reaches for pipeline() should run, not die on a bare ReferenceError.
 */
async function pipeline(items, ...stages) {
  const out = [];
  for (let index = 0; index < items.length; index += 1) {
    let value = items[index];
    try {
      for (const stage of stages) {
        value = await stage(value, items[index], index);
      }
    } catch {
      value = null;
    }
    out.push(value);
  }
  return out;
}

/**
 * Minimal schema-shaped results so the pipeline reaches its later phases.
 * Reviews return zero findings and verifies return zero failures, so the fix
 * loops exit immediately — tests that want a fix round supply their own stub.
 */
function defaultAgentResult({ label = '' }) {
  if (label.startsWith('research')) {
    return { findings: [], summary: 'stub research summary' };
  }
  if (label.startsWith('cross-repo')) {
    return { touchpoints: [], summary: 'stub blast radius' };
  }
  if (label.startsWith('test')) {
    return {
      testFiles: [{ path: 'src/__tests__/Stub.test.tsx', contents: '// stub' }],
      failingConfirmed: true,
    };
  }
  if (label.startsWith('implement') || label.startsWith('fix:')) {
    return {
      filesChanged: ['src/screens/Stub.tsx'],
      diff: '--- stub diff ---',
      testsPass: true,
      branchRef: 'workflow/impl-stub',
    };
  }
  if (label.startsWith('review')) {
    return { findings: [], testIdDrift: false, verdict: 'approve' };
  }
  if (label.startsWith('skeptic')) {
    return { refuted: true, reasoning: 'stub' };
  }
  if (label.startsWith('verify')) {
    return {
      screenshotTaken: true,
      updateConfirmed: true,
      measurements: [],
      failedCriteria: [],
    };
  }
  return null;
}

/** The prompt of the first agent() call whose label matches. */
function promptFor(calls, label) {
  const match = calls.find(call => call.label === label);
  return match ? match.prompt : null;
}

module.exports = {
  runWorkflow,
  compile,
  promptFor,
  defaultAgentResult,
  WORKFLOWS_DIR,
};
