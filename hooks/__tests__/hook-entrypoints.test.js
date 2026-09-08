const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..');

// Every hook registered in hooks.json, read from the file rather than listed
// here, so a newly registered hook is covered the moment it is wired up.
const registered = JSON.parse(
  fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8')
)
  .hooks.SessionStart.flatMap(entry => entry.hooks)
  .map(h => (h.command.match(/hooks\/([\w.-]+\.mjs)/) || [])[1])
  .filter(Boolean);

describe('every registered SessionStart hook', () => {
  // A hook is only ever run by the harness with its output piped, so a syntax
  // error in one is invisible until a session starts — and the harness treats
  // a broken hook as a silent no-op. A merge that mangled one template literal
  // shipped a hook that could not parse at all, and every unit test still
  // passed, because the suites only ever loaded the libs underneath.
  it('has at least one registered hook to check', () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  registered.forEach(file => {
    it(`${file} parses`, () => {
      execFileSync(process.execPath, ['--check', path.join(HOOKS_DIR, file)], {
        stdio: 'pipe',
      });
    });

    it(`${file} exits 0 and emits either nothing or a valid envelope`, () => {
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
        },
      });
      if (out.trim()) {
        const parsed = JSON.parse(out);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
      }
    });
  });
});
