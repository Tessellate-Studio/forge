const fs = require('fs');
const os = require('os');
const path = require('path');
const YAML = require('yaml');
const { check, sync, canonical, TARGET } = require('../lib/forms');
const { main } = require('../cli');
const { SECTIONS } = require('../../work-item/lib/work-item');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'forms-'));

describe('canonical forms', () => {
  const forms = canonical();

  test('four forms plus config, as RFD 004 §3 names them', () => {
    expect(forms.map(f => f.name)).toEqual([
      'bug.yml',
      'chore.yml',
      'config.yml',
      'feature.yml',
      'refactor.yml',
    ]);
    expect(YAML.parse(forms.find(f => f.name === 'config.yml').text)).toEqual({
      blank_issues_enabled: false,
    });
  });

  test.each(['bug', 'chore', 'feature', 'refactor'])(
    '%s: its type label + needs-triage, no P label, shared sections',
    t => {
      const y = YAML.parse(forms.find(f => f.name === `${t}.yml`).text);
      expect(y.labels).toEqual([t, 'needs-triage']);

      // Priority is a label set at triage, never a dropdown (RFD 004 §2).
      expect(JSON.stringify(y)).not.toMatch(/"P[0-3]"|priority/i);
      expect(y.body.map(b => b.attributes.label)).toEqual(
        SECTIONS.map(s => s.label)
      );
      expect(
        y.body
          .filter(b => b.validations && b.validations.required)
          .map(b => b.id)
      ).toEqual(['what', 'why', 'done-when']);
    }
  );
});

describe('sync / check', () => {
  test('check fails on an empty repo, passes after sync, and sync is idempotent', () => {
    const dir = tmp();
    expect(check(dir)).toMatchObject({
      pass: false,
      missing: expect.arrayContaining(['bug.yml']),
    });
    expect(sync(dir)).toHaveLength(5);
    expect(check(dir)).toMatchObject({ pass: true, drifted: [], missing: [] });
    expect(sync(dir)).toEqual([]);
  });

  test('proven red: one edited byte is drift', () => {
    const dir = tmp();
    sync(dir);
    const p = path.join(dir, TARGET, 'feature.yml');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Feature', 'Feat'));
    expect(check(dir)).toMatchObject({ pass: false, drifted: ['feature.yml'] });
  });

  test('CRLF line endings are not drift; extra repo forms are reported, not failed', () => {
    const dir = tmp();
    sync(dir);
    const p = path.join(dir, TARGET, 'bug.yml');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\n/g, '\r\n'));
    fs.writeFileSync(path.join(dir, TARGET, 'security.yml'), 'name: x\n');
    expect(check(dir)).toMatchObject({ pass: true, extra: ['security.yml'] });
  });

  test('the CLI exits 1 on drift and 0 when in sync', () => {
    const dir = tmp();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(main(['check', '--dest', dir])).toBe(1);
    expect(main(['sync', '--dest', dir])).toBe(0);
    expect(main(['check', '--dest', dir])).toBe(0);
    log.mockRestore();
  });
});
