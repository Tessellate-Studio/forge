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
    description: 'No installable build can reach this test yet',
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
];

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

function canonicalFor(repo) {
  const short = repo.includes('/') ? repo.split('/')[1] : repo;
  return [
    ...PRIORITY,
    ...TYPE,
    ...LIFECYCLE,
    ...PROVENANCE,
    ...DEVICE_TEST,
    ...(AREA[short] || []),
  ];
}

/**
 * Diff existing labels against the canonical set. Names match
 * case-insensitively (GitHub treats them that way); colours too.
 * Returns { create, edit, ok, legacy } — never a delete.
 */
function planLabels(existing, canonical) {
  const byName = new Map(existing.map(l => [l.name.toLowerCase(), l]));
  const out = { create: [], edit: [], ok: [], legacy: [] };
  for (const want of canonical) {
    const have = byName.get(want.name.toLowerCase());
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
  canonicalFor,
  planLabels,
};
