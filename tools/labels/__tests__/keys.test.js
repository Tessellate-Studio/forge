// RFD 005: programs match a label by its KEY; people read its display NAME.

const L = require('../lib/labels');

describe('display name and key', () => {
  it('the emoji switch is on (RFD 005 step 4, owner 2026-11-18): names carry the emoji', () => {
    expect(L.EMOJI_NAMES).toBe(true);
    expect(L.displayName('bug')).toBe('🐛 bug');
    expect(L.displayName('device-test')).toBe('device-test');
  });

  it('with the switch on, a mapped key gains its emoji and others do not', () => {
    expect(L.displayName('bug', { emoji: true })).toBe('🐛 bug');
    expect(L.displayName('P0', { emoji: true })).toBe('🚨 P0');
    expect(L.displayName('device-test', { emoji: true })).toBe('device-test');
  });

  it('labelKey reads both forms, any case, and leaves unknown names alone', () => {
    expect(L.labelKey('🐛 bug')).toBe('bug');
    expect(L.labelKey('bug')).toBe('bug');
    expect(L.labelKey('🐛 Bug')).toBe('Bug');

    // One rule everywhere (the app workflows inline it too): any leading
    // non-ASCII word is an emoji, so a hand-made `🔴 P2` still means P2.
    expect(L.labelKey('🔴 P2')).toBe('P2');
    expect(L.labelKey('manual run list')).toBe('manual run list');
    expect(L.labelKey(undefined)).toBe('');
  });

  it('isLabel and resolveLabel find the live name for a key', () => {
    expect(L.isLabel('🚨 P0', 'p0')).toBe(true);
    expect(L.isLabel('P1', 'P0')).toBe(false);
    expect(L.resolveLabel('bug', ['P1', '🐛 bug'])).toBe('🐛 bug');
    expect(L.resolveLabel('bug', [{ name: 'bug' }])).toBe('bug');
    expect(L.resolveLabel('bug', ['P1'])).toBeUndefined();
  });

  it('every emoji is ONE code point with no U+FE0F (what you type is what is stored)', () => {
    for (const [key, e] of Object.entries(L.EMOJI)) {
      expect([key, [...e].length, e.includes('️')]).toEqual([key, 1, false]);
    }
  });

  it('every emoji key is a registered label', () => {
    const keys = new Set(
      ['alate', 'loom', 'forge'].flatMap(r => L.canonicalFor(r).map(l => l.key))
    );
    for (const key of Object.keys(L.EMOJI)) {
      expect([key, keys.has(key)]).toEqual([key, true]);
    }
  });

  it('labelSpec accepts either form and returns key + display name', () => {
    const spec = L.labelSpec('needs-human');
    expect(spec.key).toBe('needs-human');
    expect(spec.name).toBe(L.displayName('needs-human'));
    expect(L.labelSpec('👀 needs-human').key).toBe('needs-human');
  });
});

describe('planLabels matches by key', () => {
  const bug = { key: 'bug', name: '🐛 bug', color: 'B97A6E', description: 'd' };

  it('renames a bare label in place instead of creating a second one', () => {
    const plan = L.planLabels(
      [{ name: 'bug', color: 'B97A6E', description: 'd' }],
      [bug]
    );
    expect(plan.create).toEqual([]);
    expect(plan.edit.map(e => [e.from.name, e.name])).toEqual([
      ['bug', '🐛 bug'],
    ]);
    expect(plan.merge).toEqual([]);
  });

  it('a bare label revived beside the emoji one is merged into it', () => {
    const plan = L.planLabels(
      [
        { name: '🐛 bug', color: 'B97A6E', description: 'd' },
        { name: 'bug', color: 'ededed', description: '' },
      ],
      [bug]
    );
    expect(plan.ok).toEqual(['🐛 bug']);
    expect(plan.merge).toEqual([{ from: 'bug', into: '🐛 bug' }]);
  });

  it('turning the switch back off renames the emoji label back (rollback)', () => {
    const plan = L.planLabels(
      [{ name: '🐛 bug', color: 'B97A6E', description: 'd' }],
      [{ ...bug, name: 'bug' }]
    );
    expect(plan.edit.map(e => [e.from.name, e.name])).toEqual([
      ['🐛 bug', 'bug'],
    ]);
  });
});

// RFD 005 §3: once a label can carry an emoji, a typed `-l P1` silently lists
// nothing. Every label flag in forge's instructions and scripts goes through
// `forge-label` (or a variable); a literal emoji-able key fails here.
describe('no literal emoji-able key after a label flag', () => {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..', '..');
  const keys = Object.keys(L.EMOJI).join('|');
  const FLAG = new RegExp(
    String.raw`(?:^|\s)(?:-l|--label|--add-label|--remove-label)[ =]["']?(?:${keys})(?![\w-])`
  );
  it('the pattern catches a literal and passes forge-label', () => {
    expect(FLAG.test('gh issue list -l P1')).toBe(true);
    expect(FLAG.test('gh issue edit 3 --add-label failed')).toBe(true);
    expect(FLAG.test('--label "needs-human"')).toBe(true);
    expect(FLAG.test('-l "$(forge-label P1)"')).toBe(false);
    expect(FLAG.test('--label device-test')).toBe(false);
    expect(FLAG.test('--label failed-ci')).toBe(false);
  });
  it('forge sources use forge-label', () => {
    const files = execFileSync(
      'git',
      [
        'ls-files',
        'hooks',
        'tools',
        'skills',
        'standards',
        'templates',
        'references',
        '.github',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(f => /\.(js|mjs|cjs|md|ya?ml|sh)$/.test(f))
      .filter(f => !f.includes('__tests__') && !f.includes('test-support'));
    const bad = [];
    for (const f of files) {
      fs.readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .forEach(
          (line, i) =>
            (FLAG.test(line) ||
              (f.startsWith('.github/') && literalInList(line))) &&
            bad.push(`${f}:${i + 1}: ${line.trim()}`)
        );
    }
    expect(bad).toEqual([]);
  });

  // A workflow's `labels: [...]` sends names too (review finding: forge's own
  // ci.yml sent a bare 'bug'). A quoted emoji-able key there must go through
  // the label() lookup, like every app workflow.
  const QUOTED = new RegExp(String.raw`(label\()?['"](?:${keys})['"]`, 'g');
  function literalInList(line) {
    if (/^\s*#/.test(line)) {
      return false;
    }
    const m = /labels:\s*\[([^\]]*)\]/.exec(line);
    return !!m && [...m[1].matchAll(QUOTED)].some(q => !q[1]);
  }
  it('the list check catches a bare key and passes label()', () => {
    expect(literalInList("  labels: ['ci-failure', 'bug'],")).toBe(true);
    expect(literalInList("  labels: ['ci-failure', label('bug')],")).toBe(
      false
    );
    expect(literalInList("  labels: ['device-test'],")).toBe(false);
  });
});
