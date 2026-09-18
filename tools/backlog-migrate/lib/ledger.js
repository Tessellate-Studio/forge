// The migration ledger (`memory/backlog-migration.json`, RFD 004 §5.3/§5.7).
//
// Flushed after EVERY write, via write-to-temp + rename, so a crash mid-run
// leaves either the old file or the new one — never half of one — and the
// next `apply` resumes exactly where the last one stopped. The ledger is
// also `rewrite`'s map and `rollback`'s undo list.

const nodeFs = require('fs');
const path = require('path');

class Ledger {
  constructor(file, { fs = nodeFs } = {}) {
    this.file = file;
    this.fs = fs;
    this.records = [];
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data)) {
        throw new Error(`${file} is not a ledger array`);
      }
      this.records = data;
    }
  }

  get(key) {
    return this.records.find(r => r.key === key) || null;
  }

  upsert(rec) {
    const i = this.records.findIndex(r => r.key === rec.key);
    if (i >= 0) {
      this.records[i] = { ...this.records[i], ...rec };
    } else {
      this.records.push(rec);
    }
    this.flush();
    return this.get(rec.key);
  }

  flush() {
    const dir = path.dirname(this.file);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.file}.tmp`;
    this.fs.writeFileSync(tmp, `${JSON.stringify(this.records, null, 2)}\n`);
    this.fs.renameSync(tmp, this.file);
  }
}

module.exports = { Ledger };
