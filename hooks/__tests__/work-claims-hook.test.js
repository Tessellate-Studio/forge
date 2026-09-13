const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'work-claims.mjs');

// Runs the real hook with a PATH that holds neither `wip` nor `gh`: the board
// fetch fails fast (no gh) and is skipped as designed, so the only thing left
// to say is that `wip` is missing — which is the 2026-09-13 failure, where
// every skill's `wip claim` hit "command not found" and nobody was told.
describe('work-claims.mjs without `wip` on PATH', () => {
  let emptyDir;
  beforeAll(() => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-wip-'));
  });
  afterAll(() => fs.rmSync(emptyDir, { recursive: true, force: true }));

  const run = extraEnv =>
    execFileSync(process.execPath, [HOOK], {
      input: '',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: emptyDir,
        Path: emptyDir,
        ...extraEnv,
      },
    });

  it('tells the session to use the plugin CLI instead of skipping claims', () => {
    const parsed = JSON.parse(run());
    const context = parsed.hookSpecificOutput.additionalContext;
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(context).toContain('`wip` is not on PATH');
    expect(context).toContain(path.join('tools', 'work-claim', 'cli.js'));
  });

  it('stays silent when switched off', () => {
    expect(run({ FORGE_WORK_CLAIMS_DISABLE: '1' }).trim()).toBe('');
  });
});
