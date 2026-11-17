// The canonical label set for every Tessellate repo (RFD 004 §2–§3), and the
// pure diff that decides what bootstrap would create or edit.
//
// One colour and one description everywhere: issue forms SILENTLY drop a
// label the repo does not have, so a missing `feature` label means every
// feature filed through the form is unlabelled and nobody is told.
//
// Colours — owner ruling 2026-09-25: earthy, muted and bright mixed, every
// label its own colour, and a family shares a hue. P0–P3 run brick → sand;
// the device-test queue's labels are browns; every `needs-*` label is a
// muted grey-purple or dusky blue, so a blocked issue reads as blocked at a
// glance. __tests__ pins the stock GitHub colours
// these replaced out of the set.

const {
  CLAIM_LABEL,
  CLAIM_LABEL_COLOR,
  CLAIM_LABEL_DESC,
} = require('../../work-claim/lib/claim');

// The needs-* family: muted grey-purples and dusky blues.
const NEEDS_SHADES = ['8E86A8', 'B3ADC9', '7C91AB', 'A9B7CA'];

// Owner ruling 2026-09-19: the descriptions keep the "Priority N — " prefix
// that the P labels were created with on 2026-09-18 in every repo.
const PRIORITY = [
  {
    name: 'P0',
    color: '8B2E16',
    description: 'Priority 0 — blocker / pre-launch',
  },
  { name: 'P1', color: 'C0612B', description: 'Priority 1 — do next' },
  { name: 'P2', color: 'D9A441', description: 'Priority 2 — soon' },
  { name: 'P3', color: 'E3D5B8', description: 'Priority 3 — later' },
];

const TYPE = [
  { name: 'bug', color: 'B97A6E', description: "Something isn't working" },
  { name: 'feature', color: '6B8E23', description: 'New functionality' },
  {
    name: 'chore',
    color: 'C9B79C',
    description: 'Maintenance, dependencies, config',
  },
  {
    name: 'refactor',
    color: '9B7B8E',
    description: 'Code restructuring without behavior change',
  },
];

const LIFECYCLE = [
  {
    name: 'decision',
    color: '4F6B3A',
    description:
      'A plan awaiting owner decision (draft PR): merge = approve, close = reject',
  },
  {
    // A step only a human can do (console, re-consent, CLI login) is ONE PR
    // with this label — workflows.md → "Manual steps are PRs". The name is
    // the one loom and alate already had, kept so no repo gets two.
    name: 'manual run list',
    color: '7A8C6E',
    description:
      "A step only a human can do: PR body has What's left / Steps / Verify; merge = done",
  },
  {
    // Text and colour are the ones standards/workflows.md prescribes.
    name: 'on hold',
    color: 'BCB38A',
    description:
      'Deliberately paused — needs review by a set date, not indefinite (see forge/standards/workflows.md)',
  },
  {
    name: CLAIM_LABEL,
    color: CLAIM_LABEL_COLOR,
    description: CLAIM_LABEL_DESC,
  },
  {
    name: 'needs-input',
    color: NEEDS_SHADES[0],
    description:
      'Blocked on a human answer that is not a doc approval, or on an open decision PR',
  },
  {
    // The answer to needs-input (owner, 2026-11-17). The owner and every agent
    // post as one GitHub account, so only a label says "a person answered
    // here". Not a needs-* shade: it is a go signal, not a block, so it wears
    // a sage green no other label uses.
    name: 'owner-replied',
    color: '5F8A6B',
    description:
      'The owner answered in a comment: act on it next, then remove this label',
  },
  {
    // Not FBCA04 (P2's colour, until 2026-09-25) — an untriaged issue must
    // not read as a P2.
    name: 'needs-triage',
    color: NEEDS_SHADES[1],
    description: 'Filed without a P label — triage sets exactly one of P0–P3',
  },
];

const PROVENANCE = [
  {
    name: 'migrated-from-backlog',
    color: 'DAD4C8',
    description: 'Filed by backlog-migrate from BACKLOG.md (RFD 004)',
  },
];

// RFD-003 device-test queue. The queue's own labels are browns; its two
// needs-* labels join the needs family.
const DEVICE_TEST = [
  {
    name: 'device-test',
    color: '8C6A4F',
    description: 'A pending on-device test (one issue per test)',
  },
  {
    name: 'needs-human',
    color: NEEDS_SHADES[2],
    description: 'This device test needs a person, not an agent',
  },
  {
    name: 'needs-build',
    color: NEEDS_SHADES[3],
    description:
      'No installable build can reach this test yet (a build state, not an owner answer)',
  },
  {
    name: 'parked',
    color: 'CDBBA7',
    description: 'Open, but deliberately not drained — the owner parked it',
  },
  {
    name: 'failed',
    color: '5E3A28',
    description: 'This device test failed — see the latest comment',
  },
  {
    // On a PR, not a test: merged before its device test passed, on purpose
    // (hooks/merge-gate.mjs). Created ad hoc by the hook's hint, in P1's
    // colour, until it joined the registry on 2026-09-25.
    name: 'device-unverified',
    color: 'A68A64',
    description: 'Merged before its device test passed',
  },
];

// RFD 005: a label has a stable KEY that programs match on (the `name` each
// entry above is written with) and a display NAME that people read, which
// may carry an emoji. Owner, 2026-11-17: the report-marker emoji where they
// overlap; every emoji here is ONE code point with no U+FE0F, so the name a
// person types in search is the name GitHub stores (a test pins this).
const EMOJI = {
  bug: '🐛',
  feature: '✨',
  chore: '🧹',
  refactor: '🔁',
  P0: '🚨',
  P1: '🔴',
  P2: '🟡',
  P3: '🟢',
  'needs-triage': '🔎',
  'needs-human': '👀',
  decision: '🟣',
  'needs-build': '🔧',
  parked: '💤',
  failed: '❌',
  mobile: '📱',
  backend: '💻',
  scraper: '🧲',
  'fit-engine': '📏',
  infra: '🧰',
};

// The one switch (RFD 005 step 4). Off until every consumer in every repo
// resolves names by key; flipping it and running bootstrap renames in place.
const EMOJI_NAMES = false;

const keyOf = k => k.toLowerCase();
const EMOJI_BY_KEY = new Map(
  Object.entries(EMOJI).map(([k, e]) => [keyOf(k), e])
);

/** The name GitHub shows for a key: `bug` → `🐛 bug` once the switch is on. */
function displayName(key, { emoji = EMOJI_NAMES } = {}) {
  const e = emoji && EMOJI_BY_KEY.get(keyOf(key));
  return e ? `${e} ${key}` : key;
}

/** The key behind a live name, with or without its emoji: `labelKey('🐛 bug')`
 *  and `labelKey('bug')` are both `bug`. Matching on keys is what lets code
 *  work before, during and after the rename. Unknown names come back as-is. */
function labelKey(name) {
  const s = String(name || '');
  const sp = s.indexOf(' ');
  if (sp > 0) {
    const rest = s.slice(sp + 1);
    if (EMOJI_BY_KEY.get(keyOf(rest)) === s.slice(0, sp)) {
      return rest;
    }
  }
  return s;
}

/** Does live name `name` stand for `key`? (case-insensitive, like GitHub) */
function isLabel(name, key) {
  return keyOf(labelKey(name)) === keyOf(key);
}

/** The repo's live name for `key`, from its label list (names or {name}
 *  objects), or undefined. Writers send THIS, never a key: GitHub silently
 *  creates a label for an unknown name (github/docs#35718). */
function resolveLabel(key, liveLabels) {
  const hit = (liveLabels || [])
    .map(l => (typeof l === 'string' ? l : l.name))
    .find(n => isLabel(n, key));
  return hit;
}

/** The registry entry for one label, by key or display name — for code that
 *  has to tell someone to create or apply it, so the hint cannot drift from
 *  the set. `name` is the display name; `key` is what code matches. */
function labelSpec(name) {
  const all = [
    ...PRIORITY,
    ...TYPE,
    ...LIFECYCLE,
    ...PROVENANCE,
    ...DEVICE_TEST,
  ];
  const found = all.find(l => isLabel(name, l.name));
  if (!found) {
    throw new Error(
      `"${name}" is not in the label registry (tools/labels/lib/labels.js)`
    );
  }
  return withKey(found);
}

function withKey(l) {
  return { ...l, key: l.name, name: displayName(l.name) };
}

// Owner amendment to RFD 004 Q6 (2026-09-19): area labels in loom and alate
// ONLY — and every issue in those two repos carries one (`wi new` refuses
// without it). loom keeps its existing names and descriptions; both repos'
// area colours were re-picked 2026-09-25; infra keeps its khaki, the colour
// invalid wears too. mood-layer's existing area labels are left untouched —
// bootstrap never deletes — and badige gets none.
const AREA = {
  loom: [
    {
      name: 'admin-ui',
      color: '46708C',
      description: 'Embedded Shopify admin app (admin/)',
    },
    {
      name: 'api',
      color: 'B5835A',
      description: 'Serverless endpoints (api/)',
    },
    {
      name: 'sdk',
      color: 'BFDADC',
      description: 'Shared SDK — enrichments, shopify, supabase (sdk/)',
    },
    {
      name: 'extension',
      color: 'A3B18A',
      description: 'Shopify theme-app extension (extensions/)',
    },
    {
      name: 'supabase',
      color: 'E0B39A',
      description: 'Schema, migrations, RLS',
    },
    { name: 'infra', color: 'E4E669', description: 'Infrastructure/CI/CD' },
  ],
  alate: [
    { name: 'mobile', color: '46708C', description: 'Expo app (mobile/)' },
    {
      name: 'backend',
      color: 'B5835A',
      description: 'Vercel API, SDK and Supabase (backend/)',
    },
    {
      name: 'scraper',
      color: 'BFDADC',
      description:
        'Product scraping (backend/sdk/productScraping, scrape jobs)',
    },
    {
      name: 'fit-engine',
      color: 'A3B18A',
      description:
        'Fit guidance and size finder (backend/sdk/fitGuidance, sizeFinder)',
    },
    { name: 'infra', color: 'E4E669', description: 'Infrastructure/CI/CD' },
  ],
};

// loom's and mood-layer's old priority labels. Q4 retires them AFTER a
// relabel pass; bootstrap only reports them, because deleting a label strips
// it from every issue that wears it.
const LEGACY_PRIORITY = ['critical', 'high', 'medium', 'low'];

// Labels the owner retired, by repo and BY NAME (`bootstrap --prune` deletes
// them). Owner, 2026-11-17: "remove any unused label too", then, shown the
// inventory, "Group 1 only": labels on NO issue or PR and used by no code
// (GraphQL issue/PR counts + `git grep` of every checkout, 2026-11-17). So a
// retired label is deleted only while it is still on nothing (bootstrap
// re-checks); a name the registry still wants is never deleted. Kept on
// purpose: Dependabot's labels, every label a workflow applies, and
// mood-layer's own set (its .github/labels.yml).
const RETIRED = {
  alate: ['stale'],
  loom: [
    'documentation',
    'duplicate',
    'enhancement',
    'good first issue',
    'help wanted',
    'invalid',
    'question',
    'wontfix',
    'in-progress',
    'blocked',
    'needs-review',
    'repeat-issue',
    'github_actions',
    'pending-change',
  ],
  forge: [
    'documentation',
    'duplicate',
    'good first issue',
    'help wanted',
    'invalid',
    'question',
    'wontfix',
  ],
  'mood-layer': [
    'duplicate',
    'good first issue',
    'help wanted',
    'invalid',
    'question',
    'wontfix',
  ],
  badige: [
    'duplicate',
    'good first issue',
    'help wanted',
    'invalid',
    'question',
    'wontfix',
    'pending-change',
  ],
  'tessellate-pages': [
    'documentation',
    'duplicate',
    'enhancement',
    'good first issue',
    'invalid',
    'question',
    'wontfix',
  ],
  litmus: [
    'documentation',
    'duplicate',
    'enhancement',
    'good first issue',
    'help wanted',
    'invalid',
    'question',
    'wontfix',
  ],
};

function retiredFor(repo) {
  const short = repo.includes('/') ? repo.split('/')[1] : repo;
  return RETIRED[short] || [];
}

function canonicalFor(repo) {
  const short = repo.includes('/') ? repo.split('/')[1] : repo;
  return [
    ...PRIORITY,
    ...TYPE,
    ...LIFECYCLE,
    ...PROVENANCE,
    ...DEVICE_TEST,
    ...(AREA[short] || []),
  ].map(withKey);
}

/**
 * Diff existing labels against the canonical set. Labels match by KEY
 * (`bug` and `🐛 bug` are the same label), case-insensitively as GitHub does;
 * colours too. Returns { create, edit, ok, merge, legacy }:
 * - `edit` renames in place (`gh label edit --name`), which keeps the label on
 *   every issue and PR;
 * - `merge` lists a second label with the same key (a bare `bug` beside
 *   `🐛 bug`, revived by a writer that sent the old name): bootstrap moves its
 *   items onto the canonical one and deletes it (RFD 005 §4, Kubernetes
 *   label_sync `previously:`).
 */
function planLabels(existing, canonical) {
  const byKey = new Map();
  for (const l of existing) {
    const k = keyOf(labelKey(l.name));
    if (!byKey.has(k)) {
      byKey.set(k, []);
    }
    byKey.get(k).push(l);
  }
  const out = { create: [], edit: [], ok: [], merge: [], legacy: [] };
  for (const want of canonical) {
    const haves = byKey.get(keyOf(want.key || want.name)) || [];
    const have =
      haves.find(h => h.name.toLowerCase() === want.name.toLowerCase()) ||
      haves[0];
    haves
      .filter(h => h !== have)
      .forEach(h => out.merge.push({ from: h.name, into: want.name }));
    if (!have) {
      out.create.push(want);
    } else if (
      have.name !== want.name ||
      String(have.color).toLowerCase() !== want.color.toLowerCase() ||
      (have.description || '') !== want.description
    ) {
      out.edit.push({
        ...want,
        from: {
          name: have.name,
          color: have.color,
          description: have.description || '',
        },
      });
    } else {
      out.ok.push(want.name);
    }
  }
  out.legacy = existing
    .map(l => l.name)
    .filter(n => LEGACY_PRIORITY.includes(n.toLowerCase()));
  return out;
}

module.exports = {
  PRIORITY,
  NEEDS_SHADES,
  TYPE,
  LIFECYCLE,
  PROVENANCE,
  DEVICE_TEST,
  AREA,
  LEGACY_PRIORITY,
  RETIRED,
  retiredFor,
  EMOJI,
  EMOJI_NAMES,
  canonicalFor,
  planLabels,
  labelSpec,
  displayName,
  labelKey,
  isLabel,
  resolveLabel,
};
