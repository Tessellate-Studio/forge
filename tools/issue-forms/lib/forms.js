// Sync forge's canonical issue forms into a repo, or check a repo's copies
// against them (RFD 004 §3). One copy in forge, a hash check in each repo's
// code-inspection run — so "four template copies drift four ways" (RFD-003)
// becomes a red check instead of a slow divergence.

const nodeFs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CANONICAL_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'issue-forms'
);
const TARGET = path.join('.github', 'ISSUE_TEMPLATE');

// Line endings are git's business (.gitattributes), not a content change — a
// CRLF checkout on Windows must not read as drift.
const hash = text =>
  crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

function canonical({ fs = nodeFs, dir = CANONICAL_DIR } = {}) {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.yml'))
    .sort()
    .map(name => ({
      name,
      text: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

/** { ok, missing, drifted, extra } for the repo rooted at `dest`. */
function check(dest, { fs = nodeFs, dir = CANONICAL_DIR } = {}) {
  const target = path.join(dest, TARGET);
  const out = { ok: [], missing: [], drifted: [], extra: [] };
  const forms = canonical({ fs, dir });
  for (const f of forms) {
    const p = path.join(target, f.name);
    if (!fs.existsSync(p)) {
      out.missing.push(f.name);
    } else if (hash(fs.readFileSync(p, 'utf8')) !== hash(f.text)) {
      out.drifted.push(f.name);
    } else {
      out.ok.push(f.name);
    }
  }

  // Extra templates are reported, not failed: a repo may add its own form.
  if (fs.existsSync(target)) {
    const known = new Set(forms.map(f => f.name));
    out.extra = fs
      .readdirSync(target)
      .filter(n => !known.has(n))
      .sort();
  }
  out.pass = out.missing.length === 0 && out.drifted.length === 0;
  return out;
}

function sync(dest, { fs = nodeFs, dir = CANONICAL_DIR } = {}) {
  const target = path.join(dest, TARGET);
  fs.mkdirSync(target, { recursive: true });
  const written = [];
  for (const f of canonical({ fs, dir })) {
    const p = path.join(target, f.name);
    if (fs.existsSync(p) && hash(fs.readFileSync(p, 'utf8')) === hash(f.text)) {
      continue;
    }
    fs.writeFileSync(p, f.text);
    written.push(f.name);
  }
  return written;
}

module.exports = { check, sync, canonical, hash, CANONICAL_DIR, TARGET };
