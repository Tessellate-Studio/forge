/**
 * Every subagent starts from forge (owner, 2026-11-24): "any subagent spun up
 * is meant to take a look at forge and the required skills and processes to
 * be followed". A brief is written by the parent and can leave the process
 * out, so the SubagentStart hook adds it to every subagent's context.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { briefing } = require('../lib/subagent-briefing');

const HOOKS_DIR = path.join(__dirname, '..');
const ROOT = path.join(HOOKS_DIR, '..');

describe('the briefing text', () => {
  const text = briefing(ROOT);

  it('points at the repo rules and the forge standards by absolute path', () => {
    expect(text).toMatch(/CLAUDE\.md/);
    for (const f of [
      'workflows.md',
      'anti-patterns.md',
      'authoritative-claims.md',
    ]) {
      const p = path.join(ROOT, 'standards', f);
      expect(fs.existsSync(p)).toBe(true);
      expect(text).toContain(p);
    }
  });

  it('names the skill for each kind of work, and each skill exists', () => {
    for (const skill of ['build-feature', 'plan', 'device-test']) {
      const p = path.join(ROOT, 'skills', skill, 'SKILL.md');
      expect(fs.existsSync(p)).toBe(true);
      expect(text).toContain(p);
    }
  });

  it('carries the rules that hold inside a subagent too', () => {
    expect(text).toMatch(/draft/i);
    expect(text).toMatch(/never (merge|mark)/i);
    expect(text).toMatch(/wip claim/);
    expect(text).toMatch(/root cause/i);
    expect(text).toMatch(/hypothesis/i);
    expect(text).toMatch(/--no-verify/);
  });

  it('says the brief decides what and forge decides how, and a conflict is reported', () => {
    expect(text).toMatch(/brief.*what/i);
    expect(text).toMatch(/conflict/i);
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
    const entries = hooks.SubagentStart || [];
    const cmds = entries
      .filter(e => !e.matcher || e.matcher === '*')
      .flatMap(e => e.hooks.map(h => h.command));
    expect(cmds.some(c => c.includes('hooks/subagent-briefing.mjs'))).toBe(
      true
    );
  });
});
