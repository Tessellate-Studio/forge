'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isPrBodyCommand,
  extractBody,
  checkBody,
} = require('../lib/report-markers.js');

const HOOK = path.join(__dirname, '..', 'report-markers.mjs');
const run = payload =>
  execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

describe('which commands are checked', () => {
  it.each([
    'gh pr create --draft --title t --body-file b.md',
    'gh pr edit 212 -R o/r --body-file "$TEMP/pr.md"',
    'cd x && gh pr create -t t -b "hi"',
  ])('checks %s', cmd => expect(isPrBodyCommand(cmd)).toBe(true));

  it.each([
    'gh pr edit 212 --add-label P1',
    'gh pr view 212',
    'git commit -m "gh pr create --body is checked now"',
    'gh issue create --title t --body x',
  ])('ignores %s', cmd => expect(isPrBodyCommand(cmd)).toBe(false));
});

describe('reading the body', () => {
  it('reads a body-file path, quoted or not', () => {
    expect(extractBody('gh pr create --body-file "$TEMP/a.md"')).toEqual({
      file: '$TEMP/a.md',
    });
    expect(extractBody('gh pr create -F b.md')).toEqual({ file: 'b.md' });
  });

  it('judges a body file the same command writes, not a stale copy on disk', () => {
    // 2026-11-25: the hook ran before `cat > "$TEMP/pr3.md" <<'EOF'` wrote the
    // file and judged another session's stale pr3.md instead.
    const cmd =
      'cat > "$TEMP/pr3.md" <<\'EOF\'\n- ✅ new body\nEOF\ngh pr create -t t --body-file "$TEMP/pr3.md"';
    expect(extractBody(cmd)).toEqual({ text: '- ✅ new body' });
    const flipped =
      "cat <<'EOF' > b.md\n- plain\nEOF\ngh pr create -t t -F b.md";
    expect(extractBody(flipped)).toEqual({ text: '- plain' });
  });

  it('reads a heredoc body', () => {
    const cmd =
      'gh pr create --title t --body "$(cat <<\'EOF\'\n- ✅ done\nEOF\n)"';
    expect(extractBody(cmd)).toEqual({ text: '- ✅ done' });
  });

  it('reads an inline body', () => {
    expect(extractBody('gh pr create -t t --body "- ✅ a\\n- 🟡 b"')).toEqual({
      text: '- ✅ a\n- 🟡 b',
    });
  });
});

describe('the rule', () => {
  it('passes a body whose every point has a marker', () => {
    const body =
      'Refs #211.\n\n- ✅ shipped\n  - detail without marker is fine\n- ⚠ against the brief\n\n🤖 Generated with Claude Code';
    expect(checkBody(body).ok).toBe(true);
  });

  it('refuses the forge#212 first body: no marker anywhere', () => {
    const body =
      'Refs #211.\n\n- `standards/workflows.md`: new section\n- Plugin 0.24.5 -> 0.25.0.';
    const v = checkBody(body);
    expect(v.ok).toBe(false);
    expect(v.markerSeen).toBe(false);
    expect(v.unmarked).toHaveLength(2);
  });

  it('names the unmarked point when others are marked', () => {
    const v = checkBody('- ✅ a\n- b');
    expect(v.ok).toBe(false);
    expect(v.unmarked).toEqual(['- b']);
  });

  it('accepts a marked paragraph body with no bullets', () => {
    expect(checkBody('🐛 The fit sheet opened expanded.').ok).toBe(true);
  });

  it('ignores task lists and fenced code', () => {
    const body = '- ✅ a\n- [ ] 1. step\n```\n- not a point\n```';
    expect(checkBody(body).ok).toBe(true);
  });
});

describe('the hook entry point', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'markers-'));
  const file = (name, text) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, text);
    return p;
  };

  it('denies an unmarked body file', () => {
    const p = file('bad.md', '- plain point');
    const out = run({
      tool_name: 'Bash',
      tool_input: { command: `gh pr create -t t --body-file "${p}"` },
    });
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('allows a marked body file, a missing file and other commands', () => {
    const p = file('good.md', '- ✅ point');
    [
      `gh pr create -t t --body-file "${p}"`,
      'gh pr create -t t --body-file /nope/missing.md',
      'ls',
    ].forEach(command =>
      expect(run({ tool_name: 'Bash', tool_input: { command } })).toBe('')
    );
  });
});

describe('the chat-reply check (Stop hook)', () => {
  const { finalReplyText, checkReply } = require('../lib/report-markers.js');
  const STOP = path.join(__dirname, '..', 'reply-markers.mjs');
  const entry = (type, content) =>
    JSON.stringify({ type, message: { role: type, content } });

  it('reads only the reply after the last typed user message', () => {
    const lines = [
      entry('user', 'first ask'),
      entry('assistant', [{ type: 'text', text: 'old reply' }]),
      entry('user', 'yes, build it'),
      entry('assistant', [{ type: 'tool_use', id: 't', name: 'Bash' }]),
      entry('user', [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }]),
      entry('assistant', [{ type: 'text', text: '- ✅ built' }]),
      '{torn',
    ];
    expect(finalReplyText(lines)).toBe('- ✅ built');
  });

  it('leaves a short answer alone', () => {
    expect(checkReply('Done, PR #12 is open.').ok).toBe(true);
    expect(checkReply('- one point only').ok).toBe(true);
  });

  it('holds a report with unmarked points', () => {
    const v = checkReply('- ✅ a\n- b\n- c');
    expect(v).toMatchObject({ ok: false, report: true });
    expect(v.unmarked).toEqual(['- b', '- c']);
  });

  const runStop = payload =>
    execFileSync(process.execPath, [STOP], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });

  it('blocks once, then lets the retry through', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-'));
    const t = path.join(tmp, 't.jsonl');
    fs.writeFileSync(
      t,
      [
        entry('user', 'go'),
        entry('assistant', [{ type: 'text', text: '- a\n- b' }]),
      ].join('\n')
    );
    expect(JSON.parse(runStop({ transcript_path: t })).decision).toBe('block');
    expect(runStop({ transcript_path: t, stop_hook_active: true })).toBe('');
    expect(runStop({ last_assistant_message: '- ✅ a\n- 🟡 b' })).toBe('');
  });
});
