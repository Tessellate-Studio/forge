# Backlog — Alate (for Brands)

Scored weekly by `forge:roadmap-pulse` (this repo is in the alate pulse's
scope; latest scored run: `WEEKLY_DIGEST.md`). Sources: ops-hardening ADR
(`memory/decisions/adr-001-ops-hardening.md`), `docs/manual-runbook.md`
open items, `memory/project_regression_log.md`.

## P1 — needs the user

*(empty — the storefront-password paste in the runbook is the one open
user item)*

## P2

- **Attach ONE size chart to MANY products (junction table)** — surfaced by
  the admin redesign (`memory/decisions/pitch-003-admin-redesign.md`). A
  `size_charts` row carries a single `scope` + `scope_id`
  (`api/brand/sizeCharts.ts`), so "apply this chart to these 12 products"
  can only be done by duplicating the row per product — and a duplicate
  stops tracking edits to the original. That is why the redesign's bulk
  actions are fit offerings and restock intent only. Wanted:
  `size_chart_targets(chart_id, scope, scope_id)` so one chart has many
  targets, plus a composed-endpoint resolution change. **Schema + the
  alate-facing contract → RFD tier**, not a drive-by.
- **Give collection-scoped charts a real UI.** `scope: 'collection'` is
  accepted by the API and offered in the import reviewer, but there is no
  collection list endpoint, so the merchant must paste a raw collection id.
  Either add a collection picker (needs a `GET /brand/collections`) or drop
  the scope from the UI — today it is a half-supported third path.
- **`read_themes` widget check** — **code half DONE 2026-08-12** (decided
  pre-launch): `api/ops/themeWidget.ts` (shared-secret gated, 8 tests) reads
  the published theme's product template JSON and answers
  blockPresent/blockDisabled; watchdog check 4a enforces it (409 = scope
  pending → warning). Scope added to `shopify.app.toml` + Vercel
  `SHOPIFY_SCOPES`. **Remaining: the two user steps** — runbook →
  "read_themes grant". Background: regression row 13 (scraping unreliable
  both ways: bot-class crawler cache).
- **Instrument `admin/` with Sentry** (`@sentry/nextjs`). api/ was done first
  — it's the seam alate consumes; the embedded admin fails visibly to a
  human. During a marketing push, evaluating brands ARE the admin users.
- **alate backend health endpoint** (alate repo) mirroring loom's
  `api/health.ts` — `backend-alate.vercel.app` serves the size-finder POST
  the widget calls — then add it to loom's ops-watchdog probe list so the
  seam is monitored from both ends.
- **Burn down the 88 eslint warnings, then promote lint to blocking** (drop
  `continue-on-error` in ci.yml — policy note in the workflow header).
  Measured 2026-08-10: 0 errors / 88 warnings.
- **Tighten CI `timeout-minutes`** from the now-existing green-run history
  (typical runs 5-7 min vs 10-15 min caps).

## P3

- **Pre-listing: resolve the app handle before the public App Store listing.**
  The frozen handle `the-mood-layer` is harmless today (admin-URL-only, now
  test-pinned — regression row 6) but the App Store listing URL derives from
  it: `apps.shopify.com/the-mood-layer` WOULD be customer-visible for an app
  named "Alate (for Brands)". When listing prep starts, ask Shopify support
  for a handle change (possible pre-listing) and update
  `api/shopify-callback.ts` + `oauth.test.ts` the same day. Do NOT recreate
  the app for this — new credentials would invalidate every install
  (assessed 2026-08-10).

- **Webhook dead-letter persistence** — only if Shopify's retry window proves
  insufficient in practice. Sentry shows zero failed cleanups since going
  live (checked 2026-08-10); stays parked.
- ~~**Storefront theme-extension monitoring**~~ — superseded by the two P2
  items above (Liquid-render CI + widget probe), which split it into its
  build-time and run-time halves.

## Done

- ~~Confirm the install redirect + App Bridge banner investigation~~ — CLOSED
  2026-08-12 with the whole saga (regression rows 6-12): frozen handle
  restored, handshake race fixed, embed params inlined, CDN filename typo
  (the root: App Bridge had NEVER booted), same-origin proxy (adr-002), FK
  CASCADE restored + `?reinstall=1` recovery. User-verified end-to-end:
  OAuth → dashboard → live product data. Sentry's first caught issue
  (LOOM-1) cracked the final layer — the monitoring loop paid for itself.
- ~~Render the extension Liquid in CI~~ — DONE 2026-08-10 (pulse #2):
  `extensions/__tests__/liquid-render.test.ts` renders every block template
  under liquidjs `strictVariables` with allow-listed `shop`/`product` drops;
  carries a regression pin proving the `myshopify_domain` typo now fails CI.
- ~~Storefront widget probe in ops-watchdog~~ — DONE 2026-08-10 (pulse #3):
  watchdog check 4 logs in past the dev store's password wall and asserts the
  size-finder block renders with non-empty `data-shop`. **Live since
  2026-08-11** — `STOREFRONT_PASSWORD` set, and the check immediately earned
  its keep: it reports the block is absent from the dev store's theme
  (runbook → "Size Finder widget — enable on a store").
- ~~Create the Sentry `loom` project + set `SENTRY_DSN`~~ — DONE 2026-08-01:
  project created (user), DSN set via MCP + deployed; crash-monitor scope
  updated. Zero unresolved issues since.
- ~~Set repo secret `TESSELLATE_COMPOSED_SECRET`~~ — DONE 2026-08-03 as a
  full rotation (sensitive-flag made the old value unrecoverable); watchdog
  health check live since.
- ~~Connect the Vercel projects to GitHub~~ — SUPERSEDED: Hobby plan refuses
  private org repos. Replaced by deploy-on-merge via CLI workflow, PRs
  [#48](https://github.com/Tessellate-Studio/loom/pull/48) +
  [#52](https://github.com/Tessellate-Studio/loom/pull/52); proven live
  2026-08-10 (run 31409500390: both projects deployed on merge).
