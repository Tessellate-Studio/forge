// `wi new` — the agent-side filing path for work items (RFD 004 §3). Forms
// constrain the web UI only; `gh issue create` bypasses them, so the rules a
// form cannot enforce live here:
//
//   * exactly one P label, P0–P3, always (a form cannot set one at all);
//   * the same section headings the forms produce, so the pulse parses both;
//   * list-before-create: a full LIST of open issues, never the search API,
//     whose index lags by minutes and has filed duplicates (§5.3).

const { AREA } = require('../../labels/lib/labels');
const { overlap } = require('../../backlog-migrate/lib/classify');

// Must stay identical to the field labels in templates/issue-forms/*.yml —
// tools/issue-forms/__tests__ pins that.
const SECTIONS = [
  { id: 'what', label: 'What', required: true },
  { id: 'why', label: 'Why / evidence', required: true },
  { id: 'done-when', label: 'Done when', required: true },
  { id: 'context', label: 'Context & history' },
  {
    id: 'effort',
    label: 'Effort (person-days)',
    options: ['unknown', '0.5', '1', '2', '3', '5', '10', '20'],
  },
  {
    id: 'reach',
    label: 'Reach',
    options: [
      'unknown',
      '1 — just me / internal',
      '10 — early testers',
      '100 — all current users',
      '1000 — future users at scale',
    ],
  },
];

const TYPES = ['bug', 'feature', 'chore', 'refactor'];
const TYPE_ALIASES = { enhancement: 'feature' };
const P_LABEL = /^P\d+$/i;
const DUPLICATE_OVERLAP = 0.5;

class UsageError extends Error {}

function pickOption(section, value) {
  if (value === null || value === undefined) {
    return null;
  }
  const v = String(value);
  const hit = section.options.find(o => o === v || o.split(' — ')[0] === v);
  if (!hit) {
    throw new UsageError(
      `--${section.id} must be one of: ${section.options
        .map(o => o.split(' — ')[0])
        .join(', ')}`
    );
  }
  return hit;
}

/** Validate flags and render { title, body, labels }. Throws UsageError. */
function buildIssue(o) {
  const repo = String(o.repo || '').replace(/^Tessellate-Studio\//, '');
  if (!repo) {
    throw new UsageError('--repo is required');
  }
  if (!o.title || !String(o.title).trim()) {
    throw new UsageError('--title is required');
  }

  const extra = [].concat(o.label || []).map(String);
  const pLabels = [o.priority, ...extra.filter(l => P_LABEL.test(l))].filter(
    Boolean
  );
  if (pLabels.length !== 1) {
    throw new UsageError(
      `exactly one P label is required (got ${
        pLabels.length ? pLabels.join(', ') : 'none'
      }) — pass --priority P0|P1|P2|P3 and no P label in --label`
    );
  }
  const priority = String(pLabels[0]).toUpperCase();
  if (!/^P[0-3]$/.test(priority)) {
    throw new UsageError(
      `--priority must be P0–P3 (got ${pLabels[0]}); P4 is not a label — use P3 with a "Deferred until:" line`
    );
  }

  let type = o.type ? String(o.type).toLowerCase() : null;
  if (type) {
    type = TYPE_ALIASES[type] || type;
  }
  if (type && !TYPES.includes(type)) {
    throw new UsageError(`--type must be one of ${TYPES.join(', ')}`);
  }

  const area = o.area ? String(o.area) : null;
  const areas = (AREA[repo] || []).map(l => l.name);
  if (area && !areas.includes(area)) {
    throw new UsageError(
      areas.length
        ? `--area for ${repo} must be one of ${areas.join(', ')}`
        : `${repo} has no area labels (RFD 004 Q6, amended 2026-09-19: loom and alate only)`
    );
  }

  const values = {};
  for (const s of SECTIONS) {
    const raw = o[s.id];
    if (s.required && (!raw || !String(raw).trim())) {
      throw new UsageError(`--${s.id} is required`);
    }
    values[s.id] = s.options
      ? pickOption(s, raw)
      : raw
      ? String(raw).trim()
      : null;
  }

  // The same shape GitHub renders for a submitted form: "### Label", a blank
  // line, the answer — "_No response_" for an empty optional field.
  const body = `${SECTIONS.map(
    s => `### ${s.label}\n\n${values[s.id] || '_No response_'}`
  ).join('\n\n')}\n`;

  const labels = [
    ...new Set(
      [priority, type, area, ...extra.filter(l => !P_LABEL.test(l))].filter(
        Boolean
      )
    ),
  ];
  return {
    repo,
    title: String(o.title).trim(),
    body,
    labels,
    parent: o.parent ? Number(o.parent) : null,
  };
}

function findDuplicate(title, openIssues) {
  let best = null;
  for (const i of openIssues) {
    const score = overlap(title, i.title);
    if (score >= DUPLICATE_OVERLAP && (!best || score > best.score)) {
      best = { ...i, score };
    }
  }
  return best;
}

/**
 * @returns {{status: 'dry-run'|'duplicate'|'created', issue, duplicate}}
 */
function wiNew(o, { gh, dryRun = false }) {
  const issue = buildIssue(o);
  if (dryRun) {
    return { status: 'dry-run', issue };
  }
  const open = gh.listIssues(issue.repo, {
    state: 'open',
    limit: 1000,
    fields: 'number,title,body',
  });
  const dup = findDuplicate(issue.title, open);
  if (dup && !o.force) {
    return { status: 'duplicate', issue, duplicate: dup };
  }
  const made = gh.createIssue(issue.repo, issue);
  return { status: 'created', issue, created: made };
}

module.exports = {
  buildIssue,
  findDuplicate,
  wiNew,
  SECTIONS,
  TYPES,
  UsageError,
};
