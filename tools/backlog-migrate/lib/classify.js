// Classify parsed BACKLOG entries into migration verdicts (RFD 004 §5.2–§5.4).
//
// Pure: the only outside input is `remote` — the issue and PR lists `plan`
// already fetched — so the same code runs offline in tests and online in a
// real plan. Verdict precedence, first match wins:
//
//   skip-section → already-migrated → resolved (skip-resolved | review)
//   → device-test → link → review (similar open issue) → create
//
// `review` never files anything: `apply` skips it until overrides.json
// turns it into something else. That is deliberate — a guess that files a
// duplicate or re-opens finished work is worse than a row a human reads.

const {
  entryKey,
  renderTitle,
  normalizeTitle,
  stripMarkdown,
  markerKeys,
  bodyHash,
} = require('./render');
const { AREA: CONFIGURED_AREAS } = require('../../labels/lib/labels');

const KNOWN_REPOS = [
  'alate',
  'loom',
  'badige',
  'mood-layer',
  'litmus',
  'tessellate-pages',
  'forge',
  'code-standards',
];

// ── resolved / residual ─────────────────────────────────────────────────────
const STATUS_WORD = /\b(RESOLVED|CLOSED|SHIPPED|SUPERSEDED|DONE)\b/g;

// "code half DONE", "partly done" — progress, not a status.
const QUALIFIER = /\b(half|partly|partially|mostly|part|not|never|un)\s*$/i;
const RESIDUAL = /Still open|Remaining:|What['’]s left|PARTIAL|open\)/;

function statusWord(line) {
  for (const m of String(line).matchAll(STATUS_WORD)) {
    if (!QUALIFIER.test(line.slice(Math.max(0, m.index - 16), m.index))) {
      return m[1];
    }
  }
  return null;
}

function resolvedMarker(entry) {
  if (entry.struck) {
    return 'struck title';
  }
  if (/~~P\d~~/.test(entry.statusLine)) {
    return 'struck priority';
  }
  const w = statusWord(entry.kind === 'list' ? entry.statusLine : entry.title);
  return w ? w : null;
}

// ── device-test routing ─────────────────────────────────────────────────────
const DEVICE_TEST = [
  /^manual device tests?\b/i,
  /\bverify\b.*\bon (a )?real (device|phone)/i,
];

// ── needs-input ─────────────────────────────────────────────────────────────
const NEEDS_INPUT =
  /Blocking on the user|Decision needed|Needs input|Owner: user \(decision\)/i;

// ── type ────────────────────────────────────────────────────────────────────
const TYPE_RULES = {
  bug: /\b(broken|breaks|fails?|failing|crash(es|ing)?|regression|5\d\d|error)\b/i,
  chore:
    /\b(CI|deps|dependenc(y|ies)|dependabot|CVE-[\d-]+|vulnerabilit(y|ies)|lint|eslint|runners?|timeouts?|timeout-minutes|bump|upgrade|secrets?)\b/i,
  refactor: /\b(consolidate|retire|collapse|extract|dedupe|restructure)\b/i,
};

/**
 * Title only: bodies are long narratives that mention "error" or "CI" in
 * passing, and reading them turned UX features into chores. One signal →
 * that type; none → feature; two or more → null (left to triage).
 */
function inferType(title) {
  const lead = stripMarkdown(title);
  const hits = Object.keys(TYPE_RULES).filter(t => TYPE_RULES[t].test(lead));
  if (hits.length === 0) {
    return 'feature';
  }
  return hits.length === 1 ? hits[0] : null;
}

// ── area (owner amendment to Q6, 2026-09-19) ────────────────────────────────
// Only loom and alate carry area labels. mood-layer's existing ones are left
// untouched and never inferred; badige has none.
const AREA_KEYWORDS = {
  loom: {
    'admin-ui': { paths: [/^admin\//], words: /\b(admin|UI|dashboard)\b/i },
    api: { paths: [/^api\//], words: /\b(endpoints?|API)\b/ },
    sdk: { paths: [/^sdk\//], words: /\bSDK\b/i },
    extension: {
      paths: [/^extensions\//],
      words: /\b(theme[- ]app extension|extensions?|Liquid)\b/i,
    },
    supabase: {
      paths: [/^supabase\//],
      words: /\b(schema|migrations?|RLS|junction table|supabase)\b/i,
    },
    infra: {
      paths: [/^\.github\//],
      words: /\b(CI|eslint|lint|watchdog|Vercel|deploy(s|ment)?)\b/,
    },
  },
  alate: {
    mobile: {
      paths: [/^mobile\//],
      words:
        /\b(screens?|iOS|Android|OTA|dark mode|APK|Expo|on-device|push notifications?)\b/i,
    },
    backend: {
      // Generic: counts only for a path no specific area below claims.
      fallback: true,
      paths: [/^backend\//],
      words: /\b(backend|endpoints?|edge functions?)\b/i,
    },
    scraper: {
      paths: [
        /(^|\/)(productScraping|scrapeJobs)\//,
        /^backend\/api\/(cron\/)?scrape/,
      ],
      words: /\bscrap(e|er|es|ing)\b/i,
    },
    'fit-engine': {
      paths: [/(^|\/)(fitGuidance|sizeFinder)\//, /^backend\/api\/size-finder/],
      words:
        /\b(fit[- ]engine|fit guidance|sizing|size (chart|translation)s?|calibration)\b/i,
    },
    infra: {
      paths: [/^\.github\//],
      words: /\b(CI|runners?|workflows?|GitHub Actions|Dependabot|deploys?)\b/,
    },
  },
};

// Rules count only for areas in that repo's CONFIGURED label set
// (tools/labels AREA): a keyword rule for a repo or an area bootstrap does
// not create can never produce a label the repo cannot have.
const AREA_RULES = Object.fromEntries(
  Object.entries(CONFIGURED_AREAS).map(([r, set]) => [
    r,
    Object.fromEntries(
      set
        .map(l => l.name)
        .filter(a => AREA_KEYWORDS[r] && AREA_KEYWORDS[r][a])
        .map(a => [a, AREA_KEYWORDS[r][a]])
    ),
  ])
);
const AREA_SETS = Object.fromEntries(
  Object.entries(AREA_RULES).map(([r, rules]) => [r, Object.keys(rules)])
);

const PATH_TOKEN =
  /(?:^|[\s`(["'])((?:\.\/)?\.?[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]*)/g;

/** Areas a path belongs to; a specific area beats a `fallback` one. */
function pathAreas(rules, p) {
  const hit = Object.keys(rules).filter(a =>
    rules[a].paths.some(re => re.test(p))
  );
  const specific = hit.filter(a => !rules[a].fallback);
  return specific.length ? specific : hit;
}

/**
 * Confident matches only. A title that names exactly one area wins; else body
 * paths decide when ≥2 point at one area with a ≥75% share. Anything else is
 * left empty for a human — a wrong area label is worse than none.
 */
function inferArea(repo, title, body) {
  const rules = AREA_RULES[repo];
  if (!rules) {
    return null;
  }
  const plain = stripMarkdown(title);
  const titlePaths = [...String(title).matchAll(PATH_TOKEN)].map(m =>
    m[1].replace(/^\.\//, '')
  );
  const inTitle = Object.keys(rules).filter(
    a =>
      rules[a].words.test(plain) ||
      titlePaths.some(p => pathAreas(rules, p).includes(a))
  );
  if (inTitle.length === 1) {
    return inTitle[0];
  }
  if (inTitle.length > 1) {
    return null;
  }

  const votes = {};
  let total = 0;
  for (const m of String(body).matchAll(PATH_TOKEN)) {
    const p = m[1].replace(/^\.\//, '');
    const hit = pathAreas(rules, p);
    if (hit.length !== 1) {
      continue;
    }
    votes[hit[0]] = (votes[hit[0]] || 0) + 1;
    total++;
  }
  const [best] = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (best && best[1] >= 2 && best[1] / total >= 0.75) {
    return best[0];
  }
  return null;
}

// ── references ──────────────────────────────────────────────────────────────
// A bare `#N` after these words is a regression-log row, an anti-pattern or
// a step number — not a GitHub reference.
const NOT_A_REF =
  /\b(log|row|rows|pattern|AP|step|stage|phase|rule|item|entry)\s*$/i;

function extractRefs(text, sourceRepo) {
  const out = [];
  const seen = new Set();
  const add = (repo, n) => {
    const k = `${repo}#${n}`;
    if (seen.has(k)) {
      return;
    }
    seen.add(k);
    out.push({ repo, number: Number(n) });
  };
  const s = String(text);
  const re =
    /https:\/\/github\.com\/Tessellate-Studio\/([\w.-]+)\/(?:issues|pull)\/(\d+)|(?<![\w/])([a-z][\w-]*)#(\d+)\b|(?<![\w/#&])#(\d+)\b/gi;
  for (const m of s.matchAll(re)) {
    if (m[1]) {
      add(m[1], m[2]);
    } else if (m[3]) {
      if (KNOWN_REPOS.includes(m[3].toLowerCase())) {
        add(m[3].toLowerCase(), m[4]);
      }
    } else if (!NOT_A_REF.test(s.slice(Math.max(0, m.index - 20), m.index))) {
      add(sourceRepo, m[5]);
    }
  }
  return out;
}

// ── title similarity ────────────────────────────────────────────────────────
const STOP = new Set(
  "the and for with from into onto that this than then when what which while are was were has have had not but its it's all any one per via our your their them they you who why how can may should would could will just only also both each more most some such own same so too very new".split(
    ' '
  )
);
function tokens(s) {
  return new Set(
    stripMarkdown(s)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3 && !STOP.has(w))
  );
}

/** Shared tokens over the smaller set; needs ≥2 shared to count at all. */
function overlap(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  let n = 0;
  for (const w of A) {
    if (B.has(w)) {
      n++;
    }
  }
  if (n < 2) {
    return 0;
  }
  return n / Math.min(A.size, B.size);
}

function targetRepoOf(entry, sourceRepo) {
  const head = `${entry.statusLine}\n${entry.text
    .split('\n')
    .slice(0, 2)
    .join(' ')}`;
  const m = head.match(
    /\((alate|loom|badige|mood-layer|litmus|tessellate-pages|forge) repo\)/i
  );
  if (m) {
    return m[1].toLowerCase();
  }
  if (/litmus fast-follow/i.test(head)) {
    return 'litmus';
  }
  return sourceRepo;
}

const isOpen = x => String(x.state).toUpperCase() === 'OPEN';
const labelNames = x =>
  (x.labels || []).map(l => (typeof l === 'string' ? l : l.name));

/**
 * Copy the parsed entries (classify runs twice per online plan, so it must
 * never mutate its input) and give each a key. A second entry with the same
 * normalized title gets its own occurrence-suffixed key, so an override can
 * address each of the two rows separately.
 */
function keyedEntries(parsed, repo) {
  const first = new Map();
  const count = new Map();
  return parsed.entries.map(e => {
    const base = entryKey(repo, e.title);
    const n = (count.get(base) || 0) + 1;
    count.set(base, n);
    if (n === 1) {
      first.set(base, e.startLine);
      return { ...e, key: base };
    }
    return {
      ...e,
      key: entryKey(repo, `${e.title} #${n}`),
      duplicateOf: first.get(base),
    };
  });
}

function applyMerges(entries, overrides) {
  const byKey = new Map(entries.map(e => [e.key, e]));
  for (const k of Object.keys(overrides)) {
    if (!byKey.has(k)) {
      throw new Error(
        `overrides.json names unknown key ${k} — re-run plan and copy the key from the table`
      );
    }
  }
  const out = [];
  for (const e of entries) {
    const o = overrides[e.key];
    if (o && o.mergeInto) {
      const into = byKey.get(o.mergeInto);
      if (!into) {
        throw new Error(`mergeInto names unknown key ${o.mergeInto}`);
      }
      into.text = `${into.text}\n\n${e.text}`;
      into.endLine = Math.max(into.endLine, e.endLine);
      continue;
    }
    out.push(e);
  }
  return out;
}

/**
 * @param parsed   parseBacklog() output
 * @param opts.repo       source repo short name
 * @param opts.sourceSha  7-char SHA the text was read at
 * @param opts.remote     { [repo]: { issues: [...], prs: [...] } } or null (offline)
 * @param opts.overrides  { [key]: {verdict, priority, title, labels, targetRepo, mergeInto, split} }
 */
function classifyEntries(parsed, opts) {
  const { repo, sourceSha, remote = null, overrides = {} } = opts;
  const entries = applyMerges(keyedEntries(parsed, repo), overrides);

  const markerIndex = {};
  for (const [r, data] of Object.entries(remote || {})) {
    for (const i of data.issues || []) {
      for (const k of markerKeys(i.body)) {
        markerIndex[`${r}:${k}`] = i.number;
      }
    }
  }

  const rows = entries.map(e => {
    const key = e.key;
    const section = e.section;
    const o = overrides[key];

    // A targetRepo override must be known BEFORE dedupe/link, or the link
    // target is picked from the wrong repo's issues.
    const targetRepo = (o && o.targetRepo) || targetRepoOf(e, repo);
    const refs = extractRefs(e.text, repo);
    const row = {
      key,
      startLine: e.startLine,
      endLine: e.endLine,
      sectionHeading: section.heading,
      rawPriority: section.rawPriority || null,
      priority: section.priority || null,
      deferredUntil: section.deferredUntil || null,
      title: renderTitle(e.title),
      normalizedTitle: normalizeTitle(e.title),
      kind: e.kind,
      sourceRepo: repo,
      sourceSha,
      targetRepo,
      type: inferType(e.title),
      area: inferArea(targetRepo, e.title, e.text),
      labels: [],
      refs,
      linkTo: null,
      decisionPr: null,
      suggestSplit: e.suggestSplit || [],
      notes: [],
      text: e.text,
      hash: bodyHash(e.text),
      bodyChars: e.text.length,
      briefs: [
        ...new Set(
          (e.text.match(/docs\/backlog\/[\w.-]+\.md/g) || []).map(s => s)
        ),
      ],
      verdict: null,
    };
    if (targetRepo !== repo) {
      row.notes.push(`target inferred: ${targetRepo}`);
    }

    // An inferred area the TARGET repo does not carry yet (loom's alate
    // entry, before alate's bootstrap) would make apply refuse. Dropped here,
    // in the reviewed table, rather than guessed at apply time.
    const targetLabels =
      remote && remote[targetRepo] && remote[targetRepo].labels;
    if (row.area && targetLabels) {
      const have = new Set(
        targetLabels.map(l => String(l.name || l).toLowerCase())
      );
      if (!have.has(row.area.toLowerCase())) {
        row.notes.push(`area ${row.area} dropped: ${targetRepo} lacks it`);
        row.area = null;
      }
    }
    if (e.tombstones) {
      row.notes.push(`${e.tombstones} tombstone paragraph(s) in body`);
    }
    if (row.suggestSplit.length) {
      row.notes.push(`suggestSplit: ${row.suggestSplit.join(', ')}`);
    }
    if (section.needsInput || NEEDS_INPUT.test(e.text)) {
      row.labels.push('needs-input');
    }
    if (e.duplicateOf) {
      row.notes.push(`same title as L${e.duplicateOf}`);
    }

    row.verdict = decide(row, e, section, remote, markerIndex);
    if (e.duplicateOf && row.verdict === 'create') {
      row.verdict = 'review';
    }

    if (o) {
      if (o.verdict) {
        row.verdict = o.verdict;
      }
      if (o.priority) {
        row.priority = o.priority;
      }
      if (o.title) {
        row.title = renderTitle(o.title);
      }
      if (o.labels) {
        row.labels = [...new Set([...row.labels, ...o.labels])];
      }
      if ('area' in o) {
        row.area = o.area;
      }
      if ('type' in o) {
        row.type = o.type;
      }
      if (o.split) {
        row.split = o.split;
      }

      // An entry written before its decision PR existed may not match it by
      // title (mood-layer's analytics entry vs "decision: … (ADR-002)").
      if (o.decisionPr) {
        row.decisionPr = Number(o.decisionPr);
        if (!row.labels.includes('needs-input')) {
          row.labels.push('needs-input');
        }
      }

      // A residual filed below its section's priority (Q3) keeps its trigger.
      if (o.deferredUntil) {
        row.deferredUntil = o.deferredUntil;
      }
      row.notes.push('override applied');
    }
    return row;
  });
  return rows;
}

/**
 * An open `decision` PR this entry waits on (§5.3): one the entry references
 * by number, or — because entries written before the decision PR existed do
 * not cite it (alate#926, badige#83 at the pinned SHAs) — one whose title,
 * minus its "decision: ADR 011:" prefix, overlaps the entry's title. Title
 * only: bodies cite decision docs as context, and matching on a cited doc id
 * tied alate's cross-brand entry to an unrelated pitch.
 */
function findDecisionPr(row, prs) {
  const open = prs.filter(p => isOpen(p) && labelNames(p).includes('decision'));
  const referenced = open.find(p =>
    row.refs.some(r => r.repo === row.targetRepo && r.number === p.number)
  );
  if (referenced) {
    return referenced.number;
  }
  const bare = t =>
    t
      .replace(/^decision:\s*/i, '')
      .replace(/^(ADR|RFD|Pitch)[\s-]*\d+[^:]*:\s*/i, '');
  let best = null;
  for (const p of open) {
    const score = overlap(row.normalizedTitle, bare(p.title));
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { number: p.number, score };
    }
  }
  if (best) {
    row.notes.push(`decision PR #${best.number} matched by title`);
  }
  return best ? best.number : null;
}

function decide(row, e, section, remote, markerIndex) {
  if (section.kind === 'skip') {
    return 'skip-section';
  }
  if (section.kind !== 'priority') {
    row.notes.push('unrecognised section');
    return 'review';
  }

  const done = markerIndex[`${row.targetRepo}:${row.key}`];
  if (done) {
    row.linkTo = done;
    return 'already-migrated';
  }

  const resolved = resolvedMarker(e);
  if (resolved) {
    if (RESIDUAL.test(e.text)) {
      row.notes.push(
        `resolved + residual (${resolved}) — file the residual only (Q3)`
      );
      return 'review';
    }
    return 'skip-resolved';
  }

  if (DEVICE_TEST.some(re => re.test(stripMarkdown(e.title)))) {
    row.notes.push('route via dtq enqueue');
    return 'device-test';
  }

  const target = remote && remote[row.targetRepo];
  if (!target) {
    return 'create';
  }

  const issues = new Map((target.issues || []).map(i => [i.number, i]));
  const ownRefs = extractRefs(e.title, row.sourceRepo).map(r => r.number);
  const decisionPr = findDecisionPr(row, target.prs || []);
  if (decisionPr) {
    row.decisionPr = decisionPr;
    if (!row.labels.includes('needs-input')) {
      row.labels.push('needs-input');
    }
  }

  for (const ref of row.refs) {
    if (ref.repo !== row.targetRepo) {
      continue;
    }
    const issue = issues.get(ref.number);
    if (!issue || !isOpen(issue) || row.linkTo) {
      continue;
    }
    if (ownRefs.includes(ref.number) || overlap(e.title, issue.title) >= 0.5) {
      row.linkTo = ref.number;
    }
  }
  if (row.linkTo) {
    return 'link';
  }

  for (const i of issues.values()) {
    if (!isOpen(i)) {
      continue;
    }
    if (overlap(e.title, i.title) >= 0.5) {
      row.notes.push(`similar open issue #${i.number}`);
      return 'review';
    }
  }
  return 'create';
}

module.exports = {
  classifyEntries,
  inferArea,
  inferType,
  extractRefs,
  overlap,
  statusWord,
  AREA_SETS,
  KNOWN_REPOS,
};
