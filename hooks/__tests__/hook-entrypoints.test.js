const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..');

// Every hook registered in hooks.json, read from the file rather than listed
// here, so a newly registered hook is covered the moment it is wired up. Every
// event that adds context; PreToolUse (merge-gate) reads a tool call from
// stdin and has its own tests.
const hooks = JSON.parse(
  fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8')
).hooks;
const registered = Object.entries(hooks)
  .filter(([event]) => event !== 'PreToolUse')
  .flatMap(([event, entries]) =>
    entries
      .flatMap(entry => entry.hooks)
      .map(h => [event, (h.command.match(/hooks\/([\w.-]+\.mjs)/) || [])[1]])
  )
  .filter(([, file]) => file);

describe('every registered context hook', () => {
  // A hook is only ever run by the harness with its output piped, so a syntax
  // error in one is invisible until a session starts — and the harness treats
  // a broken hook as a silent no-op. A merge that mangled one template literal
  // shipped a hook that could not parse at all, and every unit test still
  // passed, because the suites only ever loaded the libs underneath.
  it('has at least one registered hook to check', () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  registered.forEach(([event, file]) => {
    it(`${file} parses`, () => {
      execFileSync(process.execPath, ['--check', path.join(HOOKS_DIR, file)], {
        stdio: 'pipe',
      });
    });

    it(`${file} exits 0 and emits either nothing or a valid ${event} envelope`, () => {
      const out = execFileSync(process.execPath, [path.join(HOOKS_DIR, file)], {
        input: '',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,

          // Off switches: the contract under test is "runs clean and says
          // nothing", not whatever GitHub happens to hold right now.
          FORGE_WORK_CLAIMS_DISABLE: '1',
          FORGE_DEVICE_TEST_STATUS_DISABLE: '1',
          FORGE_FRESHNESS_DISABLE: '1',
          FORGE_SUBAGENT_BRIEFING_DISABLE: '1',
        },
      });
      if (out.trim()) {
        const parsed = JSON.parse(out);
        expect(parsed.hookSpecificOutput.hookEventName).toBe(event);
      }
    });
  });
});

describe('every hook that reaches GitHub declares the short gh budget', () => {
  // tools/work-claim/lib/claim.js defaults gh() to the CLI budget (a person
  // waits). A hook is killed at its own deadline, so it says so once.
  const reachesGh =
    /'work-claim'|work-claim\/lib|queue-lib|verification\.js|labels\/lib/;
  const files = fs.readdirSync(HOOKS_DIR).filter(f => f.endsWith('.mjs'));

  it('finds the hooks that reach GitHub', () => {
    const using = files.filter(f =>
      reachesGh.test(fs.readFileSync(path.join(HOOKS_DIR, f), 'utf8'))
    );
    expect(using).toEqual(
      expect.arrayContaining([
        'device-test-status.mjs',
        'work-claims.mjs',
        'merge-gate.mjs',
      ])
    );
  });

  files.forEach(file => {
    const src = fs.readFileSync(path.join(HOOKS_DIR, file), 'utf8');
    if (!reachesGh.test(src)) {
      return;
    }
    it(`${file} calls setGhBudget(HOOK_GH_TIMEOUT_MS)`, () => {
      expect(src).toMatch(/setGhBudget\(HOOK_GH_TIMEOUT_MS\)/);
    });
  });
});
