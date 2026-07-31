# RFD 002: Module-graph cost as a platform rule

**Date:** 2026-07-30
**State:** committed
**Author:** Saptami Ram (with Claude Opus 5)

## Background

Between 2026-07-27 and 2026-07-30, four separate changes in `alate` fixed the
same defect: a test imported one small thing and loaded a large fraction of the
application to get it.

| PR | What was wanted | What actually loaded |
|---|---|---|
| [alate#402](https://github.com/Tessellate-Studio/alate/pull/402) | `extractBrandFromUrl`, a 12-line pure function | `services/api` + avatarStore + deviceStore + zustand persist + AsyncStorage rehydration |
| [alate#457](https://github.com/Tessellate-Studio/alate/pull/457) | 3 navigation hooks, all of them overridden anyway | 110 `@react-navigation/{core,native,routers}` modules |
| [alate#460](https://github.com/Tessellate-Studio/alate/pull/460) c1 | `tabPillScrollClearance`, a layout number | 621 modules |
| [alate#460](https://github.com/Tessellate-Studio/alate/pull/460) c4 | `pickInitialRoute`, 4 lines of pure logic | 778 modules |

Measured cold, per test file, with a transform-level instrument (wraps
`babel-jest`; records per-module transform time and execution self-time with
child time subtracted so a parent never absorbs a child's cost):

    navigator.avatarGate.test.ts    803 -> 25 modules    94 % of module load removed
    HomeScreen.test.tsx             741 -> 120 modules   82 %
    screenSmoke.test.tsx            663 -> 409 modules   30 %

The mechanism is always the same, and it is invisible at the callsite. Two of
the four were **re-exports**: `AppNavigator` re-exported a constant that lives in
`FloatingTabBar`, so `import { tabPillScrollClearance } from '../navigation/AppNavigator'`
read identically to any other import while pulling all eleven screens plus
`native-stack` and `bottom-tabs`. `AccountScreen.tsx:50` already imported the same
constant from the leaf; nothing flagged that `HomeScreen.tsx` did not.

Three facts make this a platform concern rather than an alate bug:

1. **`import type` is load-bearing, not style.** `FitResultScreen` was unaffected
   only because its `AppNavigator` import was type-only and babel elides it. The
   difference between a safe and a catastrophic import is one keyword.
2. **Nothing in CI can catch it.** All 824 alate tests stayed green throughout.
   A re-export added tomorrow re-adds 600+ modules with no red build.
3. **Cost scales with test-file count, not codebase size.** Jest builds a fresh
   module registry per test file, so the graph is paid ~75 times per alate run.

This RFD proposes writing the rule down in forge and choosing one enforcement
mechanism, rather than relying on reviewers noticing an import path.

## Prior Art

Research conducted 2026-07-30 via WebSearch/WebFetch. This is a well-documented
industry problem with a named canonical writeup, not a local quirk.

### How others solve this

- **Atlassian** ([atlassian.com](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)):
  removed barrel files across 90,000+ files and thousands of internal packages.
  Reported **local unit testing ~50 % faster on average, "up to 10x" for certain
  packages**; 88 % fewer tests run per build (1600 → 200); **75 % reduction in
  build minutes**; TypeScript highlighting >30 % faster. Mechanism: a **fixable
  ESLint rule that both blocked new barrel imports and rewrote existing ones**,
  fed by an internal dependency-graph tool, rolled out in three waves (dormant
  code first). *Worked.* This is the closest analogue to our situation and the
  strongest signal on mechanism.
- **Marvin Hagemeister** ([marvinh.dev](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)),
  the canonical technical writeup, describes the jest cost precisely: *"each test
  file is executed in its own child process… every single test file constructs
  the module graph from scratch and has to pay for that cost"* — with the worked
  example that a 6 s graph × 100 test files wastes 10 minutes per run doing no
  testing. This is exactly the cost we measured empirically before finding the
  article.
- **Vercel / Next.js** ([vercel.com](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)):
  shipped `optimizePackageImports`, which rewrites barrel imports to direct ones
  automatically — **15–70 % faster dev builds, ~28 % production**. Notable as a
  *vendor working around* the problem rather than fixing consumers, and evidence
  that the fix is mechanical enough to automate.
- **Jest-specific measurement** ([dev.to](https://dev.to/fogel/potential-issues-with-barrel-files-in-jest-1nkl)):
  a single test dropped 2.865 s → 1.31 s (>50 %) purely by converting barrel
  imports to direct ones.

### Existing tools/libraries

- **`@typescript-eslint/no-restricted-imports`** ([typescript-eslint.io](https://typescript-eslint.io/rules/no-restricted-imports/)):
  extends the base ESLint rule with **`allowTypeImports: true`**, which permits
  `import type` from a path while erroring on value imports. This is *exactly*
  the semantic this rule needs, and it is the only tool found that expresses it
  natively.
- **dependency-cruiser** ([github.com](https://github.com/sverweij/dependency-cruiser)):
  a standalone graph tool; more powerful than ESLint (allowlists, cycles,
  orphans) and can express "is this module shared enough". Independent of ESLint
  by design ([issue #529](https://github.com/sverweij/dependency-cruiser/issues/529)
  requests a plugin form).
- **ESLint base `no-restricted-imports`** ([spin.atomicobject.com](https://spin.atomicobject.com/dependency-cruiser-imports/)):
  forbid-only — cannot express an allowlist — but has **far better feedback**
  (editor squiggles at type-time vs a failed CI build).

### Known pitfalls

- **dependency-cruiser false-positives on type-only imports**
  ([issue #127](https://github.com/sverweij/dependency-cruiser/issues/127)): its
  `no-orphans` rule flags files whose exports are only consumed as types. Our
  rule turns entirely on distinguishing `import type` from value imports, so this
  is a direct hit on the tool's weakest area.
- **Rule-config sprawl**: equivalent coverage has been reported as 200+ lines
  spread across ESLint + dependency-cruiser + custom scripts, with regex-heavy
  rules that grow hard to read ([jmulholland.com](https://jmulholland.com/architecture-tools/)).
  Layering tools is itself a cost.
- **CI-time-only feedback is a weak loop**: dependency-cruiser typically reports
  after a failed build, whereas ESLint reports in-editor. The barrel trap is
  cheap to fix at write time and expensive to find later — feedback latency
  matters more than rule expressiveness here.

## Proposal

Three changes, in dependency order. No data model, API surface, or security
model is touched — this is a standards + static-analysis change.

### 1. forge: new anti-pattern in `standards/anti-patterns.md`

Verified absent at forge `0.6.1` and on `origin/master`: zero matches for
`barrel` / `re-export` / `reexport`. New section, siblings of the existing
test-timeout rule:

> **A re-export from a hub module turns "one value" into "the whole graph".**

Content it must carry:

- The mechanism and why it is invisible at the callsite.
- **`import type` is load-bearing, not style** — the one-keyword difference.
- The corollary that **auditing direct importers does not predict breakage**:
  during alate#460 an audit of direct importers passed, and two suites still
  failed with `(0 , _native.createScreenFactory) is not a function`, because the
  real consumer was a *sibling package* (`native-stack`) reached transitively.
- The jest-specific multiplier (fresh registry per test file), citing marvinh.dev
  and the Atlassian numbers so the rule carries external authority.

### 2. forge: measurement section in `standards/testing.md`

Verified absent: that file has 7 sections and no performance guidance. This is
the most reusable output of the alate work and the part that took longest to
derive.

- **Wall clock across separate jest invocations is not comparable** on throttling
  hardware. Measured: the *same* variant at **93 / 43 / 22 / 21 s** across four
  consecutive cold runs as the machine came off thermal throttle — a spread wider
  than most changes worth measuring.
- **Pair variants inside ONE invocation**: both as test files, `--no-cache
  --maxWorkers=2`, so each pays its own transform under identical machine state.
- **Always run the A-vs-A control first.** Measured noise floor **0.04 %**
  (72.214 s vs 72.183 s). Without it, no paired number is trustworthy.
- **Prefer deterministic module counts and within-run ratios** to wall clock.
- The transformer-instrument recipe, including the one non-obvious detail: each
  module's prologue must charge its own transform time to the **parent** frame
  before pushing its own, or parents absorb children and the attribution is
  garbage.

### 3. Enforcement: a fixable ESLint rule per app, NOT a litmus check

**Why a hub list exists at all.** ESLint has no module graph — it sees one file
at a time and cannot know that `AppNavigator` imports eleven screens. Naming the
expensive modules is the only way to express "don't import values from here."
The list *is* the rule's definition of "hub".

For alate the list is not a heuristic, it is **exact**. After
[alate#460](https://github.com/Tessellate-Studio/alate/pull/460), AppNavigator's
entire *named* export surface is types — `AvatarFocusKey`, `RootStackParamList`,
`MainTabParamList` — plus a default component. So "any named value import from
AppNavigator is wrong" is true by construction, not by judgement, and
`allowTypeImports: true` states precisely that.

Cost of the exemption: **one file**. `mobile/App.tsx:32` is the only module that
imports the default (verified by grep across `mobile/`), and `allowTypeImports`
forbids default imports too, so it needs an `overrides` entry. One wart, one
file, justified inline.

Known blind spot: a *new* hub appears and nobody adds it to the list — the rule
silently does not cover it. The complement that needs no list is a custom local
rule, "no `export … from` in a file with ≥N imports", which is entirely
single-file and would have caught the `tabPillScrollClearance` re-export with
zero graph knowledge. It would **not** have caught `pickInitialRoute`, which was
defined in the hub rather than re-exported from it. Not a stock rule (~30 lines).
**Deferred until a third hub appears in any repo** — see Alternatives.

`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`, listing
each repo's hub modules:

```jsonc
"@typescript-eslint/no-restricted-imports": ["error", {
  "paths": [{
    "name": "../navigation/AppNavigator",
    "allowTypeImports": true,
    "message": "AppNavigator imports every screen. Import values from the leaf that defines them; types are fine."
  }]
}]
```

Rollout: **advisory (`warn`) first**, matching litmus's existing "advisory until
the baseline is burned down" convention, then promote to `error`.

alate already runs a `lint-mobile` CI job (green on alate#460), so this costs no
new CI job, and it gives in-editor feedback at write time.

Migration path: none needed. Both known alate offenders are already fixed by
alate#460; the rule is a ratchet against regression, not a cleanup task.

## Alternatives Considered

**A litmus `checks/` rule (my original recommendation — now rejected).**
litmus already scans `mobile/src` statically, and `checks/hardcoded-colors.ts`
opens by citing the forge anti-pattern it enforces, so litmus is genuinely the
"enforcement arm of forge standards" and this looked like a clean fit. It loses
on three counts: it is a hand-rolled regex over source text where a purpose-built
rule already exists with exactly the right `allowTypeImports` semantic; it
reports only after a CI run rather than in-editor, and this trap is cheap to fix
at write time; and it would duplicate coverage ESLint gives for free in a repo
that already lints. **Reconsider only if** we need a cross-app compliance
*report* (e.g. "which apps still have hub re-exports") rather than per-app
prevention — that is a reporting need, not an enforcement one.

**dependency-cruiser.** The most powerful option: allowlists, cycle detection,
orphan detection, and it could express "is this module a hub" structurally rather
than via a hand-maintained list. Rejected because its documented weak spot is
precisely our load-bearing distinction — false positives on type-only imports
([#127](https://github.com/sverweij/dependency-cruiser/issues/127)) — and because
it adds a dependency and a second config surface to every repo for feedback that
arrives later than ESLint's. Atlassian solved the same problem at 90,000-file
scale with an ESLint rule, not a graph tool.

**A module-count budget assertion in the test suite.** Assert that
`navigator.avatarGate.test.ts` loads < N modules. Rejected: it measures the
symptom rather than the cause, the threshold is arbitrary and will be bumped
rather than investigated the first time it trips, and it needs the custom
transformer instrument running in normal CI — a lot of machinery for a check
ESLint does statically.

**Do nothing; rely on review.** Rejected on evidence: four instances in four
days, one of which (`AccountScreen` already using the leaf path) had a correct
example sitting in the same codebase and was still missed.

## Implementation Plan

1. **forge PR — anti-pattern + testing-standard sections + heading merge.** Two
   files (`standards/anti-patterns.md`, `standards/testing.md`). Ship first: the
   rule should exist before anything enforces it, and the ESLint `message` should
   cite it. Includes merging the two duplicate timeout headings (open question 1,
   resolved yes). ~1 hour.
2. **alate PR — ESLint rule at `warn`.** One config file; hub list is
   `navigation/AppNavigator` (the only known hub). Verify `lint-mobile` still
   passes and that the two alate#460 fixes keep it silent. ~30 min.
   **Done — [alate#467](https://github.com/Tessellate-Studio/alate/pull/467)**
   (plus the eight screens converted to explicit `import type`, which the rule
   rightly flagged as syntactic value imports). Ported to its own PR: it was
   authored as #460's fifth commit but pushed ~19 h after that PR's
   squash-merge, so it never reached master from there.
3. **Promote to `error`** once alate is clean for one full cycle. ~5 min.
   **Done — [alate#468](https://github.com/Tessellate-Studio/alate/pull/468)**
   (2026-07-31). The cycle counted was #467's own CI: lint-mobile green with the
   rule live, zero hits — plus the structural argument that the pattern can only
   fire on AppNavigator imports, whose named exports are all types, so a hit is
   a regression by construction. CI's lint-mobile stays continue-on-error; the
   teeth are local `npm run lint` and the editor.
4. **Roll to loom / mood-layer / badige** via their own eslint configs, hub list
   per repo, `warn` → `error` on the same ladder. Only after alate proves it.
   **Surveyed all three on 2026-07-31; outcomes differ by structure, which is
   the point of a per-repo hub list:**
   - **mood-layer — shipped at `warn`**
     ([mood-layer#49](https://github.com/Tessellate-Studio/mood-layer/pull/49),
     `4bad3f3`). Every screen already used `import type`; one line-level
     exemption in `screenSmoke.test.tsx`, whose stated purpose is rendering the
     REAL navigator end-to-end. Its `pickInitialRoute` deliberately stays on the
     hub — sole external consumer is that same smoke file, which loads the whole
     graph anyway, so a leaf extraction would change no measured cost. Extract
     on the second consumer. Pattern probe-verified against the `@/` alias form.
   - **loom — not applicable, no rule added.** Serverless API handlers (each an
     entry point and its own graph root) + a Next.js admin that code-splits per
     page. No hub exists; the only barrel-file grep hits were node_modules. A
     rule with an empty hub list is dead config. Revisit if a shared-module hub
     ever appears.
   - **badige — deferred, recorded.** A real barrel exists
     (`src/navigation/index.ts` re-exporting four navigators) but its sole
     consumer is `App.tsx` importing `RootNavigator` — the entry point, which
     legitimately loads everything. Repo is dormant (last commit a build
     chore), on legacy `.eslintrc.js`, with a dirty working tree and the
     documented dual-clone history. Bootstrapping the guard there is cost
     without benefit today; apply it when badige development resumes.

Deliberately NOT in scope: the litmus check (see Alternatives), and any sweep of
other repos for existing offenders — this is a ratchet, not a cleanup.

## Open Questions

All three resolved by Saptami on 2026-07-30. Recorded rather than deleted, so the
reasoning survives.

- [x] **Merge the two timeout headings?** **Yes — merged.** Lines 34 and 300 of
      `standards/anti-patterns.md` were *"A test times out where it yields — never
      raise the timeout to fix a flake"* and *"A test timeout fires where the test
      YIELDS, not where the time is SPENT"*. Not pure duplicates — the second
      carried the time-each-step / expensive-vs-expensive-once procedure — so the
      merge keeps both bodies, with the procedure as sub-steps under one heading.
      Folded into step 1 of the Implementation Plan.
- [x] **Is the hand-maintained hub list acceptable?** **Yes.** See the Proposal
      §3 rationale added above: ESLint has no module graph, so the list is the
      only way to express the rule; and for alate it is exact rather than
      heuristic, because AppNavigator's named export surface is now types only.
      Blind spot (a new, unlisted hub) is accepted, with the no-list complement
      deferred until a third hub appears.
- [x] **Does the svg coverage invariant need enforcement?** **No — it stays a
      comment.** `FitResultScreen.test.tsx` mocks `react-native-svg` and
      `screenSmoke.test.tsx` deliberately keeps it real, with paired comments in
      both files explaining why. Building a litmus check for a single invariant
      guarded by two comments is more machinery than the risk warrants. Revisit
      only if the invariant is actually broken once.
