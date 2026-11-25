const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { briefing } = require('../lib/subagent-briefing');

const HOOKS_DIR = path.join(__dirname, '..');
const ROOT = path.join(HOOKS_DIR, '..');

describe('the subagent briefing', () => {
  const text = briefing(ROOT);

  it('gives the forge root once', () => {
    expect(text).toContain(`Forge root: ${ROOT}`);
    expect(text.split(ROOT).length - 1).toBe(1);
  });

  it('points only at files that exist', () => {
    const paths = [
      ...text.matchAll(/\b((?:standards|skills|references)\/[\w./-]*[\w/])/g),
    ].map(m => m[1]);
    expect(paths.length).toBeGreaterThan(4);
    for (const p of paths) {
      expect({ p, exists: fs.existsSync(path.join(ROOT, p)) }).toEqual({
        p,
        exists: true,
      });
    }
  });

  it('names only section headings that exist in workflows.md', () => {
    const workflows = fs.readFileSync(
      path.join(ROOT, 'standards', 'workflows.md'),
      'utf8'
    );
    const line = text
      .split('\n')
      .find(l => l.startsWith('- standards/workflows.md'));
    const headings = [...line.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    expect(headings.length).toBeGreaterThan(3);
    for (const h of headings) {
      expect({ h, found: workflows.includes(`## ${h}`) }).toEqual({
        h,
        found: true,
      });
    }
  });

  it('defers to a forge agent charter, and asks for a conflict to be reported', () => {
    expect(text).toMatch(/charter is your process/);
    expect(text).toMatch(/conflicts.*say so in your report/);
  });
});

describe('the hook', () => {
  const run = (env = {}) =>
    execFileSync(
      process.execPath,
      [path.join(HOOKS_DIR, 'subagent-briefing.mjs')],
      {
        input: JSON.stringify({
          hook_event_name: 'SubagentStart',
          agent_type: 'general-purpose',
        }),
        env: { ...process.env, ...env },
        encoding: 'utf8',
      }
    );

  it('adds the briefing as SubagentStart context', () => {
    const out = JSON.parse(run());
    expect(out.hookSpecificOutput.hookEventName).toBe('SubagentStart');
    expect(out.hookSpecificOutput.additionalContext).toBe(briefing(ROOT));
  });

  it('stays quiet when switched off', () => {
    expect(run({ FORGE_SUBAGENT_BRIEFING_DISABLE: '1' }).trim()).toBe('');
  });

  it('is registered for SubagentStart on every agent type', () => {
    const hooks = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8')
    ).hooks;
    const cmds = (hooks.SubagentStart || [])
      .filter(e => !e.matcher || e.matcher === '*')
      .flatMap(e => e.hooks.map(h => h.command));
    expect(cmds.some(c => c.includes('hooks/subagent-briefing.mjs'))).toBe(
      true
    );
  });
});
