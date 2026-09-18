// The fixtures are real BACKLOG.md snapshots, and every parser test pins
// line numbers in them. A formatter run over this folder once rewrote them and
// shifted every line — so check each file against the git blob id recorded
// when it was taken (`git show <sha>:BACKLOG.md`).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '__fixtures__');
const manifest = JSON.parse(
  fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')
);

test.each(['alate', 'badige', 'loom', 'mood-layer'])(
  '%s snapshot is byte-exact',
  repo => {
    const bytes = fs.readFileSync(path.join(dir, `${repo}.BACKLOG.md`));
    const blob = crypto
      .createHash('sha1')
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest('hex');
    expect(blob).toBe(manifest[repo].blob);
  }
);
