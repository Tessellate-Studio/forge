const fs = require('fs');
const os = require('os');
const path = require('path');
const { Ledger } = require('../lib/ledger');

test('flushes after every upsert and reloads what it wrote', () => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')),
    'memory',
    'm.json'
  );
  const l = new Ledger(file);
  l.upsert({ key: 'a', issue: 1 });
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([
    { key: 'a', issue: 1 },
  ]);
  l.upsert({ key: 'a', rolledBack: true });
  l.upsert({ key: 'b', issue: 2 });
  const again = new Ledger(file);
  expect(again.records).toEqual([
    { key: 'a', issue: 1, rolledBack: true },
    { key: 'b', issue: 2 },
  ]);
  expect(fs.existsSync(`${file}.tmp`)).toBe(false);
});

test('refuses a file that is not a ledger', () => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')),
    'x.json'
  );
  fs.writeFileSync(file, '{"a":1}');
  expect(() => new Ledger(file)).toThrow(/not a ledger/);
});
