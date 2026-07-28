/**
 * researched-build workflow — prompt-builder behaviour.
 *
 * The pipeline has never completed a live end-to-end run, so these tests are the
 * only mechanical guard on the agent prompts it emits. They exist chiefly to
 * hold one property: **no phase may hardcode one consuming repo's toolchain.**
 * forge ships to alate (Expo/EAS/adb), loom (Shopify embedded app) and
 * mood-layer (Expo with no expo-updates, so no OTA path at all); a prompt that
 * names alate's commands makes that phase unusable in the other two.
 *
 * See memory/decisions/rfd-001-multi-agent-workflow.md, open question #6.
 */

const fs = require('fs');
const path = require('path');
const {
  runWorkflow,
  compile,
  promptFor,
  defaultAgentResult,
  WORKFLOWS_DIR,
} = require('./helpers/run-workflow');

/**
 * Toolchain names that belong to ONE consuming repo. None of these may appear
 * in a prompt unless the caller's own context put them there.
 *
 * This is a denylist, so it catches regressions of commands that have already
 * leaked, not a novel one — extend it whenever a new app-specific command shows
 * up in a prompt. The positive assertions (the caller's own strings appear
 * verbatim) are what prove the mechanism; this proves nothing else sneaks in.
 */
const ALATE_ONLY = [
  'eas update',
  'adb',
  'logcat',
  'expo-updates',
  'double-relaunch',
  'ota:preflight',
  'npx jest',
  'npx tsc',
];

function expectNoHardcodedToolchain(prompt) {
  const leaked = ALATE_ONLY.filter(needle =>
    prompt.toLowerCase().includes(needle.toLowerCase())
  );
  expect(leaked).toEqual([]);
}

// The two steps `rendersUI: true` cannot run without. Kept minimal on purpose:
// everything else stays optional and is discovered from the repo.
const MINIMAL_VERIFY = {
  publish: 'npm run deploy:dev',
  capture: 'browser screenshot of the embedded admin iframe',
};

const BASE_ARGS = {
  tier: 'pitch',
  task: 'Show a sizing badge on the product card',
  criteria: [
    'Badge sits within the top 20% of the card',
    'Badge text is legible at 320px width',
  ],
  rendersUI: true,
  context: { repo: 'loom', verify: MINIMAL_VERIFY },
};

// A Shopify embedded app — the repo the hardcoded verifier locked out.
const LOOM_VERIFY = {
  surface: 'the embedded admin page /app/settings in the dev store',
  publish: 'npm run deploy:dev',
  apply:
    'hard-reload the embedded admin page so the new extension bundle loads',
  capture: 'browser screenshot of the embedded admin iframe at 1280x800',
  confirm:
    'the version id shown by `shopify app versions list` matches the one you just pushed',
  measure: 'element positions as a % of the 1280x800 viewport',
};

async function verifyPrompt(args) {
  const { calls } = await runWorkflow('researched-build.js', { args });
  return promptFor(calls, 'verify');
}

const FAILED_CRITERION = BASE_ARGS.criteria[0];

/**
 * Agent stub whose first verify round fails one criterion, so the pipeline runs
 * a fix round + a re-verify. Everything else falls through to the defaults.
 */
function failFirstVerify() {
  return (prompt, options = {}) => {
    if (options.label === 'verify') {
      return {
        screenshotTaken: true,
        updateConfirmed: true,
        measurements: [
          { criterion: FAILED_CRITERION, measured: '34%', verdict: 'fail' },
        ],
        failedCriteria: [FAILED_CRITERION],
      };
    }
    return defaultAgentResult(options);
  };
}

describe('researched-build — script loads the way the runtime loads it', () => {
  it.each(['researched-build.js', 'adversarial-review.js'])(
    '%s parses when wrapped',
    name => {
      const source = fs.readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8');
      expect(() => compile(source, name)).not.toThrow();
    }
  );

  it('runs end to end against stubbed agents and returns the phase results', async () => {
    const { result, calls } = await runWorkflow('researched-build.js', {
      args: BASE_ARGS,
    });

    expect(result.tier).toBe('pitch');
    expect(result.impl.branchRef).toBe('workflow/impl-stub');
    expect(result.review.verdict).toBe('approve');
    expect(calls.map(call => call.label)).toEqual([
      'research',
      'test',
      'implement',
      'review',
      'verify',
    ]);
  });

  it('skips the verify phase when the change renders no UI', async () => {
    const { result, calls } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, rendersUI: false },
    });

    expect(result.verify).toBeNull();
    expect(calls.map(call => call.label)).not.toContain('verify');
  });
});

describe('verifier prompt — publish/apply/capture/confirm come from the caller', () => {
  it('carries the caller-supplied commands verbatim', async () => {
    const prompt = await verifyPrompt({
      ...BASE_ARGS,
      context: { repo: 'loom', verify: LOOM_VERIFY },
    });

    expect(prompt).toContain(LOOM_VERIFY.publish);
    expect(prompt).toContain(LOOM_VERIFY.apply);
    expect(prompt).toContain(LOOM_VERIFY.capture);
    expect(prompt).toContain(LOOM_VERIFY.confirm);
    expect(prompt).toContain(LOOM_VERIFY.measure);
    expect(prompt).toContain(LOOM_VERIFY.surface);
  });

  it('does not smuggle a foreign toolchain in alongside them', async () => {
    const prompt = await verifyPrompt({
      ...BASE_ARGS,
      context: { repo: 'loom', verify: LOOM_VERIFY },
    });

    expectNoHardcodedToolchain(prompt);
  });

  it('reproduces the alate mobile loop when alate is the caller supplying it', async () => {
    const alateVerify = {
      publish:
        'eas update --channel preview --environment preview --message "verify" --non-interactive',
      apply:
        'double-relaunch: force-stop -> launch (wait ~22s) -> force-stop -> launch',
      capture: 'adb exec-out screencap -p',
      confirm:
        'logcat shows branchName: preview and the updateGroup you published',
    };
    const prompt = await verifyPrompt({
      ...BASE_ARGS,
      context: { repo: 'alate', verify: alateVerify },
    });

    expect(prompt).toContain('eas update --channel preview');
    expect(prompt).toContain('adb exec-out screencap -p');
  });

  it('names each optional step it was not given rather than dropping it', async () => {
    const prompt = await verifyPrompt(BASE_ARGS);

    expect(prompt).toContain(MINIMAL_VERIFY.publish);
    expect(prompt).toContain(MINIMAL_VERIFY.capture);

    // apply and confirm weren't supplied, but they still have to happen — the
    // verifier is told to work them out from the repo, not to skip them.
    expect(prompt).toMatch(/APPLY — not supplied, DISCOVER it/);
    expect(prompt).toMatch(/CONFIRM — not supplied, DISCOVER it/);
    expect(prompt).toContain('MEASURE');
    expectNoHardcodedToolchain(prompt);
  });

  it('accepts a step given as several commands', async () => {
    const prompt = await verifyPrompt({
      ...BASE_ARGS,
      context: {
        repo: 'loom',
        verify: {
          ...MINIMAL_VERIFY,
          publish: ['npm run build', 'npm run deploy:dev'],
        },
      },
    });

    expect(prompt).toContain('npm run build; npm run deploy:dev');
  });
});

describe('rendersUI:true requires the steps it cannot run without', () => {
  it('refuses before spawning a single agent when context.verify is absent', async () => {
    const { result, calls } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, context: { repo: 'loom' } },
    });

    // The whole point: this costs nothing. No researcher, no tester, no
    // implementer, no reviewer - the caller finds out immediately.
    expect(calls).toEqual([]);
    expect(result.error).toMatch(/context\.verify/);
  });

  it('names exactly which steps are missing', async () => {
    const { result } = await runWorkflow('researched-build.js', {
      args: {
        ...BASE_ARGS,
        context: { repo: 'loom', verify: { publish: 'npm run deploy:dev' } },
      },
    });

    // The missing-list names only what is actually missing — `publish` still
    // appears later, in the sentence showing the shape to pass.
    expect(result.error).toContain('context.verify is missing: capture.');
  });

  it('does not count a surface or a blank string as a step', async () => {
    const { result } = await runWorkflow('researched-build.js', {
      args: {
        ...BASE_ARGS,
        context: {
          repo: 'loom',
          verify: {
            surface: 'the admin dashboard',
            publish: '   ',
            capture: '',
          },
        },
      },
    });

    expect(result.error).toMatch(/publish/);
    expect(result.error).toMatch(/capture/);
  });

  it('offers rendersUI:false as the way out', async () => {
    const { result } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, context: {} },
    });

    expect(result.error).toMatch(/rendersUI: false/);
  });

  it('lets a non-UI change through untouched', async () => {
    const { result, calls } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, rendersUI: false, context: { repo: 'loom' } },
    });

    expect(result.error).toBeUndefined();
    expect(calls.map(call => call.label)).toEqual([
      'research',
      'test',
      'implement',
      'review',
    ]);
  });

  it('runs the full pipeline once the two steps are present', async () => {
    const { result, calls } = await runWorkflow('researched-build.js', {
      args: BASE_ARGS,
    });

    expect(result.error).toBeUndefined();
    expect(calls.map(call => call.label)).toContain('verify');
  });
});

describe('verifier prompt — optional steps still discovered', () => {
  it('falls back to repo discovery, never to a default stack', async () => {
    const prompt = await verifyPrompt(BASE_ARGS);

    expectNoHardcodedToolchain(prompt);
    expect(prompt).toMatch(/discover/i);
    expect(prompt).toMatch(/structuralLimit/);
  });

  it('still enforces the branch-recovery and provenance guards', async () => {
    const prompt = await verifyPrompt(BASE_ARGS);

    // Amendment 2, blocker 2: the implementation lives on the implementer's
    // branch, not the verifier's checkout.
    expect(prompt).toContain('workflow/impl-stub');
    expect(prompt).toContain('updateConfirmed');
  });

  it('measures criteria as numbers, and lists them', async () => {
    const prompt = await verifyPrompt(BASE_ARGS);

    expect(prompt).toContain('Badge sits within the top 20% of the card');
    expect(prompt).toMatch(/numbers, not/i);
  });

  it('re-verify rounds carry the prior failures through the same builder', async () => {
    const { calls } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, context: { repo: 'loom', verify: LOOM_VERIFY } },
      agent: failFirstVerify(),
    });

    const reverify = promptFor(calls, 'verify:r1');
    expect(reverify).toContain(FAILED_CRITERION);
    expect(reverify).toContain(LOOM_VERIFY.capture);
    expectNoHardcodedToolchain(reverify);
  });
});

describe('fix prompt — the verify fix loop must be portable too', () => {
  it('asks for whichever typecheck/test commands the repo itself uses', async () => {
    const { calls } = await runWorkflow('researched-build.js', {
      args: { ...BASE_ARGS, context: { repo: 'loom', verify: LOOM_VERIFY } },
      agent: failFirstVerify(),
    });

    const fix = promptFor(calls, 'fix:verify:r1');
    expect(fix).not.toBeNull();
    expectNoHardcodedToolchain(fix);
  });
});

describe('charter mirroring — verifier-prompt.md must not drift from the script', () => {
  const charter = fs.readFileSync(
    path.join(__dirname, '..', 'agents', 'verifier-prompt.md'),
    'utf8'
  );

  it('documents every context.verify key the script consumes', () => {
    for (const key of [
      'publish',
      'apply',
      'capture',
      'confirm',
      'measure',
      'surface',
    ]) {
      expect(charter).toContain(key);
    }
  });

  it('does not present the commands of one repo as THE process', () => {
    // alate's loop may appear as a worked example, but the charter must say the
    // commands come from the caller — otherwise the doc re-teaches the bug.
    expect(charter).toMatch(/context\.verify/);
    expect(charter).toMatch(/caller/i);
  });
});
