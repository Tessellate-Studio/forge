# Platform anti-patterns (app-agnostic)

The cross-app build guardrails every Tessellate app inherits via the `forge`
plugin. Each rule is one crisp directive + why + a one-line precedent — read
before building. App-specific anti-patterns stay in each app's own
`memory/project_anti_patterns.md`; these are the shared twelve.

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

## A test times out where it yields — never raise the timeout to fix a flake

**A per-test timeout can only fire where the test hands control back to the
runtime.** Synchronous work — module load, a cold `render`, the first
`fireEvent.changeText`, any `execSync`/`*Sync` call — blocks the very timer
that would kill it, so wall-clock is not the risk metric. Measured: tests with
no `await` at all passed at 14,405 ms and at **50,723 ms** under a 5,000 ms
budget, while an *awaiting* test in the same file died at 12,647 ms. **The
flaky test is rarely the slow one; it is the awaiting one.**

Yielding is necessary but not sufficient — the yield must reach the event loop's
**timer phase**. `waitFor` polls on real interval timers, so it reliably gets
there; a microtask-only `act(async () => {})` settle usually does not (an
awaiting `act()` test passed at 15,562 ms). So:

- **When the awaited work is a mocked immediately-resolved promise, `waitFor`
  buys nothing but exposure.** Settle it inside `act()` and assert
  synchronously. Check the mock first — a `waitFor` over a genuinely deferred or
  never-resolving promise must stay.
- **Time the steps before you trust the stack.** The reported frame is just
  whichever call yielded first, so it is routinely an innocent one. Instrument
  each step and fix whatever actually burned the budget. *Precedent: a 5,000 ms
  budget blown by 13,021 ms of `execSync('npm audit')` — reported against a
  59 ms `generateDocs` two calls downstream. The audit could not even succeed
  (no lockfile → `ENOLOCK`), so the fix was to delete the work, not defer it.*
- **Fire an async handler inside the act scope**, not before it:
  `await act(async () => { fireEvent.press(…) })`. `fireEvent`'s own `act()`
  covers only the synchronous part of the handler; post-`await` `setState` lands
  outside it.
- **Never raise the timeout.** It re-prices the symptom and leaves the
  load-scaling intact. *Precedent: one such raise (5 s → 15 s) bought 3× while
  machine load ate 20×; the next failure was 19,111 ms — over the raised ceiling
  too.*
- **Verify cold.** A warm jest transform cache hides this class completely: one
  file was green across three full runs and failed **2 of 3** with
  `npx jest --clearCache` first (21,885 ms / 5,831 ms), the passing run clearing
  the budget by 543 ms. A green warm run is not evidence a timeout flake is
  fixed — which is exactly how one such "fix" shipped incomplete and its file
  still failed cold afterwards.

**Why:** every symptom points at the wrong test. The slowest test is the safest
one, the failure is non-deterministic and machine-dependent, and React emits
**zero** "not wrapped in act" warnings — so the act-warning theory is not the
mechanism. *Precedent: three regression rows on one codebase (alate 63,
2026-07-26a, 2026-07-26b) before the pattern was named; the third was found only
by inspecting the structural twin of the second, and it was already failing.*

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

## A build that runs without being asked for

Heavy build workflows (Android APK/AAB, EAS, Gradle, Docker, emulator E2E) must
be `workflow_dispatch`-only — never `on: push`, never `schedule:`, never
auto-chained from another repo's build. Release tags are the sole exception; a
tag is the explicit request. Cheap PR gates (tests, lint, typecheck, secret scan)
stay automatic.
**Why:** included Actions minutes are one org-wide monthly pool, so an
unattended build starves every *other* repo's CI, and the outage looks like a
config bug. *Precedent: 2026-07-18 — Tessellate-Studio blew through its 2,000
included minutes and all private-repo CI stopped at once.* Full rule + the
`concurrency` / `timeout-minutes` habits that go with it:
[`workflows.md` → "CI spend"](./workflows.md).

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

## Isolate concurrent sessions; don't share one checkout (was #24)

When several agents can touch one working copy, hand each task to a
worktree-isolated session (the "new worktree" handoff box / `isolation:
"worktree"`) and stay SHA-explicit — verify `HEAD` before every commit/push, push
by refspec, prefer `git branch -f/-m` over checkout-then-act. A fresh worktree has
no `node_modules`: `npm ci` before committing so the local gate runs; never
junction deps into a harness-managed worktree (its cleanup can delete the main
checkout's deps).
**Why:** in a shared checkout `HEAD` moves under you between commands. *Precedent:
one session landed a commit on a stranger's PR branch, forked a branch off a stray
commit, and pushed an extra commit — three corruptions caught only by re-reading
reflog.* Operational sibling of authority-not-assumption (that's the honesty half —
verify a SHA is on the default branch before claiming shipped; this is the
don't-corrupt-the-op half). **[enforced]** `.worktrees/` ignore + the pre-commit
deps-bootstrap guard live in code-standards.

## Concurrent branches collide in content, not just in git

Worktree isolation stops branches corrupting each other's *git state*. It does
nothing about two branches editing the same *content*. Before editing a shared
planning doc (regression log, BACKLOG, weekly digest, user-actions tracker,
CHANGELOG) — or starting a fix in an area someone else is already in — list who
else is in that file:

```bash
gh pr list --state open --json number,headRefName,files \
  --jq '.[] | select(any(.files[]; .path=="BACKLOG.md")) | "#\(.number) \(.headRefName)"'
```

- **Commit boundaries follow the logical change, not the file type.** This is
  ordinary git hygiene and needs no special rule: one commit per coherent change.
  A doc edit that is *part of* a change — the API doc for an endpoint you just
  altered, the comment describing new behaviour, the README line your flag made
  wrong — belongs **in that commit**. Splitting it out makes the commit
  incomplete and ships a moment where the docs contradict the code. A doc edit
  that is *its own* concern — a regression-log row, a BACKLOG status, an
  unrelated fix you want to ride along — is a separate commit, and may sit in the
  same PR.
  *(Corrected 2026-07-29. This rule twice demanded a doc/code split — first by PR,
  then by commit. Both were wrong: they made the file's type the deciding input
  instead of whether it is the same change. Under the old wording, updating a
  function and its docstring was a rule violation, which nobody was ever going to
  follow. The real lesson from the row-77 revert stands and is narrower: a
  **regression-log row is a separate concern from the fix it describes**, so it
  belongs in its own commit — not because it is a doc, but because it is a
  different change.)*
- **If your change makes a doc claim stale, fix it in the same PR** — never leave it
  to another session that "agreed to take it". Two sessions each deferring is how a
  wrong line survives both their merges.
- **Treat a contended anchor as a shared resource.** Append-only lists where everyone
  inserts at the same point, and any hand-assigned sequential id, are claimed by
  whoever merges first — verify your claim is still free at *merge* time, not author
  time. Better: key such rows by date (`2026-07-26a`), so two sessions on different
  days cannot collide at all.
- **Scan for duplicate work, not just conflicting edits.** Before starting, read the
  open PR titles and branch names for your *intent*, not only the paths you expect to
  touch — `gh pr list --state open --json number,title,headRefName`. Two sessions
  independently making the same change is worse than a conflict: a conflict merges,
  a duplicate throws a whole branch away, and neither session can see it until both
  already have work in flight. When dispatching parallel sessions yourself, name one
  owner per file or area up front — that is the only fix that acts *before* the
  duplicate work exists.

*Precedent for the duplicate case: PRs #379 and #380 were opened three minutes apart
with the same change (`timeout-minutes` on every CI job) by two sessions; #380 was
closed as a duplicate, and a cross-session message could not resolve it because both
branches were already written.*

**Why:** both branches are isolated, green, and individually correct. The defect
exists only in their union, so nothing either session can run locally will show it.
*Precedent: in one day, four branches claimed the same four regression-log row
numbers; one PR was merged and then reverted wholesale purely to fix row ordering,
discarding a verified CI fix that had to be re-landed as a third PR; the same BACKLOG
paragraph was rewritten three times by three sessions, each correct when written and
stale within hours; and every open PR in the repo at that moment touched at least one
shared planning doc.* Content sibling of the checkout-isolation rule above — that one
is don't-corrupt-the-op, this one is don't-collide-at-merge.

## Merge on green by default — don't let PRs sit stale

Open PRs **ready, not draft**, and **merge as soon as CI is green**. A
green PR left parked for a manual look is the default failure mode: while
it sits, `master` moves under it, it drifts out of sync, collects
conflicts, and the work goes cold. Draft is for genuine WIP, not for
"done but waiting."
**Carve-outs (hold for a human):** the change is outward-facing or
hard-to-reverse (a public API, a destructive migration, anything users
see), it needs review the CI can't give (product/security judgment), or
the user explicitly asked to hold it. Everything else merges on green.
**Why:** a stale branch costs a rebase-and-reverify cycle and risks
shipping from a conflicted tree. *Precedent: a fully-green, fully-tested
size-finder PR sat as a draft across several hourly check-ins purely
because no one said "merge" — pure waste, and every commit landing on
master meanwhile widened the gap it would have to reconcile.* Sibling of
the concurrent-session rule (that's don't-corrupt-the-op; this is
don't-let-it-rot).

---

_Generalized from alate's `project_anti_patterns.md` (the canonical source).
App-specific anti-patterns (scraping posture, body-data handling, heading-SVG
geometry, native-config sync) stay in each app's local memory._
