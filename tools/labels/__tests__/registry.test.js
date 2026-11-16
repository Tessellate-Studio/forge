// Every label forge tells anyone to create or apply lives in the canonical
// registry (lib/labels.js) — one name, one colour, one description. Owner
// rule 2026-09-25: new labels and similar artifacts are built on the existing
// registry, never ad hoc next to it. This test is what makes that a rule and
// not a hope: a `gh label create`/`--add-label` for a name the registry does
// not know, or with a colour it does not use, fails CI.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const L = require('../lib/labels');

const ROOT = path.join(__dirname, '..', '..', '..');
const REPOS = ['alate', 'loom', 'mood-layer', 'badige', 'forge', 'litmus'];

const registry = new Map();
REPOS.forEach(r =>
  L.canonicalFor(r).forEach(l => registry.set(l.name.toLowerCase(), l))
);

/** Files that tell someone to create or apply a label. The registry itself
 *  and the tests (which build fixtures) are not instructions. */
function sources() {
  return execFileSync(
    'git',
    ['ls-files', 'hooks', 'tools', 'skills', 'standards', 'templates'],
    { cwd: ROOT, encoding: 'utf8' }
  )
    .split('\n')
    .filter(f => /\.(js|mjs|md|ya?ml|sh)$/.test(f))
    .filter(f => !f.includes('__tests__') && !f.includes('test-support'))
    .filter(f => !f.startsWith('tools/labels/lib/'));
}

// A literal name only: `$l`, `${x}`, `<name>` and `"$l"` are variables.
const LITERAL = String.raw`"([^"$<{]+)"|([A-Za-z][\w-]*)`;
const CREATE = new RegExp(String.raw`label create\s+(?:${LITERAL})`, 'g');
const APPLY = new RegExp(String.raw`--add-label\s+(?:${LITERAL})`, 'g');
const COLOR = /--color\s+([0-9a-fA-F]{6})/;

function uses() {
  const out = [];
  sources().forEach(file => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    text.split('\n').forEach((line, i) => {
      [CREATE, APPLY].forEach(re => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          const name = m[1] || m[2];
          const color = re === CREATE ? (line.match(COLOR) || [])[1] : null;
          out.push({ where: `${file}:${i + 1}`, name, color });
        }
      });
    });
  });
  return out;
}

describe('the label registry is the only source of labels', () => {
  const found = uses();

  it('finds the label instructions it is meant to police', () => {
    // Guard against a regex that silently matches nothing.
    expect(found.some(u => u.name === 'on hold')).toBe(true);
  });

  it('every label forge creates or applies is in the registry', () => {
    const unknown = found
      .filter(u => !registry.has(u.name.toLowerCase()))
      .map(u => `${u.where} → "${u.name}"`);
    expect(unknown).toEqual([]);
  });

  it('every colour forge creates a label with is the registry colour', () => {
    const wrong = found
      .filter(u => u.color && registry.has(u.name.toLowerCase()))
      .filter(
        u =>
          u.color.toLowerCase() !==
          registry.get(u.name.toLowerCase()).color.toLowerCase()
      )
      .map(u => `${u.where} → ${u.name} ${u.color}`);
    expect(wrong).toEqual([]);
  });
});

describe('priority reads at a glance', () => {
  it('no other label wears a priority colour', () => {
    const pColors = new Set(L.PRIORITY.map(p => p.color.toLowerCase()));
    const clashes = [...registry.values()]
      .filter(l => !L.PRIORITY.includes(l))
      .filter(l => pColors.has(l.color.toLowerCase()))
      .map(l => `${l.name} ${l.color}`);
    expect(clashes).toEqual([]);
  });
});

// Owner, 2026-11-17: an agent cannot tell an owner comment from its own (one
// GitHub account), so an answered question needs a label of its own. The
// owner used `needs-build` for it, which drains read as "wait for a binary",
// and the answers on alate #650 and #925 sat unread.
describe('owner-replied answers needs-input', () => {
  it('is registered as a lifecycle label, next to needs-input', () => {
    const spec = L.labelSpec('owner-replied');
    expect(L.LIFECYCLE).toContain(spec);
    expect(spec.description).toMatch(/owner answered/i);
    expect(L.LIFECYCLE.map(l => l.name)).toContain('needs-input');
  });

  it('has a colour no other label wears', () => {
    const c = L.labelSpec('owner-replied').color.toLowerCase();
    const others = [...registry.values()].filter(
      l => l.name !== 'owner-replied'
    );
    expect(others.filter(l => l.color.toLowerCase() === c)).toEqual([]);
  });

  it('needs-build says it is about a build, never an answer', () => {
    expect(L.labelSpec('needs-build').description).toMatch(/build/i);
    expect(L.labelSpec('needs-build').description).toMatch(
      /not an owner answer/i
    );
  });
});
