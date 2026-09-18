# Alate — backlog

Durable record of work that's out of scope for the current push but
shouldn't be lost. Each item includes enough context to start the work
cold without this file's author present.

**Shipped items collapse to a one-line tombstone**
(`~~<title>~~ — shipped <date>, PR #<n> (<SHA>)`) per the forge
"Docs stay lean" standard — the PR is the permanent home of the diff,
the decisions, and the verification. When priorities change, move items
between sections rather than deleting them.

> **Carve-out — a PR holds what was DONE, not what was considered and
> rejected.** Before collapsing an entry, ask whether its body contains
> anything *no diff can give back*: a rejected alternative and why it lost,
> an investigation that corrected a false belief, external research, a
> "don't try this again" finding. That content was never in a commit, so
> collapsing it destroys it permanently. Keep those lines next to the
> tombstone — a few surviving sentences are cheaper than re-running the
> investigation. Shipped-ness alone is not grounds to delete; what the text
> is *for* decides. Longer decision trails that outgrew this file live in
> [`memory/project_backlog_archive.md`](./memory/project_backlog_archive.md)
> (moved 2026-08-20); interim statuses live in `git log -p -- BACKLOG.md`.

**Scope — the whole alate + Alate-for-Brands product, not just this repo
(set 2026-07-04; "Mood Layer" renamed to Loom, then to Alate (for Brands),
both 2026-07-07).** This BACKLOG (and
the weekly roadmap-pulse over it) covers open work across **all related
repos**: `alate` + `loom` (product cores) and
`tessellate-pages`, `litmus` (renamed from `guinea-pig` 2026-07-18) (related/support). The full
table — remotes + local checkouts + roles, and what's explicitly out of
scope (`badige`, the new `mood-layer` emotion app, `forge`,
`code-standards`) — lives in [`CLAUDE.md` → "Project scope"](./CLAUDE.md).
**Tag each entry with the repo it lives in** when it isn't alate, so a
"shipped" claim gets verified against the repo that owns the code.

---

## P0 — pre-App-Store launch

~~`/api/brand-request` broken — `niche_keyword` migration never applied~~ —
fixed 2026-07-21 (migration applied via Supabase MCP; the code was always
correct). ~55-day silent outage, caught by the pulse's honesty pass;
regression log #74. **Lesson (keep):** a migration listed in `.baseline` is
asserted-applied, never verified-applied — trust `list_tables` /
`information_schema` over any ledger. Full trail:
[archive](./memory/project_backlog_archive.md#apibrand-request-niche_keyword-outage-fixed-2026-07-21).

~~Migration ledger drifted 2 rows behind master — issue #475~~ — reconciled
2026-08-03 by a catch-up dispatch (run 30787376384); both rows were
applied-but-unledgered and idempotent, the milder inverse of row 74.
**Lesson (keep):** `supabase-migrations.yml` re-fires only on a push touching
the migrations dir, so a red alert whose cause clears goes stale on its own —
a catch-up `workflow_dispatch` is part of the runbook, not just a close
button. Full trail:
[archive](./memory/project_backlog_archive.md#migration-ledger-drift--issue-475-reconciled-2026-08-03).

~~Alate for Brands 508 `INFINITE_LOOP_DETECTED` on every non-prerendered
route~~ — **resolved 2026-09-09, transient, cleared on Vercel's side**;
[loom#93](https://github.com/Tessellate-Studio/loom/issues/93) closed
2026-09-08T19:15Z with [loom#104](https://github.com/Tessellate-Studio/loom/issues/104)
and [litmus#37](https://github.com/Tessellate-Studio/litmus/issues/37). Re-probed
by the pulse 2026-09-13: `admin-tau-olive.vercel.app/<absent>`,
`/products/12345` and `tessellate-loom-api.vercel.app/admin/products` all
answer **404**, not 508. No commit fixed it. **Lessons (keep — no diff holds
them):** the proof was an *immutable* deployment (`dpl_BesbnRu`) that looped at
10 hops in the morning and 404'd at 3 hops the same afternoon with no rebuild,
so the variable was platform-side state. **Disproved causes, do not re-propose
if it recurs:** project-name underscore, "redeploy until it lands", Vercel
Authentication / deployment protection, repo-root `vercel.json`,
`--local-config`, build cache, missing `VERCEL_ORG_ID`, "Next.js on this team"
(the team's other Next.js project 404'd in one hop). If it recurs, loop-bisect
+ dump-admin-routes + the loom#145 entry-host mitigation are in place (loom
regression row 14). The restock "we won't restock this" device test it blocked
is unblocked.

### Cross-brand size translation — Stage 1 shipped; Stage 1 polish + Stages 2–3 open

~~Stage 1 — on-device garment calibration + full size-chart cross-brand
translation~~ — shipped 2026-06-11, PR #232 (`46db60c`), with PR #226
(`ee8fc05`) and PR #238 (`6515154`). ~~inch-unit size-chart parsing~~ —
shipped 2026-07-17, PR #328 (`7b4ca5e`). ~~richer confidence UI on the
fit-result hero~~ — shipped (`ConfidenceDonut`,
[`FitResultScreen.tsx:1657`](mobile/src/screens/FitResultScreen.tsx#L1657)).

**Still open (Stage 1 polish + Stages 2–3):** brand-specific sizing offsets
(v1 uses a standard chart only; brand is stored for the record); Stage 2
passport reframe + post-purchase fit-log; Stage 3 niche directory.

**Suggested dependency:** [Post-purchase "did it fit?" prompt](#post-purchase-did-it-fit-prompt--the-missing-feedback-loop-for-sizing-decided-2026-08-25-shaped-2026-08-30-not-built)
— inferred 2026-09-07 (high confidence) from this entry's own text: it states
`BRAND_SIZING_NOTES` "stays empty until then rather than being guessed (AP#20)"
and names pitch-003 as the collector of the `brand` + `size_bought` + outcome
tuple offsets would be built from. Unconfirmed — upgrade to `**Depends on:**`
or reject on the next manual run.

**The cost of no brand offsets is now visible in the UI, and deliberately
stated there rather than papered over** (2026-08-31,
[`adr-004`](./memory/decisions/adr-004-calibration-confidence-provenance.md)):
because the estimate is a standard-chart lookup with brand discarded, a
vanity-sized "XS" anchors the typical-size headline with nothing to say so.
The Account card therefore shows which garments the letter rests on instead of
a confidence badge that could only ever read "high". Offsets still need real
per-brand fit outcomes to build from — which is what
[`pitch-003`](./memory/decisions/pitch-003-post-purchase-fit-feedback.md)
collects (its tuple carries `brand` + `size_bought` + outcome); `BRAND_SIZING_NOTES`
stays empty until then rather than being guessed (AP#20).

**This is Stage 1 of the "fit graph" roadmap** —
[`docs/backlog/fit-graph.md`](./docs/backlog/fit-graph.md). Stage 2 decisions:
`memory` → fit graph Stage 2. **Differentiation to preserve:** cross-brand
translation is consumer-side, not brand-embedded like True Fit / Bold
Metrics. Keep it on-device to stay inside AP#4.

**Correction kept deliberately (2026-06-09):** this was a **new build, not a
re-plug** — a full-history search found no past cross-brand translation ever
existed, despite the entry once claiming a redesign "unplugged" it. If
"didn't we already have this?" resurfaces on any fit-graph stage, the answer
is here; the search was never a commit, so no PR can give it back.

~~Set up email aliases on `tessellate.co.in`~~ — shipped 2026-05-28, PR #172
(`0839a2b`); all four aliases live via Cloudflare Email Routing → Gmail.
Setup steps: [`docs/manual-runbook.md`](./docs/manual-runbook.md) → Done.
The optional Gmail follow-ups (filter/label + auto-reply) were completed by
the user, confirmed 2026-08-11.

~~Move `googleUser` from AsyncStorage to `expo-secure-store`~~ — shipped
2026-06-09, PR #214 (`f13da42`). OWASP Mobile M9 resolved for the lone
signed-in artefact at rest.

~~Domain go-live — tessellate.co.in for pages + backend~~ — shipped
2026-09-01. Scheme: apex `tessellate.co.in` serves tessellate-pages
(tessellate-pages#4, `6d53a81`); `alate.tessellate.co.in` serves the alate
backend (alate#618, `5c5e169`, added the shared `SCRAPER_USER_AGENT`
constant + the runbook entry, since removed — setup complete). Six
Cloudflare DNS records, both domains verified live in-browser 2026-09-01
(pages page loads; backend serves the restock-unsubscribe page); `APP_URL`
was never set on Vercel, so email links already followed
`VERCEL_PROJECT_PRODUCTION_URL` automatically — confirmed on the fresh
redeploy after the domain attach. App-side URL flip (in-app links,
`API_BASE_URL`, console-setup docs) shipped same day. Old
github.io/vercel.app URLs still redirect/resolve, so nothing broke
mid-switch.

~~"Get in touch" on BrandIntegration needs a real destination~~ — shipped
2026-05-28, PR #172 (`0839a2b`): `mailto:partners@tessellate.co.in`. The
richer form-path (Supabase `partner_inquiries`) stays a future iteration —
promote only if mailto click-through (Sentry breadcrumb) shows demand.

~~Privacy-policy entry + delete-my-data path for `requester_email`~~ — done
2026-05-02, and the long-standing "sync local → hosted before submission"
claim was **inverted** (corrected 2026-07-19): the hosted pages are canonical
and ahead (v3.3, 2026-07-03); the app opens hosted URLs directly
([`AccountScreen.tsx:22-24`](mobile/src/screens/AccountScreen.tsx#L22)).
**Correction 2026-09-10:** the policy entry above shipped, but the retention it
promised did not — nothing cleared restock-alert emails or brand-request account ids until
`retention_clear_identity.sql` (#785), and the notify-me email itself is still
never sent — clearing it at send time is part of #792. The "done" covered the words, not the behaviour.
~~**Housekeeping:** delete the dead `mobile/privacy-policy.html` +
`mobile/delete-account.html`~~ — done 2026-08-20; confirmed no code
referenced them (`AccountScreen.tsx` only points at the hosted URLs). Trail:
[archive](./memory/project_backlog_archive.md#privacy-policy-sync-claim--the-inversion-corrected-2026-07-19).

### Fabric / material extraction — Armani fixed; Oshin deferred to v2

~~Armani (URL-handle material inference + "knit" as a generic fabric)~~ —
shipped 2026-05-20, PR #140 (`4399ad8`).

**Oshin — DEFERRED TO v2 (2026-05-22, decision keep).** `felled-seam-set` is
a construction term, not a fabric word, so URL-handle inference can't recover
it. Neither backend option works today: Shopify `custom.material` metafields
need merchant-issued Storefront tokens alate doesn't have for non-partner
brands (public `/products/<handle>.json` doesn't expose them), and a Gemini
prompt extension only fires when the title/description carries the term.
**This is the signal for the merchant plugin** — see
[the P3 entry](#build-the-shopify-merchant-plugin). Until it ships, the Oshin
material row stays "—" for handles without a fabric word.

~~Share-intent route fails where direct paste succeeds (Armani)~~ — shipped
2026-05-20, PR #141 (`eae534d`). Root cause: share-sheet payloads carry
whitespace/wrapper text/`#fragment` that the scrape rejected; only the
home-paste path normalised.

~~Apple-TV-style "expand from card" transition for History → FitResult~~ —
shipped 2026-07-14, PR #327 (`6d8f758`)

## P1 — near-term polish

### Skin-tone setting + "does this colour suit you?" advisory — BUILT DARK 2026-09-12 (vision Stage A)

**Status:** **built dark, polish pending** — PR [#836](https://github.com/Tessellate-Studio/alate/pull/836), 2026-09-12, per [pitch-006](memory/decisions/pitch-006-skin-tone-colour-advisory.md). Shipped as: an optional, **device-only** skin-undertone section (Warm / Cool / Neutral / Not sure, cue-based) at the end of body-profile setup + an Account read-back row; **on-device** garment colour sampling of the hero photo (`useImageColours` → pure `garmentColour.ts`, no backend wiring — the "surface `color_hex_codes`" sketch below was NOT the path taken); a COLOUR section on the expanded fit card with named swatches and one hedged, dismissible hint. Everything sits behind `isWipVisible()` (V2 ∨ `__DEV__` ∨ preview channel) — production installs see nothing until the owner calls it polished; tracker + graduation date (2026-10-15) in [RELEASE_V2.md](RELEASE_V2.md) feature 5. Two research findings changed the sketch: no vein cue in the chip copy (unreliable on medium-to-deep skin), and the warm/cool rule stays silent on boundary hues (teal, greens, magenta) because stylists place those against the naïve arc. ~~**Paired litmus PR still owed after this merges**~~ — **landed:** litmus#48 (`f9e68ee`, "alate testID contract for skin undertone + colour hint (alate #836) + Save-button scroll"), verified on litmus `origin/main` by the 2026-09-13 pulse; `TEST_ID_CONTRACT.md` now carries the new IDs. Original note, kept for the drift record (CLAUDE.md testID rule): the contract drift is purely additive — `skin-undertone-section`, `skin_undertone-*`, `profile-row-skin_undertone`, `garment-colour-section`, `garment-colour-swatches`, `colour-hint`, `colour-hint-dismiss`, `colour-hint-setup-cta` — and a scratch regen on 2026-09-12 showed litmus's committed contract (alate @ `7ed6957`, 2026-09-08) is ALSO behind #758/#829 (`budget-info*`, `fit-card-*`, `stat-value-*`, `dock-expand-chevron`, `fit-detail-sep`/`-verdict-line`, `history-bottom-footer`, `history-stat-checks`, FloatingTabBar → TabBar), so one regen clears both. Flow-helper check for the same PR: litmus `completeAvatarSetup` finds `continue-button` with `isExisting()` and never scrolls to it; the new section now sits between the thighs chips and that button inside the ScrollView, so on a gate-open build (preview channel) the button can be off-screen — production APKs, where the gate is closed, are unaffected. Was: scheduled for the week of 2026-09-14 — owner decision 2026-09-07 ("backlog stage A for next week"); promoted P2 → P1 the same day, first of the vision stages to be ranked. Opened 2026-06-14. User vision: add a **skin-tone** option in the body settings, and use it to **intelligently tell the user whether a garment's colour works for them** (colour-harmony / seasonal-palette style advice). Squarely on the core design vision ("solve fit **+ colour** for brand explorers" — `memory/project_design_vision.md`).

**North star (2026-09-07):** this is Stage A of
[`memory/project_product_vision.md`](memory/project_product_vision.md) — the
first step towards the owner's avatar-in-the-fit-check vision, and the one
that needs no native build. Scope below unchanged. That doc also records the
answer to "keep skin tone but drop the user id": no, under AP#4 as written.

**Why it's tractable now — the colour data already exists, it's just not surfaced.** The backend already extracts per-product colour during enrichment: `extractAndNameColors` (`backend/sdk/productEnrichment/colorExtractor.ts`) returns `color_palette` (fashion names), `color_hex_codes`, and `tone`/`warmth` (warm/cool/neutral), persisted on the enriched product (`enricher/index.ts:74,184,193`). The colour **reasoning** is validated (warmth classification + naming, `colorExtractor.test.ts` — red→warm, blue→cool, red/blue/green naming).

**The gap (verified 2026-06-14):** the mobile app **never consumes** these fields — `grep` for `color_palette` / `color_hex_codes` / `tone` across `mobile/src` returns **0** non-test hits, and `checkFit`'s payload passes no colours (`FitResultScreen.tsx:817`). So today colours only (a) nudge the AI enrichment prompt (`colorContext`, `enricher/index.ts:92`) and (b) sit in storage — invisible to the user.

**What a build needs (sketch, not a spec):**
1. **Skin-tone input** in body settings (a small, inclusive set of tones / a Fitzpatrick-style scale or undertone warm/cool/neutral) — stored alongside the avatar (device-local; same privacy posture as body data, AP#4).
2. **Surface the garment palette** on the fit/product screen (swatches from `color_hex_codes` + names) — closes the "computed-but-never-shown" gap on its own.
3. **Suitability logic:** compare garment `warmth`/hues against the user's undertone (warm complexions ↔ warm palettes, etc.) → a gentle "this shade flatters you / try a cooler tone" hint. Pure, testable function (TDD-first per CLAUDE.md). No new native deps — reuse the existing extracted colours.

**Note:** the underlying colour-extraction backend was hardened 2026-06-14 (regression row 60 / PR #247 — sharp Vercel bundling + pure-JS fallback) so this data flows reliably once surfaced.


### Fit analysis screen: docked-on-history-launch, end-of-deck bounce, gesture tip, iOS edge-swipe-back fix

~~Four UX gaps reported directly in conversation: history-launched fit cards
opened expanded instead of docked; no signal at either end of a sift deck;
several undiscoverable gestures with no in-app explainer; and an iOS-only
collision between "swipe to previous card" and "swipe back to History" (same
touch, same gesture, no edge yielded to the native back-swipe)~~ — shipped
2026-09-03, PR [#670](https://github.com/Tessellate-Studio/alate/pull/670)
(`53b26e6`). Also bumped `glass.dockCollapsedAlpha` 0.60 → 0.66 (docked-card
legibility) per explicit user direction mid-build.

**Considered and dropped, not just deferred:** a persistent "N of M"
deck-position counter was built (JSX + styles + tests) and then removed
before merge — the user reconsidered after seeing the diff: History already
covers quick-sift orientation well, so a second counter on this screen was
redundant. Kept the rubber-band bounce on over-swipe as the sole end-of-deck
cue.

**Not verified on-device from the build session** — no iOS/Android
device/simulator attached to the remote environment; the iOS edge-swipe-back
fix (`hitSlop` on the sift gesture) is code-reviewed only, `jest.setup.js`
mocks `Gesture.Pan()` so no test exercises the real gesture-priority
behavior. Queued to [device-test queue #562](https://github.com/Tessellate-Studio/alate/issues/562).
~~Production OTA for this change has **not yet published** — the build
session's GitHub integration lacks Actions-dispatch permission (403 on
`eas-update.yml`)~~ — **published 2026-09-03 13:30 UTC**, update group
`61b489ae-3597-400b-9874-b3f43a227d95`, runtime 1.3.1, android + ios
([#562 announce comment](https://github.com/Tessellate-Studio/alate/issues/562),
`eas-update.yml` run 33761114975). The 403 was one session's token, not a
standing block — someone with `gh` access dispatched it 26 minutes later.
**Still open:** the on-device gesture-priority check itself, which no OTA
settles — now its own test issue
[#771](https://github.com/Tessellate-Studio/alate/issues/771), labelled
**`failed`** (the legacy #562 queue was closed 2026-09-09 and migrated to one
`device-test` issue per test).

### Post-purchase "did it fit?" prompt — the missing feedback loop for sizing (decided 2026-08-25; shaped 2026-08-30, not built)

**Decision (user, 2026-08-25):** capture fit outcomes with a lightweight
post-purchase prompt on items in My Fits — did you buy it, and did the
recommended size fit / run small / run large. **Why this and not the
alternatives:** a thumbs-up/down on the fit-result card is cheaper and gets
volume faster but captures the shopper's *expectation*, not the garment's
*outcome* — useless for tuning a weight. Mining `restock_alerts` for
size-level demand needs no new UI but only covers out-of-stock items and is
an indirect proxy. Both were considered and rejected for those reasons.

**Why it matters:** every tunable constant in the fit engine is currently
un-validatable. `fit_history` records what the engine *predicted* and has no
column for what happened next, so grading the engine against it is circular;
`size_finder_sessions` is outcome-only by privacy design (AP#4) and never
joins a body to a result. Until this ships, the thigh/tummy weight below —
and `TUMMY_RATIO_*` / `THIGH_*_MAX_CM` in `measurementDerivation.ts` — stay
first-pass numbers that nobody can responsibly tune.

**Shaped, not started — the plan is
[`pitch-003-post-purchase-fit-feedback`](./memory/decisions/pitch-003-post-purchase-fit-feedback.md)**
(2026-08-30, status `proposed`; appetite 1 week). It settles the four questions
this entry left open: the tuple (per-axis outcome, not a global verdict, plus
`size_bought` and the stretch percentage the engine read); a new `fit_outcomes`
table rather than columns on `fit_history` (the 50-row cap, card deletion,
re-evaluate overwrite, and the full-replace push each destroy an outcome);
sign-out behaviour (submitted outcomes push immediately, not on the debounced
auto-push — per the #552/#596 "a class not yet in the cloud copy is
unrecoverable" lesson); and a two-row privacy split (own-account journal +
de-identified k-gated signal row). The prompt must not become a nag — one ask
per item, one per 7 days app-wide, dismissible for good.

**UNBLOCKED 2026-08-31 — the policy decision is made and the pitch is
`accepted`.** AP#4 forbade aggregating across users, which left a per-user
RLS-isolated outcome table *write-only* for tuning purposes. The user approved
the narrow amendment: a de-identified, no-user-id, k-gated aggregate, now
written into [AP#4](./memory/project_anti_patterns.md) ("Amended 2026-08-31")
with its limits spelled out exhaustively. **Standing condition:** if that
amendment is ever withdrawn, the tuning claim in this entry is withdrawn too,
not deferred.

Two further sign-off decisions changed the numbers here: the gates were
**raised** (k 25 → **50**, n 100 → **200**), and guests are asked as well as
signed-in users. So moving `GROUP_WEIGHTS.bottoms.thighs` one step now needs
~200 axis-answered outcomes in that group (**≈2,000+** prompted purchases, not
≈1,000+). The honest volume finding is unchanged and worth keeping in view: at
~0 users this ships the loop *empty*, and below the bar the consumer of an
outcome is the regression log, not a threshold. One consumer does pay off
immediately — the Account typical-size confidence badge removed by
[`adr-004`](./memory/decisions/adr-004-calibration-confidence-provenance.md)
can be re-grounded from the user's **own** outcomes at n=1, needing no
cross-user read and therefore no amendment.

**Next: the build cycle** (1 week, signal row in the same cycle — collecting
outcomes before it exists means they can never be back-filled without the
cross-user read the design avoids).

### Thighs/tummy sizing weight (1, vs 2 for waist/hips) is a first-pass guess, not validated data (2026-08-24)

**Suggested dependency:** [Post-purchase "did it fit?" prompt](#post-purchase-did-it-fit-prompt--the-missing-feedback-loop-for-sizing-decided-2026-08-25-shaped-2026-08-30-not-built)
— inferred 2026-09-07 (high confidence): this entry sets its own unblock bar at
"~100 outcomes carrying a thigh-axis answer in the `bottoms` group", and
pitch-003 is the only thing that produces them. Unconfirmed — upgrade or reject
on the next manual run.

`recommendSize`'s `GROUP_WEIGHTS` (regression-log 2026-08-24d,
`backend/sdk/fitGuidance/index.ts`) weighs thighs/tummy at half of waist/hips
for bottoms/full-body — chosen by analogy to the file's existing full-body
bust:waist ratio (2:1), not from real fit-feedback data. This is the single
least-verified part of that fix: it determines exactly how far a "full"
thighs/tummy chip nudges the recommended size, and nobody has checked that
1:2 ratio against actual return/fit-complaint data. Same category as the
file's own `TUMMY_RATIO_*`/`THIGH_*_MAX_CM` constants in
`measurementDerivation.ts`, which carry an explicit "FIRST-PASS... not
changed on a guess (AP#20)" comment — this weight deserves the same label
and the same bar before tuning it: real fit-feedback data, not another
guess. **Where that data would come from is now shaped** —
[`pitch-003`](./memory/decisions/pitch-003-post-purchase-fit-feedback.md) §6
sets the bar at ~100 outcomes carrying a thigh-axis answer in the `bottoms`
group before this 1-vs-2 can move, tuned by a human running a committed query,
never automatically. Separately: the chart-matching path (`recommendFromChart`) still
never sees thighs/tummy at all (documented scope boundary, scraped charts
carry no thigh/tummy column) — **checked 2026-08-24 against the live
`size_charts` table (Supabase project `ancuwmmivgdvommzigwv`): 0 rows for
getallways (all 4 existing rows belong to one unrelated shop domain,
`8qvbpu-ix.myshopify.com`)**, so the reported product currently has no
chart and goes through the threshold-scoring path this fix touches — the
gap is real for any FUTURE getallways chart, not (as of this check) for
the reported bug itself.

- **Restock alerts: push ALONGSIDE email — decision + what's left** (2026-08-16).
  RFD 002 proposed push *replacing* email; the user reversed it on review —
  the RFD's own research showed back-in-stock email converting best-in-category
  (~59% open, 5.3–6.5% conversion) while Android 13 dropped push opt-in to
  ~67% — so push was ADDED and email stays the guaranteed channel. The PR was
  closed unmerged (research preserved at `refs/pull/554/head`; a doc saying
  "email is removed" must not persist as a decision record). Shipped in
  feat/restock-push-alongside-email: `push_tokens` table, `/api/push-token`,
  scheduler pushes best-effort AFTER email success ('notified' stays keyed to
  email; DeviceNotRegistered revokes the token), contextual permission ask at
  the notify-me tap. Deliberately NO expo-server-sdk (one fetch, avoids AP#24
  lockfile churn).
  **Client-side call DISABLED 2026-08-20** (regression-log 2026-08-20a) —
  it crashed on the installed iOS TestFlight build: `expo-notifications`
  shipped as an npm dependency but was never added to `app.json`'s `plugins`
  array, so no native build has the module linked, and the JS reached that
  binary via a same-runtime OTA. **Left, in order:** (1) add
  `expo-notifications` to `app.json` plugins, (2) FCM V1 key upload — steps
  in [manual-runbook → Restock push](./docs/manual-runbook.md), (3) ship a
  fresh native build (Android AND iOS — iOS needs one regardless of FCM,
  just to link the module), (4) re-enable the `registerForRestockPush` call
  in `RestockNotifyCard` **only after** verifying on a real device running
  that build that it doesn't crash. Until all four, every device is
  email-only — which is now enforced by the disabled call, not just the
  missing credential.
  **2026-08-26 addendum:** `expo-notifications` turned out to auto-apply its
  config plugin even WITHOUT the `app.json` plugins entry (it is in
  `@expo/prebuild-config`'s `versionedExpoSDKPackages` auto-plugin list), which
  injected an `aps-environment` entitlement the iOS provisioning profile lacks
  and broke the first v1.3.1 iOS release build. It is now excluded from
  autolinking entirely (`mobile/package.json` → `expo.autolinking.exclude`),
  so step (1) above becomes: **remove that exclusion** (the plugins-array add
  is redundant — auto-application covers it), and the re-enable rebuild also
  needs the Push Notifications capability added to the App ID so EAS
  regenerates the provisioning profile (Apple portal, human step).

### Self-hosted runners re-download `actions/checkout` on every job — GitHub 429s cascade under load (found 2026-08-17)

On a heavy CI day (four PRs + reruns), `codeload.github.com` rate-limited the
runner IP and **every job on two PRs failed at "Set up job"** — before a single
line of repo code ran — with `429 Too Many Requests` downloading
`actions/checkout` (runs 32037960226/-332, 32039327702/-739, all four
signatures identical). Each failure looks like a red gate on the PR, which is
how a pure infrastructure flake burned ~2 h of merge latency and several rerun
cycles on 2026-08-17. Root cause to investigate on the VMs: the runner's
`_work/_actions` cache is evidently not persisting between jobs (each job
re-fetches the same pinned tarball), so under bursty load the shared org IP
trips GitHub's CDN limit. Candidate fixes, cheapest first: confirm/repair the
actions cache dir persistence; set `ACTIONS_RUNNER_ACTION_ARCHIVE_CACHE`; or
vendor the checkout step. Recovery that worked: wait out the limit (~1 h) and
`gh run rerun <id> --failed`. Runner SSH details: `BACKLOG` runner entry +
`docs/manual-runbook.md`.

~~`Tessellate-Studio/enrichment-types` does not exist on GitHub~~ —
**RESOLVED 2026-08-11: intentionally dead, removed as a product call.** The
repo was retired on purpose (user-confirmed); "re-create and push" is
explicitly declined. Nothing in alate imports it — a repo-wide grep returns
only prose in planning docs. Its row was removed from the CLAUDE.md scope
table the same pass. **Do not re-file:** a future session finding the 404 is
re-finding the 2026-08-03 discovery; it is settled.

~~Merge PR #357 (onboarding UX) once Actions minutes restore~~ — merged
2026-07-27 (`da1de2f`); its follow-ups live on in litmus (the
`calibration-cut/sleeve/length-*` testIDs; `home-share-howto` renders only
while the share popup is open).

### Carry loom's cut tags into the APP's fit check, not just the widget — NEW (2026-09-13)

`mergeCutAuthority` (ADR-010, PR #858) lets loom's `ai_tags` /
`vision_textures` beat a wrong merchant cut tag, but only on the
storefront size-finder path (`sizeFinder/index.ts` `buildGuidance`) —
that is the one place holding both sources. The app path does not: it
scrapes the page itself and posts its own `ProductData` to `/api/ai`
check-fit, and `mobile/src/services/api.ts` carries `brandSizeChart`,
`offerings`, `modelHeightCm` and `wontRestock` out of the composed
endpoint but not `aiTags` / `visionTextures`. So for a loom-connected
brand the widget gets the better answer and the app does not. Work:
carry the two tag lists through the composed-product response into the
check-fit payload, then call `mergeCutAuthority` in `handleFitCheck`
(`backend/api/ai.ts`) the same way `buildGuidance` does. Test the seam —
an enumerating hand-off is AP#26. Motivating case: the Summer Away
Tropez dress, regression row `2026-09-13d`.

### Colour: decide whether the server sees the garment colour at all — NEW (2026-09-13)

Three colour paths exist and only one ships. (1) **On-device**, live:
`react-native-image-colors` samples the hero photo, `garmentColour.ts`
does OKLCH naming + warmth, pitch-006. (2) **Server pixel sampling**,
built but unused by the app: `productEnrichment/colorExtractor.ts`
(k-means over the decoded image, sharp with a pure-JS fallback) returns
`color_hex_codes` and a `warmth` from `/api/ai` enrich — nothing in
`mobile/src` reads either field. (3) **Vision AI**, unused for colour:
`shared/visionClient.ts` (GPT-4o) serves the enricher's styling words,
never the colour hint. pitch-006 named "backend colour extraction on the
scrape path; wiring enrich `color_hex_codes`; loom `vision_colors`" an
explicit no-go for that cycle, so this is the deferred question, not a
new idea. The case FOR moving off-device is documented in
`garmentColour.ts`: androidx Palette's `DEFAULT_FILTER` deletes hue
10°–37° at saturation ≤ 0.82 during quantisation — rust, terracotta,
tan, camel, brown, peach, i.e. the warm garments the hint exists for —
and the library exposes no way to change it, so the hint silently
under-fires on Android. Decide: leave it on-device and accept the
under-fire, or add a server path (which one, and what it costs per
scrape) and let the device fall back. Needs measurement first — how
often the Android filter actually swallows a garment — not a hunch.

### Thread garment cut / sleeve / length calibration into the fit engine — NEW (2026-07-19)

The add-garment flow now records three optional attributes on each
calibration entry (`calibrationStore.CalibrationGarment`): `cut`
(slim/regular/loose), `sleeve` (short/long), `length`
(short/regular/long — catches e.g. RL tees cut long to be tucked). They
render on the garment rows in Profile → Fit Calibration, but they do
NOT yet influence the fit check: the on-device estimator
(`utils/garmentEstimation.ts`) stays label-anchored, and the calibration
payload sent to check-fit is the per-axis averaged cm + garment count
(`services/api.ts` `CalibrationData`; since 2026-08-19 only the axes the
garments' categories inform — bottoms → waist+hips, tops → bust+shoulders —
which covers the "per-group signals" half of (b) below). **(b) is now
DONE for sizing weights** — shipped 2026-08-20, PR #584: `recommendSize`
takes the garment and weights the axes it is actually cut to (bottoms →
waist+hips, tops → bust+shoulders, dresses → all four), and the size-chart
matcher compares only those columns. What remains of (b) is threading
cut/sleeve/length, not the body axes. Open work: (a) decide how cut
should modulate ease in `predictFit`/`recommendSize` (needs a sourced
sizing rationale, not eyeballed offsets — see regression row 61), (b)
extend the check-fit payload with per-group cut/sleeve/length signals,
(c) surface sleeve/length-aware warnings in the fit result. Related:
the estimation chart is a women's standard chart and gender-blind —
a men's chart keyed off `avatar.gender` belongs in the same pass.

### Supabase security advisors — CLOSED 2026-07-27 at 0 ERROR; residuals are won't-fix, keep them findable

Audit 2026-07-18, every figure re-verified live 2026-07-26/27. Advisors
67 → 18; the remaining 12 WARN / 6 INFO are all one of the classes below.
Full audit narrative + what the audit itself got wrong:
[archive](./memory/project_backlog_archive.md#supabase-security-advisors-audit-2026-07-18-closed-2026-07-27).

**WON'T FIX — both verified unfixable, do not re-open:**

1. **Leaked Password Protection is off** — a Pro-plan feature, project is on
   Free (there is no hidden dashboard toggle). Accepted under the standing
   cost decision; permanent advisor noise.
2. **`pg_net` is installed in `public`** — `extrelocatable = false`, so it
   cannot be moved, and DROP+CREATE would break restock alerts
   (`invoke_restock_check()` calls `net.http_post`, cron job 2). There is no
   exposure: pg_net has 0 tables/functions in `public`; the lint fires on
   `extnamespace` bookkeeping alone.

**NOT A FINDING — do not "fix" these:** `shared_measurements`,
`size_finder_sessions`, `supabase_migrations` show "RLS enabled, no policy" —
that is the correct deny-all state (service-role only; adding policies would
weaken it). Tables flagged under `auth_allow_anonymous_sign_ins` whose policy
body gates on `service_role` (`blocked_brands`, `brand_requests`,
`restock_alerts`, `color_mapping`) are the same class.

**DO NOT DROP the `moodlayer` schema.** It backs the live Circle-pairing
feature of **The Mood Layer** (the separate emotion app) — its `moodlayer-relay`
edge function is ACTIVE here and `mood-layer` app source calls it. The audit's
"drop it" advice was a product-name mix-up (the collision CLAUDE.md's scope
section warns about). Retiring it is a mood-layer roadmap decision, not alate
cleanup.

~~Single self-hosted CI runner is a SPOF~~ — **RESOLVED 2026-08-10:** three
`ci-light` runners (`tessellate-runner-a1`, `-a1-2`, `-1`); queue waits
measured 2–83 s against the 2–4 h of 2026-07-29; watchdog hardened 2026-08-11
to alert only when the whole set is down. Decision trail: ADR-002; rebuild
recipe + escape hatch: `docs/manual-runbook.md`; the full saga and its
do-not-repeat findings (never terminate an A1 — resize; a missing "Always
Free" badge means nothing for A1 billing; probe the box before moving any
tool-dependent job; `apply` stays hosted / the alerter stays on the micro;
`--auto` merge gates on nothing here):
[archive](./memory/project_backlog_archive.md#self-hosted-ci-runner-spof--three-runner-pool-filed-2026-07-25-resolved-2026-08-10).

**Still open on this front:**
- ~~**Trial-credit expiry is 2026-08-21 — settle it or confirm the A1s
  survived.**~~ — **they survived, confirmed 2026-09-07 by observation**, 17
  days past the expiry. `tessellate-runner-a1-2` executed the "Scan for user
  data / secrets" job on run 34107... at 2026-09-07 09:52, and
  `tessellate-runner-ops` (self-hosted group) ran the PR gate guard at 05:33;
  the guard has fired every 2–4 h continuously through 09-06/07. **Method note
  (keep):** `gh api orgs/Tessellate-Studio/actions/runners` returns 403 without
  `admin:org` scope, so the direct check the entry prescribed does not work
  with the token in use — read `runner_name` off recent
  `actions/runs/<id>/jobs` instead, which needs no extra scope and proves the
  box actually executed rather than merely being registered.
- The healthchecks.io grace-timer test (the alarm has never actually fired) —
  queued in runbook → "Ops VM chores", deliberately, with its cost stated.

~~Restock alerts — go-live wiring~~ — **WIRED AND RUNNING, verified live
2026-08-11** (the entry had been stale by a month): pg_cron job 2 active on
`0 */6 * * *`, secrets in Supabase Vault (no Vercel Cron / Pro plan
involved), endpoint returning 200. Evidence + break-glass queries:
[`docs/manual-runbook.md` → Done → Restock alerts](docs/manual-runbook.md).
~~**Still open:** `restock_alerts` has 0 rows, so the Resend send path has
never executed — a real sold-out → back-in-stock → email round-trip is
owed (AP#21: not live for users until then).~~ — **the round-trip has now
completed end to end, twice, on two different real storefronts** (measured
live 2026-09-07, Supabase `ancuwmmivgdvommzigwv`):

| brand_handle | size | requested | checks | notified_at | status |
|---|---|---|---|---|---|
| `coveandlane.in` | S | 2026-08-12 | 9 | **2026-08-15 00:00** | unsubscribed |
| `getallways.com` | L | 2026-08-20 | 31 | **2026-08-28 12:00** | unsubscribed |

So request → 6-hourly pg_cron check → back-in-stock detection → Resend send →
unsubscribe all fired for real, and AP#21 is satisfied for the email channel.
The entry had claimed the opposite for **23 days** after the first send.
**Lesson (keep):** "0 rows" was true when written and is the kind of premise
that rots silently — a row-count assertion in a doc is a snapshot, not a fact,
and the honesty pass has to re-run the count rather than re-read the sentence.

**Still open:** the optional privacy-policy line in `tessellate-pages`
(email → one restock notification + unsubscribe). Push remains disabled
(`push_tokens` = 0 rows) — see the P1 restock-push entry.

~~Enable R8/ProGuard minification + crash deobfuscation~~ — shipped
2026-07-15, PR #330 (`db275bb`). **Still open:** the on-device smoke pass —
R8 strips/renames classes RN reaches via reflection/JNI, so a release build
must be walked through **every** flow (not just booted) before the next Play
promotion.

~~Side-by-side test build — `.preview` package-id suffix~~ — shipped
2026-07-03, PR #290 (`f3c33a3`) + PR #289 (`b0ffefb`). Note the preview lane
itself was RETIRED 2026-08-13 (testing happens on production builds); the
variant machinery remains for one-off debugging only.

### Deferred Dependabot vulnerabilities — unreachable / blocked by upstream (2026-06-13)

Three npm audit findings cannot be patched without breaking changes and
have **unreachable** vulnerable code paths in alate:

| Package | Severity | Workspace | Why deferred |
|---------|----------|-----------|--------------|
| `uuid@7.0.3` | moderate | mobile (build tooling) | Locked to `^7` by `xcode` (Expo config-plugins). Vuln is in v3/v5/v6 with a `buf` param — `xcode` only calls `uuid.v4()`. Unblocks with Expo SDK 56+ (when `xcode` adopts uuid 11). |
| `file-type@13–21` | moderate | mobile (via `react-native-image-colors`) | ASF media parser infinite loop. Alate processes JPEG/PNG product images, never ASF/WMA/WMV — code path unreachable. Fix would downgrade `react-native-image-colors` to 2.4.0 (API break). |
| `esbuild@0.17–0.28` | high | backend | Missing binary integrity check in *Deno* module loading only. Backend runs on Vercel (Node.js) — Deno code path is unreachable. Fix would downgrade `@vercel/node` (API break). |

**Re-evaluate** when Expo SDK 56 ships (uuid), when `react-native-image-colors`
releases a non-vulnerable `node-vibrant` chain, or when `@vercel/node` ships a
compatible esbuild bump.

### Tune the cm→category derivation ratio thresholds — PARTIAL (arm + waist tuned; tummy + torso open)

~~arm length recentred on the Drillis & Contini (1966) 0.333×H mean~~ — shipped
2026-06-15, PR #251 (`df3f8b2`). ~~waist pinned to one definition (narrowest
point)~~ — shipped 2026-06-15, PR #255 (`06b3d5d`), plus an inch-drift +
inclusive sanity-bounds fix 2026-06-14, PR #248 (`cf39b8c`).

**Still open** — two first-pass anthropometric proposals remain unvalidated
against real bodies:

- tummy projection: tummy÷waist ratio (1.00 / 1.06 / 1.13 band edges)
- torso length: torso÷height ratio (0.230 / 0.260 band edges)

Both live as named exported constants in
[`backend/sdk/fitGuidance/measurementDerivation.ts`](backend/sdk/fitGuidance/measurementDerivation.ts)
so tuning is a constants-only change. Tune them the same way arm/waist were
(anthropometric source-cite, or real fit-feedback data). ~~Also note: thigh
derivation never produces 'muscular' (build descriptor, chip-only)~~ —
resolved by pitch-004 (2026-09-02): 'muscular' retired, `full` is tier 3, and a
`THIGH_EXTRA_FULL_MAX_CM = 86` band lets tape readings reach every tier (same
first-pass label as its neighbours).

~~Investigate HomeScreen test cleanup timeout in CI containers~~ — shipped
2026-06-15, PR #252 (`890e5a9`). Root cause was an unawaited on-focus
clipboard peek (`useFocusEffect`), not the empty-state animation the entry
originally guessed. Regression-log row 60.

### Scale-readiness: shared Redis cache/rate-limit + pooled browser renders (2026-06-09)

**Priority:** before any growth push (not launch-blocking at current
volume, but the two changes that decide whether the scraper survives
scale). Source: [`docs/research_Jun_2026.md`](./docs/research_Jun_2026.md)
§2 — the "what breaks at ~1M users" analysis. The fit math is deterministic
and cheap (`backend/sdk/fitGuidance/index.ts` `predictFit`, no per-request
LLM); the bottlenecks are all in the scrape.

**Two pieces:**

1. **Move the scrape cache + rate-limiter to `@upstash/redis` (already a
   dependency).** Both are currently per-instance in-memory `Map`s
   ([`backend/sdk/productScraping/scrapeCache.ts`](backend/sdk/productScraping/scrapeCache.ts),
   [`backend/sdk/apiMiddleware/rateLimit.ts`](backend/sdk/apiMiddleware/rateLimit.ts)).
   Across many concurrent serverless instances the cache hit-rate collapses
   (every cold instance starts empty) and the rate-limiter is near-useless
   (each instance counts only its own traffic). Shared Redis fixes both.
   Highest-ROI scale change; small diff. Keep the same TTLs / key shapes.

2. **Move headless-Chromium renders off the synchronous request path.**
   Chromium is CPU/memory-bound, so Vercel in-function concurrency doesn't
   help it; today every bot-blocked/SPA URL can burn the 15s Puppeteer
   budget inside a 60s function. Options: a managed browser pool
   (Browserless / ScrapingBee / Bright Data) or an async render queue with
   the result cached in Redis. Avoids chromium cold-starts dominating
   latency + cost at volume.

**Also note (not this item, but adjacent):** Vercel Hobby caps at 12
functions + 60s exec; a plan upgrade (Pro = 800s) is a separate
pre-scale checklist line. Datacenter-IP blocking only matters if we ever
chase Cloudflare-protected enterprise sites — current positioning
(independent & boutique brands) means we don't, so residential proxies
stay out of scope.

**Acceptance:** cache + rate-limit verified shared across instances
(hit-rate holds under concurrent load); browser renders no longer run
inline in the user-facing request; load-test at projected peak (~20–50
scrapes/sec) stays within function limits.

### Known-slow scrape domains — review as brands onboard

**Not a build item — a standing maintenance reminder.**
[`backend/sdk/productScraping/knownSlowDomains.ts`](backend/sdk/productScraping/knownSlowDomains.ts)
short-circuits a short, hand-reviewed list of origins confirmed to reliably
time out (hm.com, uniqlo.com, gymshark.com as of 2026-08-24 — pitch-002)
instead of letting them burn the fetch + Puppeteer budget. The goal is
still to support every brand a shopper pastes, not just the easy ones — this
list is a stopgap, not a scope decision.

**Review whenever:** a domain on the list is verified to scrape
successfully (loom integration, or a confirmed live re-test) — remove it.
A new domain is confirmed to reliably time out — add it with a
date + evidence comment. Don't remove speculatively.

**Changed 2026-09-11 (rfd-004).** Being listed now only decides the INLINE
answer. A legacy client still gets the instant refusal; an opted-in client gets
a `deferred` job and a background retry; the worker skips the list entirely.
**The review gained a real data source:** rfd-004 step 7 — two weeks after
ship — reads the worker's per-origin outcome logs. Any listed origin that never
succeeds in the background goes back to the instant refusal for opted-in clients
too, rather than making shoppers wait 5+ minutes for a failure. That is the
first time this list can be trimmed (or confirmed) on evidence instead of a
one-off manual re-test.

### Push notification when a background scrape result is ready — alate#825

**Deferred out of rfd-004 deliberately, not forgotten.** The background scrape
retry ships with **in-app notification only**: a banner the next time the
shopper opens alate. Everything about that wait is otherwise real — the job is
retried, the fit check runs and the result lands in History whether or not they
are watching.

**Why it is not in rfd-004:** push is excluded from the native builds
(`mobile/package.json`, #612 — the iOS release workflow strips the push
entitlement) and its call site is disabled (`RestockNotifyCard.tsx`). It
therefore **cannot ship by OTA at all** — it needs the restock-push re-enable
steps already in this backlog, a new native build, and the Apple Push
capability. Bundling that into rfd-004 would have blocked a shipping OTA behind
a store release.

**Consequence to respect meanwhile:** the deferred card's copy says "we'll let
you know **here in the app**" and must NOT promise a notification until this
lands. That wording is pinned in `ScrapeDeferredCard.tsx`'s docblock.

### Pre-production UI verification loop — tooling shipped; process discipline still open

~~`build:dev` / `build:preview` / `build:production` shortcuts + the
plain-language runbook (`docs/ui-verification-loop.md`)~~ — shipped 2026-06-15,
PR #250 (`09392a7`).

**Still open — habit, not code:** keep a dev build installed; verify before
`ota:production`; treat production OTA as a release action, not a test action.

**Caveat to remember:** ~~`runtimeVersion` is the `fingerprint` policy on
Android~~ — stale since v1.3.1 (PR #605): it is **`appVersion`** on both
platforms ([app.json](mobile/app.json) `runtimeVersion.policy`, verified
2026-09-13), so an OTA reaches every install whose `expo.version` matches and
only a version bump strands older builds. The lesson survives the policy
change: confirm which channel/build the device actually runs
(`eas build:list`) before assuming an OTA reached it.

### Verify cross-device sync end-to-end on the first sync-enabled build (pinned 2026-06-11)

Feature shipped PR #227 (`83c34bc`); all cloud-side setup live. The 2026-07-22
infrastructure audit verified the whole stack (functions ACTIVE, schemas match
`syncMapping.ts`, RLS correct, 30/30 tests) and diagnosed why the push leg had
never written a row: **push failures were invisible** — `captureError` is a
no-op with no Sentry DSN set — fixed with a `console.warn` fallback +
`[cloud-sync]` diagnostics. Pull is proven (profiles row upserted); the
`id_token` audience risk is retired (real Google→Supabase exchange on
record). Audit detail:
[archive](./memory/project_backlog_archive.md#cross-device-sync--infrastructure-audit--push-diagnosis-2026-07-22).

**The push leg is now proven in production (measured live 2026-09-07):**
`user_avatars` = 1 row and `fit_history` = 25 rows, both **0** at the
2026-08-03 snapshot. So steps 1–2 below have effectively happened for real —
the `console.warn` diagnostics fix worked and merged state is reaching the
cloud. What is still unproven is the back half: sign-out clearing, sign-back-in
restoring, and the same data landing on a **second** device. Scope the
walkthrough to steps 3–5.

**Remaining scope: one on-device walkthrough with avatar data present**, on a
build carrying the diagnostic logging (setup state:
[docs/manual-runbook.md](docs/manual-runbook.md#cloud-sync)):
1. Guest: set up body profile + run a couple of fit checks.
2. Sign in with Google → Logcat shows `[cloud-sync] pull OK` and
   `[cloud-sync] pushing merged state — avatar: present`; check `user_avatars`
   row count via Supabase MCP.
3. Sign out → no `[cloud-sync] sync-push failed:`; history + profile clear.
4. Sign back in → they restore.
5. Cross-device: sign in on a second device → same data appears.
6. If push fails, Logcat now carries the error text — report it.

**Siblings:** the UI-verification entry above; regression row 56 holds this
feature's provenance.

~~`partners@` polish: Gmail filter/label + auto-reply~~ — DONE by the user,
confirmed 2026-08-11 (had sat open since 2026-05-27 because nothing reported
back; configured in Gmail, so nothing in-repo to verify against).

~~Wire `ScrapedData.sizeChart` into SLEEVE-LENGTH RULES warning copy~~ —
shipped 2026-05-28, PR #173 (`9f1d890`)

~~Capture arm length + sleeve-length fit warnings~~ — shipped 2026-05-28,
PR #175 (`082a960`) + PR #173 (`9f1d890`): frame-relative `arm_length`
threaded mobile → backend; unblocked the r/TallGirls launch angle. A
long-carried follow-up note about regression rows #15/#24 was closed
2026-07-18 — the rows it chased no longer exist after the PR #298 rollup
([archive](./memory/project_backlog_archive.md#sleevearm-length-regression-note-chase-closed-2026-07-18)).

~~Apply the Supabase migration for `blocked_brands`~~ — done, verified
2026-05-20 via MCP `list_tables`. **Durable caveat (keep):** this project's
`schema_migrations` doesn't see SQL-editor-applied migrations — trust
`list_tables` over `list_migrations` when verifying applied state.

~~Brand-nudge UX inside FitResult error card (email-the-brand version)~~ —
REJECTED 2026-05-02 (decision keep): don't email brands' `info@` inboxes from
alate — cold email doesn't reach integration decision-makers, and it lets any
user spam any brand under alate's name. Demand signal is real gold; the email
is not the way to capture it. Replaced by the three-layer demand capture
below.

~~Demand capture v1 — silent tracking + "we'll notify you" CTA~~ — shipped
2026-05-02 (`5f1b727`). Unsupported-brand scrape failures log to
`brand_requests` with an optional notify email; the aggregate count powers
in-app social proof. No email goes to the brand.

### Size-range demand capture — "n shoppers past your range showed interest" — alate#700 (SHIPPED 2026-09-16)

**Status:** alate [#900](https://github.com/Tessellate-Studio/alate/pull/900) (`b11cb8b`) + loom [#157](https://github.com/Tessellate-Studio/loom/pull/157) (`62b35c8`, deployed); loom migration 005 applied to the shared project; production OTA via `eas-update.yml` run 35136125895. Proven end-to-end on production 2026-09-16 (a connected dev-store product recorded a row; an unconnected shop returned `recorded:false`; a filter-syntax host was refused). Device checks queued: alate [#901](https://github.com/Tessellate-Studio/alate/issues/901) (phone), loom [#158](https://github.com/Tessellate-Studio/loom/issues/158) (admin drawer).

Fills the slot #703 vacated when a brand doesn't make the size the fit check
names. One tap — "Tell {brand} you'd buy a bigger / smaller size" — no email,
no size named, anonymous install-scoped key. Counts are range-level (above the
largest / below the smallest, per product, last 90 days) per the owner's
2026-09-15 direction, and surface in loom's product drawer, not in alate.
Offered only on loom-connected shops (nobody else would ever read the number)
and only when a direction is provable (chart route, or an all-alpha ladder).
Design + rejected options: [rfd-005](memory/decisions/rfd-005-size-range-demand-capture.md).

**Parked v2 — capture for NON-connected brands as BD leverage.** "142 shoppers
wanted past your range" is a strong recruitment line, but no surface reads it
today and storing unread data runs against cost-reduction mode. Revisit when
Demand capture v3 (below) gets a reader.

### Demand capture v2 — user-as-advocate social share
**Suggested dependency:** [Story-share editor (RELEASE_V2 §1)](RELEASE_V2.md#1-story-share-editor-----) — needs the social-share infrastructure from the story-compose feature. The story editor is ✅ scaffolded behind the V2 flag, so this dep is *available* but gated on the V2 flip.

**Trigger:** v1 ships and we have ~20 brand requests/week.

When a brand crosses N requests, the error card adds a "tell [brand]
you want them on alate" CTA that opens a pre-drafted Instagram story
or tweet tagging the brand from the **user's** account. Brands
respond to social mentions; this is the clout play. No app-as-spammer
risk because nothing originates from alate.

### Demand capture v3 — armed B2B outreach dashboard + Alate for Brands onboarding feed

**Trigger:** v1 ships and we have a meaningful demand corpus (inserts
unblocked 2026-07-21 when the `niche_keyword` migration was applied; the
corpus has been accumulating since). **Corpus size, measured live 2026-09-07:
`brand_requests` = 31 rows, up from 15 on 2026-08-03 — it doubled in five
weeks. Re-measured 2026-09-13: 41 rows (+10 in six days).** Still small in absolute terms, so the ranked view is worth building
for the *rate*, not yet for the pitch.

Internal-only Supabase view + simple admin page that ranks brands by
request volume, shows the top requesting cities/countries (from
request metadata if available), and exports a contact list. This is
the data that makes a cold pitch warm: "we have 5,000 unsupported
pastes for COS in 30 days" beats a deck.

**Alate for Brands onboarding feed.** This is also the
**blocked-brand → Alate for Brands onboarding prioritization** loop. Today
blocked-brand demand IS captured (`brand-refuse` →
[`backend/api/brand-request.ts`](backend/api/brand-request.ts) →
`brand_requests` table, with `niche_keyword` tagging + an in-app "N
others want this" count) but there is **no link from that table into
Alate for Brands onboarding** — the only live bridge is the manual
`partners@tessellate.co.in` inbox. The v3 query layer closes that: rank
`brand_requests` by `count(*)` (optionally filtered by `niche_keyword`),
expose the top-N as a feed/JSON that the Alate for Brands
(Tessellate-Studio/loom) onboarding flow can ingest to prioritize which
brands to court first. So the scraper's weakness (sites it can't read)
becomes the brand-acquisition pipeline. See
[`docs/research_Jun_2026.md`](./docs/research_Jun_2026.md) §Corrections + §3.

Sequencing: the ranked view lands first (internal), the
Alate-for-Brands-consumable feed once the onboarding flow exists to consume it.

~~Pre-push hook — local CI gate~~ — shipped 2026-07-28 (`2b0885d`) as the
primary gate while hosted minutes were exhausted; **superseded 2026-08-19
(PR #567)** — hooks are now diff-scoped and light by design, CI on the
self-hosted runners is the authoritative gate. The v1 design notes (parallel
lanes, per-worktree lockfile cache, env stripping):
[archive](./memory/project_backlog_archive.md#pre-push-hook-v1-design-notes-shipped-2026-07-28-superseded-2026-08-19).

---

## P2 — features planned for v2

### Shopify Size Finder widget — LIVE and shopper-verified 2026-08-12

~~Phases 1 + 2 (backend endpoint + session store, storefront theme app
extension, deep-link consent screen)~~ — shipped 2026-07-15, alate PR #325
(`cccdf30`) + loom PR #19. ~~Rollout~~ — done 2026-08-03, verified against
production. ~~Browser QA "blocked on a real merchant store"~~ — **that claim
was wrong and cost weeks** (a password-walled dev store blocks anonymous
fetches, not the merchant's own theme preview); the block was placed on the
dev-store theme and the widget verified end to end on 2026-08-12, with block
presence now enforced every loom watchdog cycle. Detail:
[`docs/manual-runbook.md`](./docs/manual-runbook.md) → Done, and the
[archive](./memory/project_backlog_archive.md#shopify-size-finder-widget--the-blocked-on-a-real-store-error-corrected-2026-08-12).

**Real shoppers are now using it — `size_finder_sessions` = 18 rows, measured
live 2026-09-07, against 0 at the 2026-08-03 snapshot.** The remaining items
below were parked as speculative "post-first-merchant" work; they are not
speculative any more, and the in-memory rate store is now guarding real
traffic.

**Remaining (post-first-merchant scale-up, not blocked):** durable rate
store, HTTPS App Links (`assetlinks.json`), Phase-3 analytics; the
chart-less-product negative case is unit-tested but worth one glance in the
dev store. Full checklist + unverified seams:
[`docs/backlog/shopify-size-finder-widget.md`](./docs/backlog/shopify-size-finder-widget.md) §8.

**Repos:** loom (theme app extension), alate backend (composition endpoint +
session store), alate mobile (deep-link consent screen), tessellate-pages
(privacy paragraph + `assetlinks.json`). Rides on the P3 merchant-plugin
consent path — cross-link, not a duplicate: that entry is the brand-side
data story, this one is the shopper-facing surface.

### Dark mode — palette decided, wiring open (2026-09-07)

The colour decision is made and lives in `theme.ts` as `darkColors` (same
keys as `colors`, enforced by the `ColorPalette` type; WCAG ratios locked by
`theme.dark.test.ts`). Neutrals were read off the user's iOS 26 Weather
screenshot — near-black navy ground `#0e131c`, slate card `#232c3a`, white
primary text, one grey-blue secondary tier `#b3bcc6`; the brand grey-purple
stays as accent, lifted to `#a99dbb` so it clears 4.5:1 on the card.

**Nothing consumes it yet.** `app.json` pins `userInterfaceStyle: "light"`
and all 38 colour consumers import `colors` statically. Remaining work, in
order:

1. A scheme-aware accessor (`useColorScheme` → `colors` | `darkColors`) plus
   dark twins for the alpha ladders derived from `colors` (`primaryAlpha`,
   `textAlpha`, `statusAlpha` — a palette-keyed factory beats a second
   copy of each) and the glass/dock alphas. `scrim` is NOT derived: it is
   built from a private `SCRIM_HEX`, so its dark value is one remaining
   colour choice, not a swap. The dock's
   worst-case-contrast maths in `theme.dock.test.ts` assumes a WHITE tint
   over a black pixel and must be re-derived for a dark tint over a white
   pixel.
2. Per-screen migration off the static import (38 files); the
   `noDuplicateLiterals` guard already keeps hexes out of screens, so this
   is a mechanical import swap plus a device pass per screen.
3. Flip `userInterfaceStyle` to `automatic` and, per AP#22, re-run
   `expo prebuild` so the native splash / status-bar values follow.

Sized as a Pitch (cross-cutting, every screen) — run `/forge:plan` before
starting step 1.

### theloom.in (Magento PWA) — title cruft fixed; sizes deferred

~~`og:title`/`<title>` SEO cruft leaking onto the fit card~~ — shipped
2026-06-09, PR #219 (`70357a0`), via a generic `cleanScrapedTitle` (not a
per-brand override — AP#1).

**Still deferred (low value):** **sizes** don't extract — theloom renders size
options as Magento PWA swatch *tiles* (`tile-root-<hash>` buttons, out-of-stock
carry `tile-root_outOfStock-`) with no `data-size`/`<option>`. A tile-parsing
strategy would be a theloom-specific selector (AP#1 smell) for one store; not
worth it until several Magento-PWA storefronts show up. If ever wanted, key it
on the stable `tile-root` prefix so it generalises.

~~"Calibrate from a garment you own" — parked for v2~~ — shipped on-device
2026-06-11, PR #232 (`46db60c`). The privacy gate that caused the parking is
dissolved: cm is estimated on-device and the AI `calibrate-garment` endpoint
was **deleted** — no body data leaves the device, AP#4 holds, privacy policy
unchanged.

~~Shopify availability section on the fit card~~ — shipped 2026-04-26, PR #75
(`0458f42`). `low_stock` intentionally skipped — Shopify's public JSON exposes
no inventory counts. **Future iterations (not blocking):** real-time counts
via the merchant-plugin webhook (would unlock `low_stock`); background refresh
of availability on history entries older than 24h.

~~Restock alerts — "email me when this sold-out size is back"~~ — shipped
2026-06-24, PR #261 (`f3ae226`). Go-live wiring is done — see the P1 entry
for the one remaining verification. **Deferred:** optional social-proof count
on the CTA ("12 others are watching this size") — the GET
`/api/restock-alert?brandHandle=&size=` count endpoint already exists to
power it.

~~Story-compose feature: image + now-playing + text overlay~~ — tracked in
[RELEASE_V2.md §1](RELEASE_V2.md#1-story-share-editor-----). Editor
scaffolding landed behind the `V2` flag; Spotify OAuth PKCE is 🟠 stub and
template assets ⚪ pending — both tracked there, not here.

### v2 themed redesign of the privacy / delete / opt-out pages
**Repo:** `Tessellate-Studio/tessellate-pages`
**Files:** `alate/privacy-policy.html`, `alate/delete-account.html`,
  `alate/brand-optout.html`

Currently v1 — generic system-font styling, legally complete but
visually unrelated to the app. Redesign to match Alate's grey-purple
+ TAN Nightingale identity. Feature-flag under `/alate/v2/*` URLs;
keep v1 canonical until v2 is reviewed, then flip the default in
`index.html`.

**Do NOT rewrite legal content** — v1 is authoritative. Only restyle.
Embed SVGs inline (no external deps). Palette + tokens from
`mobile/src/constants/theme.ts`.

### Retire `HeadingImage` component
**Path:** `mobile/src/components/HeadingImage.tsx`

Trigger: user licenses TAN Nightingale (planned purchase — see
`project_font_tan_nightingale.md` memory). When the TTF/OTF lands in
`mobile/assets/fonts/`:

1. Register via `expo-font` in `App.tsx`
2. Replace the `headingSerif` mixin in `mobile/src/constants/theme.ts`
3. Grep `HeadingImage` → replace every callsite with plain `<Text
   style={typography.displayLarge}>` using the fallback string
4. Delete `mobile/assets/images/headings/*.svg` +
   `react-native-svg-transformer` from metro config (if no other SVG
   usage)
5. Delete `HeadingImage.tsx`

---

## P3 — nice-to-haves

### Consolidate the enrichment-types contract to ONE source of truth — NEW (2026-07-15)

The size-chart / offering payload shape (the alate↔loom seam) is hand-copied
instead of imported from one source: alate backend inlines a mirror in
`backend/sdk/loom/client.ts` (`BrandSizeChart`, `ProductOffering`); alate
mobile inlines another in `mobile/src/services/api.ts`
(`ScrapedSizeChart`/`ScrapedSizeRow`, TODO already flags the swap) and again
in `SizeChartSheet.tsx`; loom imports a vendored `.tgz`
(`file:vendor/…`).

**Why it matters:** hand-kept copies drift. A field added on one side (a new
measurement axis, a new offering type) silently mismatches the others until
something breaks at runtime. This is the "one source of truth" the whole
DATA_CONTRACT is built around.

**Update 2026-08-11 — the standalone repo is off the table.** The user retired
`Tessellate-Studio/enrichment-types` as a product call, so the "GitHub
install" option is dead, not deferred — the package spec can never resolve.

**The plan (pick one distribution, then delete the copies):**
- **Option A — publish to npm** (`@tessellate/enrichment-types`). Standard
  `import type`. Needs an npm org/token (a user decision), and re-creates the
  standalone artefact that was just retired — check that is still wanted.
- **Option C — pick an owning repo and import from it.** No new artefact and
  no npm account: declare the types once in whichever of alate/loom owns the
  seam and have the other import them. Cheapest option now that a standalone
  package is not wanted, and the one to size first.
- Either way: replace the inline mirrors with `import type`, then `grep` for
  the old local type names → zero hits.

**How we ensure it STAYS in sync (the real answer):** once every consumer
imports the shared types instead of declaring its own, **the TypeScript
compiler becomes the enforcement** — a field added on one side is a build
error, not a silent runtime mismatch. Belt-and-braces: a tiny cross-repo CI
check that fails if the old inline type names reappear.

**Decision needed from you:** npm publish (A) vs owning-repo import (C). Once
picked, this is a mechanical ~1-PR swap.

**Cross-ref:** loom's `docs/HANDOFF.md` tracks the same seam as its open
tasks 10/13.

### Build the Shopify merchant plugin
Longer-term play: merchants install your app on their Shopify admin,
you get real-time catalog sync + variant-level stock + consented data
access. Current scraper is the acquisition layer; plugin is the
retention + moat. Not a launch blocker.

**Use cases the plugin unlocks (these are currently scrape-blind):**

- **Brand-defined material / fabric metafields** — the canonical
  example is Oshin Sarin's `custom.material` per-product metafield.
  Without merchant-issued Storefront API tokens, the public
  `/products/<handle>.json` doesn't expose these. This is why the
  Oshin material row stays "—" for handles without a fabric word
  (see the Fabric/material entry above).
- **Variant-level inventory + size charts** — public Shopify JSON
  gives availability per variant but NOT brand-uploaded size charts
  or fit notes. Merchants who install the plugin can attach those.
- **Custom-fit / made-to-measure offering** — already extracted from
  public JSON when present (`customFit` field on `ScrapedData`), but
  the plugin would let brands push richer customization options
  (measurement form schemas, lead times by region) without the
  scraper having to guess.
- **Niche-tag opt-in for the brand-collection directory** — 📌 PINNED FOR LATER (2026-05-27, together with the P4 entry). When the merchant-plugin schema is eventually designed, include a `niche_collections: string[]` column on the brand-side config so a brand who installs the plugin can
  declare their own niche tags ("tall-friendly", "petite-friendly",
  "wide-foot-friendly", "slow-fashion") from day one. This becomes
  the brand's pitch to be surfaced in the discovery browse, and
  the directory's strongest signal alongside user attestations.

**Build it on loom, and a piece of it is already waiting there (2026-07-28).**
alate used to carry two endpoints for the shopper-facing half of this —
`/api/ai?action=brand-list` and `brand-products`, "list connected brands" and
"browse a brand's products". They were deleted: unauthenticated, uncalled, and
reading a seven-month-stale catalog out of `enriched_products`, which is the
shadow-catalog pattern both repos retired. The **capability** is real and is
parked in loom's `docs/HANDOFF.md` → "Capability parked here", with a note to
rebuild it on `shopify_sessions` + the live Admin API (`api/brand/products.ts`
already does exactly that) rather than porting alate's SQL back.

So when this entry is picked up: the brand-side data story is loom's, alate
consumes it over the composed endpoint, and nothing catalog-shaped goes back
into alate's DB. Boundary rules: [`DATA_CONTRACT.md`](./DATA_CONTRACT.md) →
"Who may CALL whom"; full reasoning:
[`memory/decisions/rfd-001-alate-loom-boundary.md`](./memory/decisions/rfd-001-alate-loom-boundary.md).

The merchant plugin is the consent path. Anything that needs brand
metadata which is NOT on the public storefront pages eventually
routes through here.

~~Affiliate API integration for ASOS / Zara / H&M~~ — DEFERRED TO v2
(2026-05-22, decision keep): JS-shell retailers (ASOS, Zara, H&M, the
Farfetch / Net-a-Porter tier) run enterprise-grade anti-bot that the
Puppeteer fallback does not solve. The route forward is affiliate networks
(Awin, Rakuten, Skimlinks) or direct programs, with a fallback chain of
affiliate API → simple fetch → Puppeteer → manual entry. **Deferred
because:** (a) needs external account setup + API keys that don't exist yet,
(b) multi-day per-program integration, (c) affiliate programs want a working
consumer app first. Store-listing copy already drops the named-retailer claim
(regression log row #40).

### Reintroduce the Preferences section on Account
Previous placeholder was removed per the launch-hardening round
because nothing was wired to it. When real preferences exist (fit
preference, notifications, theme toggle), bring back the section
backed by a `preferencesStore` (Zustand + AsyncStorage).

### Body croquis v2
See `project_body_croquis_plan.md` memory. User has failed this once;
architecture split (model vs renderer) is the key. Out of scope until
after App Store.

**North star (2026-09-07):** Stage B of
[`memory/project_product_vision.md`](memory/project_product_vision.md). The
vision's payoff is the avatar *in the fit check*, so a rebuild should land on
the result screen first, not the setup screen. The croquis was retired from
`AvatarSetupScreen` as dead code (comment at line 48); the parametric model
is intact and tested.

---

## P4 — post-V2 (deferred until demand validates)

### Niche-fit BRAND collection — user-submitted recommendations directory — 📌 PINNED FOR LATER (2026-05-27)

**Status:** **PINNED** — no further activity until demand signal fires (see promotion criteria at the bottom of this entry). User direction 2026-05-27: *"the brand cataloguing is a feature for later, so put a pin on all the activities and log it for the roadmap."* The `niche_keyword` column on `brand_requests` (PR #167) is the only piece that lands now — it measures the demand signal without committing to the surface.

> Demand signal is accumulating since 2026-07-21, when the `niche_keyword`
> migration was finally applied (it had silently 500'd every insert for ~55
> days — see the P0 tombstone). The promotion criteria below are measurable
> again, but the outage means the current count understates real demand.

When demand signal does fire and this gets bumped: re-read the rest of this entry as the v1 scope spec. It's intentionally complete.

**See also (2026-06-09, status UNCHANGED — still pinned):** this directory is **Stage 3 of the "fit graph" roadmap** — [`docs/backlog/fit-graph.md`](./docs/backlog/fit-graph.md). Two updates to fold in *when* this is bumped (not now): (1) the personal *sizing passport* + a post-purchase fit-log can **passively populate** these `niche_attestations` from frame-tagged fit outcomes — removing the manual-submission friction this spec assumes; (2) the demand signal the pin was waiting on is now firing (user's r/TallGirls re-confirmation 2026-06-09 + the `niche_keyword` data). Un-pinning remains the user's call.

**Important — what this is NOT.** This is **not a product catalogue**. It's a community directory of **brands** that fit a niche. Users submit *brand* recommendations against niche tags — "Brand X does long sleeves that actually reach my wrist" — and other users browse by niche to discover where to look. The surface produces *brand-name + brand storefront URL*; the user clicks through to the brand's own site. Alate doesn't host product listings, doesn't scrape brand catalogues, and doesn't aggregate product data.

This framing matters: aggregating user *opinions about brands* is categorically different from aggregating *scraped product data*. The first is what Reddit threads and Beauty Insider lists already do legally; the second is what AP#1 and AP#3 prohibit.

**The problem this solves.** Subreddit threads in r/TallGirls, r/PetiteFashionAdvice, r/Sewing, r/poshmark are dominated by *brand-recommendation-seeking* posts: *"which brands make hoodies with long enough sleeves?"*, *"which brands do petite-friendly midi dresses?"*, *"which brands make wide-foot-friendly heels?"* The fit-prediction side of Alate answers "will this thing fit me" once a user has pasted a URL. The discovery side — *"which brands should I even look at"* — is a different surface entirely. Right now the Reddit threads are the marketplace; Alate could be a better-organised, body-niche-keyed version of the same conversation.

**Why this is more common than tall-only.** Surfaced 2026-05-24 from the r/TallGirls hoodie thread that prompted the arm-length entry. The user's read: *"this is more of a common problem that I see on these subreddits — they mostly ask for suggestions on where to find a specific fit/style"*. Tall sleeves are one niche; petite trouser-rise, wide-foot sneakers, modest swimwear, brand-ethos shopping (Indian slow fashion, B Corp certified, made-in-India) all map onto the same shape — *which brand consistently does this niche right*, not "show me product X."

### Data model (illustrative — not a spec)

```sql
-- A brand row. Created on first user submission; updated when more submit.
CREATE TABLE niche_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_handle text NOT NULL,         -- lowercase host minus tld, matches brand_requests.brand_handle
  brand_display text NOT NULL,        -- user-facing brand name
  storefront_url text NOT NULL,       -- top-level brand URL only — never a product page URL
  first_submitted_at timestamptz DEFAULT now(),
  UNIQUE(brand_handle)
);

-- A user attestation: "I (user X) think (brand Y) is good for (niche Z)".
CREATE TABLE niche_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES niche_brands(id),
  niche_tag text NOT NULL,            -- 'tall-sleeves', 'petite-rise', 'wide-foot', 'modest', 'slow-fashion', etc.
  user_id text,                       -- nullable; anonymous attestations allowed
  device_id text,                     -- for rate-limiting against spam
  attestation_note text,              -- optional free text ("their large is roomy in the sleeves")
  upvotes int DEFAULT 0,              -- other users co-sign without re-submitting
  created_at timestamptz DEFAULT now()
);

CREATE INDEX niche_attestations_brand_idx ON niche_attestations(brand_id);
CREATE INDEX niche_attestations_tag_idx   ON niche_attestations(niche_tag);
```

**Critically: no `product_*` columns anywhere.** No URLs to specific products. No images. No prices. No size data. Each row is a brand-level opinion. This is what keeps the data model out of AP#1 + AP#3 territory entirely.

### Submission flow (UX sketch)

1. After a successful FitResult, user sees a "tell others this brand is good for [niche]" CTA gated on whether the user's profile suggests a relevant niche (e.g. `arm_length: 'long'` → offer the "tall-sleeves" tag).
2. User taps → confirms `(brand X, niche-tag Y, optional note)` → submission lands in `niche_attestations`.
3. The same FitResult can surface a "this brand is also recommended for: [tag-1], [tag-2]" line drawn from past attestations on the same brand.

### Browse flow

1. Discovery tab → niche filter (tall-sleeves, petite-rise, wide-foot, modest, slow-fashion, …) → list of brands ranked by `count(attestations)` for that tag, then `sum(upvotes)` as a tie-breaker.
2. Tap brand → brand info card: name, storefront URL (deep-link out), summary of niche tags the brand is co-signed for, anonymised count of attestations.
3. Tap "visit brand" → external browser open. Alate is the directory, not the store.

### Promotion criteria (when this graduates out of P4)

Bump to P2/v3 when at least two of these fire:

- ≥30 user attestations across ≥10 distinct brands in closed-beta usage (proves the submission UX is usable).
- ≥10 entries in `brand_requests` with the same body-niche keyword (proves the *demand* is there for a discovery surface, not just per-URL fit-checking).
- A subreddit launch post (per [docs/REDDIT_LAUNCH_PLAN.md](docs/REDDIT_LAUNCH_PLAN.md)) sees comments asking *"how do I find more brands like this?"*
- A brand partner reaches out asking to be featured in a niche tag.

### What to do now (keep the entry warm without committing to the build)

1. ~~Tag `brand_requests` rows with a `niche_keyword` column~~ — code shipped
   PR #167 (`aa5749c`); the migration was finally applied 2026-07-21, so
   demand is measurable from that date. The 15 pre-outage rows stay
   `niche_keyword = null` (checked: none matches a niche pattern — all
   mainstream brands), so no backfill is owed.
2. Add a `niche_collection` consent boolean to the merchant-plugin's schema design when that work starts (entry above in P3), so a brand who installs the plugin can opt their entire storefront into the niche-tag system from day one — this becomes one of the merchant plugin's clearer retention pitches.

### Anti-pattern compliance check

| Concern | Mitigation |
|---|---|
| AP#1 — no shared scrape catalogue | The data model has zero product rows. Brand-level opinions only. |
| AP#3 — no browse across scraped data | The browse surface is over user attestations, not scraped products. Tap-through goes to the brand's own site. |
| Misuse — bad-faith attestations | Per-device rate limit; upvote-as-co-sign (cheap social signal); editorial review of new tags before they're exposed in browse filters. |
| Brand reputation | Brands can opt out (re-use `blocked_brands` table) or opt in for richer treatment (merchant-plugin route). |

### Wire `sendNoreply()` into specific transactional flows
**Path:** `backend/sdk/email/sender.ts` (primitive shipped in PR #161)

The Resend-backed sender utility is live and ready to call. No `/api`
endpoint actually invokes it yet — this entry tracks the per-flow
wire-up work that was intentionally deferred so PR #161 stayed
reviewable.

Candidate flows (each is its own small PR):
- ~~**`/api/brand-request` acknowledgment**~~ — superseded. What shipped
  2026-09-16 (#792) is not an acknowledgment but the notification itself:
  `functions/brandAddedNotifier.ts` mails the opted-in address once the
  brand is onboard with Alate for Brands, and clears `requester_email` in
  the same write. An "we logged your request" ack on top of that would be
  the noise this entry's own warning is about.
- **OTP-on-signin** — only if sign-in becomes mandatory. Currently
  optional per AP#6, so skip until that posture changes.
- **Order confirmation** — if/when Alate ever transacts directly
  (today it bounces to the brand's storefront, so N/A).

**Why parked:** none of these are launch blockers, and "send the
user an email" can erode the on-device-first privacy posture
(AP#4) if applied carelessly. Don't wire a flow without first
asking: does the user actually need this email, or is it noise?

**Don't unblock until** at least one user explicitly asks for
"hey, did you get my request?" follow-up — which is the strongest
signal that the brand-request ack flow is wanted, not assumed.

### Wardrobe-app integration (Indyx, Whering, Acloset, etc.) + Alate-native capsule wardrobe
**Detail doc:** [`docs/backlog/wardrobe-integration.md`](docs/backlog/wardrobe-integration.md)

Status: parked. Reconsider once social listening on Reddit / Instagram /
Pinterest validates which wardrobe app the target user is actually
using and whether the demand is for "save to my existing app" vs
"Alate has its own closet".

**North star (2026-09-07):** Tier 4 here is Stage D of
[`memory/project_product_vision.md`](memory/project_product_vision.md)
(have / wishlist / on loan / to donate, growing out of `CalibrationGarment`),
and lending-at-a-price is its Stage E. The gate above is unchanged.

Quick read of the detail doc:
- **No consumer wardrobe app has a public API** — verified across Indyx,
  Whering, Acloset, Stylebook, Save Your Wardrobe (the last is B2B,
  not consumer). Plan must work around that.
- **Tier 1 (universal share-sheet export)** is the only path that
  ships unilaterally. ~2 days work. Marketing-safe to call this
  "Save to your wardrobe app" without naming partners.
- **Tier 2 (per-app deep links)** is opportunistic per-app QA.
- **Tier 3 (signed partnerships)** are 2-3 month sales cycles — start
  in parallel, never block a release on them.
- **Tier 4 (Alate-native wardrobe)** is the V3+ play; only commit when
  V2 retention shows the wardrobe-shaped need.

**Don't unblock until** the social-listening cheat-sheet from the
2026-05-03 conversation produces enough signal to pick a target user
+ target app. Marketing announcements before then risk implying
partnerships that don't exist.

---

~~P4 — Platform: guinea-pig effectiveness audit~~ — ✅ RESOLVED 2026-07-18,
superseded by the litmus revival: repo renamed **litmus**, E2E suite
reconciled, testID contract generated from source (112 IDs), plus
visual-compliance and rule-compliance tiers (litmus PRs #6–#10 + alate #344 +
forge #12 + badige #22). **Still open (moved to litmus fast-follow):**
un-skip the two flow specs; add the size-guide CTA E2E case (loom HANDOFF);
recreate the dead `ALATE_REPO_TOKEN` (see `docs/manual-runbook.md` → litmus).

---

## Dismissed / out of scope

None currently.
