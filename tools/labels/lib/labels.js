// The canonical label set for every Tessellate repo (RFD 004 §2–§3), and the
// pure diff that decides what bootstrap would create or edit.
//
// One colour and one description everywhere: issue forms SILENTLY drop a
// label the repo does not have, so a missing `feature` label means every
// feature filed through the form is unlabelled and nobody is told.

const {
  CLAIM_LABEL,
  CLAIM_LABEL_COLOR,
  CLAIM_LABEL_DESC,
} = require('../../work-claim/lib/claim');

// Owner ruling 2026-09-19: the descriptions keep the "Priority N — " prefix
// that the P labels were created with on 2026-09-18 in every repo, so
// bootstrap is a no-op for them instead of rewriting five repos' labels.
const PRIORITY = [
  {
    name: 'P0',
    color: 'B60205',
    description: 'Priority 0 — blocker / pre-launch',
  },
  { name: 'P1', color: 'D93F0B', description: 'Priority 1 — do next' },
  { name: 'P2', color: 'FBCA04', description: 'Priority 2 — soon' },
  { name: 'P3', color: 'C5DEF5', description: 'Priority 3 — later' },
];

const TYPE = [
  { name: 'bug', color: 'D73A4A', description: "Something isn't working" },
  { name: 'feature', color: '0E8A16', description: 'New functionality' },
  {
    name: 'chore',
    color: 'FEF2C0',
    description: 'Maintenance, dependencies, config',
  },
  {
    name: 'refactor',
    color: '7057FF',
    description: 'Code restructuring without behavior change',
  },
];

const LIFECYCLE = [
  {
    name: 'decision',
    color: '0E8A16',
    description:
      'A plan awaiting owner decision (draft PR): merge = approve, close = reject',
  },
  {
    // Text and colour are the ones standards/workflows.md prescribes.
    name: 'on hold',
    color: 'BFD4F2',
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
    color: 'C2E0C6',
    description:
      'Blocked on a human answer that is not a doc approval, or on an open decision PR',
  },
  {
    // Not FBCA04 (P2's colour, until 2026-09-25) — an untriaged issue must
    // not read as a P2.
    name: 'needs-triage',
    color: 'D876E3',
    description: 'Filed without a P label — triage sets exactly one of P0–P3',
  },
];

const PROVENANCE = [
  {
    name: 'migrated-from-backlog',
    color: 'EDEDED',
    description: 'Filed by backlog-migrate from BACKLOG.md (RFD 004)',
  },
];

// RFD-003 device-test queue. Colour per standards/workflows.md
// ("Device-test queue": every queue label is 5319e7).
const DEVICE_TEST = [
  {
    name: 'device-test',
    description: 'A pending on-device test (one issue per test)',
  },
  {
    name: 'needs-human',
    description: 'This device test needs a person, not an agent',
  },
  {
    name: 'needs-build',
    description: 'No installable build can reach this test yet',
  },
  {
    name: 'parked',
    description: 'Open, but deliberately not drained — the owner parked it',
  },
  {
    name: 'failed',
    description: 'This device test failed — see the latest comment',
  },
  {
    // On a PR, not a test: merged before its device test passed, on purpose
    // (hooks/merge-gate.mjs). Created ad hoc by the hook's hint, in P1's
    // colour, until it joined the registry on 2026-09-25.
    name: 'device-unverified',
    description: 'Merged before its device test passed',
  },
].map(l => ({ ...l, color: '5319E7' }));

/** The registry entry for one label, by name — for code that has to tell
 *  someone to create or apply it, so the hint cannot drift from the set. */
function labelSpec(name) {
  const all = [
    ...PRIORITY,
    ...TYPE,
    ...LIFECYCLE,
    ...PROVENANCE,
    ...DEVICE_TEST,
  ];
  const found = all.find(l => l.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new Error(
      `"${name}" is not in the label registry (tools/labels/lib/labels.js)`
    );
  }
  return found;
}

// Owner amendment to RFD 004 Q6 (2026-09-19): area labels in loom and alate
// ONLY. loom keeps its existing set as-is (colours and descriptions copied
// from the live repo, so bootstrap is a no-op for them). alate's set is new
// and is created when alate is bootstrapped (RFD step 5). mood-layer's
// existing area labels are left untouched — bootstrap never deletes — and
// badige gets none.
const AREA = {
  loom: [
    {
      name: 'admin-ui',
      color: '1D76DB',
      description: 'Embedded Shopify admin app (admin/)',
    },
    {
      name: 'api',
      color: '5319E7',
      description: 'Serverless endpoints (api/)',
    },
    {
      name: 'sdk',
      color: 'BFDADC',
      description: 'Shared SDK — enrichments, shopify, supabase (sdk/)',
    },
    {
      name: 'extension',
      color: 'D4C5F9',
      description: 'Shopify theme-app extension (extensions/)',
    },
    {
      name: 'supabase',
      color: 'F9D0C4',
      description: 'Schema, migrations, RLS',
    },
    { name: 'infra', color: 'E4E669', description: 'Infrastructure/CI/CD' },
  ],
  alate: [
    { name: 'mobile', color: '1D76DB', description: 'Expo app (mobile/)' },
    {
      name: 'backend',
      color: '5319E7',
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
      color: 'D4C5F9',
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
  TYPE,
  LIFECYCLE,
  PROVENANCE,
  DEVICE_TEST,
  AREA,
  LEGACY_PRIORITY,
  canonicalFor,
  planLabels,
  labelSpec,
};
