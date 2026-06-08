# Platform anti-patterns (app-agnostic)

The cross-app build guardrails every Tessellate app inherits via the `forge`
plugin. Each rule is one crisp directive + why + a one-line precedent — read
before building. App-specific anti-patterns stay in each app's own
`memory/project_anti_patterns.md`; these are the shared eleven.

Stable titles, not integers (integers collide across apps). The parenthetical is
the original alate AP number for traceability.

## Narrative here, thresholds + enforcement in code-standards (single source of truth)

This doc is the **human/agent-facing narrative** — *why* each rule exists and how
to apply it. The **enforceable numbers** (test-coverage %, WCAG level,
secret/vuln/perf checks) live once in **code-standards** — its
`templates/profiles/*.bp-config.yml` and `lib/standards/` — and are enforced
deterministically in CI by `standards inspect` (the `code-inspection.yml` gate).
To change a threshold, change it in code-standards (one place); don't restate
numbers here, so the two can't drift. Rules marked **[enforced]** below have a
deterministic check; the rest are agent-judgment.

---

## TDD-first for data-flow changes (was #7)

Any change to a data pipeline (scrape / enrich / fit-check) or to a
legal/trust-sensitive flow (blocklist, age-gate, deletion) **starts with a
failing test**. Backend = vitest, mobile = jest.
**Why:** these flows have legal/audit implications; the test is the canary
against a silent regression.

## No hardcoded colours, fonts, or alpha values (was #10)

Every colour, font family, and alpha tint comes from a theme token
(`constants/theme.ts`), never an inline literal (`'#7a3a3a'`, `'rgba(...)'`,
`fontFamily: 'serif'`). Need a value the tokens don't expose? Add the token
first, then use it.
**Why:** one source of truth for the palette; a hardcoded literal is design
drift compounding. *Precedent: a clay-red destructive button copied as "the
pattern" before the clash was caught.*
**Exceptions:** pure white/black/`transparent`, monochrome alphas over full-bleed
imagery, SVG/canvas art values, and `theme.ts` itself.

## No React hook below a conditional return (was #11)

Every hook is called in the same order on every render. No `use*()` below an
`if (x) return <Y/>` guard — early returns come AFTER all hooks. Bail out inside
the hook callback, not by skipping the hook.
**Why:** React tracks hooks by call order. A hook-count change **white-screens
release builds silently** (no log, no error boundary). *Precedent: a `useEffect`
below an age-gate early return blanked the whole app on "I'm 16 or older".*

## Don't guess a custom font's family name; single-weight = the weight it ships (was #12)

The `useFonts` key AND `fontFamily:` must be the ttf's **Family Name (NameID 1
from the `name` table)** — parse it, don't guess the basename/alias/PostScript
name. A single-weight font must be used at its shipped weight only
(`fontWeight: '400'`); never request a bold it doesn't have.
**Why:** mismatches fail silently → system fallback (e.g. Noto Serif Bold), wrong
glyphs, no warning. *Precedent: 3 build cycles chasing `'ViaodaLibre'` vs the
correct `'Viaoda Libre'`.*

## Comment the *why* of load-bearing code (was #15)

When code embodies a non-obvious decision — a resilience step, workaround,
ordering constraint, "looks removable but isn't" — write a short comment stating
WHY it exists and what breaks if removed.
**Why:** un-explained code gets "cleaned up" / "paused to cut cost" by the next
reader (future you, a teammate, an agent). *Precedent: an AI enrich step that was
actually a resilience fallback got paused for cost; restored same day with a "do
not silence" comment.*

## Diagnose from the authoritative source, not an inferred proxy (was #16)

When a fix hinges on a fact — what a library actually does, what string got
inlined, which config the platform reads — confirm it against the ground-truth
source (read `node_modules/<pkg>` source, the `.env`, the live request) before
writing the fix. Not convention, not the docs, not an error message's wording.
**Why:** ground truth is one `Read`/`grep` away; a wrong inference costs a full
build→deploy→test cycle. *Precedent: inferred an OAuth redirect scheme from
convention, shipped it, failed — the package source plainly showed the real
value.* (Fixes-half of the authoritative-claims standard.)

## WCAG 2.1 AA is a requirement, not a later polish pass (was #17)

Every screen ships meeting WCAG 2.1 AA: text contrast ≥4.5:1 (3:1 large),
non-text/icon contrast ≥3:1, 44×44px visible touch targets, SR role + label on
every interactive control, and motion gated on `useReducedMotion()`. A heading/
brand SVG counts as text — judge its fill against its surface.
**Why:** legal-adjacent (ADA, EN 301 549, Play Store) and a trust signal; cheap
designed-in, expensive retrofitted. *Precedent: one deferred-a11y audit surfaced
twelve failures in a single pass.* Run an accessibility review before merging a
new screen.

## CI never emits a secret; fail closed (was #19)

A CI workflow must never (a) print secret material into a build log, or (b)
substitute a hardcoded credential when a secret is missing. Missing required
secret → `exit 1` + `::error::`. Restore secrets from the store only; pass via a
step `env:` block, never inline `${{ }}` in a `run:` body.
**Why:** Action logs are world-readable the instant a repo goes public, and
visible to all collaborators meanwhile. OWASP A05. *Precedent: a keystore step's
`else` branch base64-printed a key into public logs.*

## Speak from authority, not assumption — MOST IMPORTANT (was #20)

Every assertion/status claim cites a verified source (`file:line`, SHA, MCP tool,
CLI). Unverifiable → label it a hypothesis. If the sentence still reads true with
"probably/should be/I think" inserted, you're inferring.
**Why:** assumption-shaped answers burn the user's trust budget and trigger
re-verification / undo / fixing non-problems. See the full
[`authoritative-claims.md`](./authoritative-claims.md) standard — this is its
one-line index.

## Enriched output ships only when data flows end-to-end (was #21)

A feature that promises richer output (a warning with a cm range, a new card
field, a badge) is **not shipped** until the value renders on a real device.
Backend rule / new response field = plumbing, not the feature. Scope the PR
end-to-end (source → backend → API → mobile parser → component → pixel); don't
close the BACKLOG/regression entry on the plumbing PR.
**Why:** every layer passes its own tests while the user sees nothing because one
hop didn't pass the value through. *Precedent: a sleeve-cm warning shipped
"done" backend-only; users saw it two PRs later when the mobile wire landed.*
**Smell test:** grep the mobile code for the new field name — zero hits = not done.

## Layouts must be elastic — never assume one rendering context (was #22)

Build for narrow (Fold cover), large system font, tablet/foldable rotation, and
unbounded content length. Chip/badge strips get `flexWrap` + `flexShrink`;
control+wrappable-text rows top-align (`flex-start`), never centre; no hardcoded
absolute sizes in reflowable layouts; use `useWindowDimensions()` (never a
module-load `Dimensions.get`); don't cap font scaling — accept the larger text.
**Why:** none of this shows in the default emulator frame, so it ships green and
breaks on a real device. a11y sibling of the WCAG rule. *Precedent: currency
chips clipped on the Fold cover at large font; dock animated off-screen on tablet
rotation from a stale dimensions snapshot.*

---

_Generalized from alate's `project_anti_patterns.md` (the canonical source).
App-specific anti-patterns (scraping posture, body-data handling, heading-SVG
geometry, native-config sync) stay in each app's local memory._
