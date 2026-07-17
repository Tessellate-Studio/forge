# Testing directive — unit, E2E, and UAT across Tessellate apps

Where every kind of test lives, and the contract that keeps E2E from rotting.
Platform standard — apps follow it as-is; app-specific deltas go in the app's
own docs.

## The three tiers

| Tier | Lives where | Runs when | Gate |
|---|---|---|---|
| Unit + component (jest) | **In the app repo** | Locally before every commit; app CI on every PR | Green before any commit (TDD rule — `standards/workflows.md`) |
| E2E (appium + wdio, real device/emulator) | **guinea-pig** (`Tessellate-Studio/guinea-pig`) — never in the app repo | On APK builds via `repository_dispatch`, or manually | Advisory until a suite is proven stable, then blocking per app |
| UAT (manual, on-device) | Checklist per app (release runbook / USER_PATHS.md) | Before promoting any release track | Human sign-off |

## Why guinea-pig is a separate repo (do not merge it into forge)

- It carries the heavy device-lab stack (appium, WebdriverIO, emulator images)
  that no app or platform tool needs at build time.
- Its lifecycle is different: suites change when *screens* change, not when
  platform standards change.
- One lab serves many apps (alate today; badige and others as suites get
  written). Apps consume it as a git dependency
  (`github:Tessellate-Studio/guinea-pig`) for shared test utilities only.

## The testID contract (the load-bearing rule)

E2E selectors find elements by `testID`. The contract file —
`guinea-pig/e2e/<app>/TEST_ID_CONTRACT.md` — lists every testID the specs
depend on.

- **Never remove or rename a testID in an app without a paired guinea-pig PR**
  updating the contract + selectors. A silently dropped testID doesn't fail
  loudly — the spec times out waiting for an element that no longer exists.
- New interactive elements on covered screens get a `testID` at creation time
  and a row in the contract.
- When a screen is reworked, mark superseded rows STALE in the contract rather
  than deleting them, until the selectors are reconciled.

## E2E trigger flow (alate is the template)

1. App CI builds the APK (cloud builds only — never locally).
2. App CI fires `repository_dispatch` (event: `<app>-apk-ready`) to guinea-pig.
3. guinea-pig's workflow (`e2e-alate.yml`) downloads the APK artifact and runs
   the wdio suite on an emulator.
4. Failures land in the app's regression log (symptom → root cause → fix →
   test → lesson), same as any user-reported bug.

Manual run: `workflow_dispatch` on the guinea-pig workflow, or locally
`npm run e2e:<app>:local` with a device attached.

## UAT (user acceptance testing)

- UAT is a **manual on-device pass of the app's user paths** (see the app's
  `USER_PATHS.md`) on a release candidate build — not a re-run of E2E.
- A path row counts as ✓ only when the value reaches a rendered pixel on the
  device (same bar as the end-to-end anti-pattern).
- Findings triage: crash/data-loss → block the release; degraded-but-usable →
  regression log + BACKLOG with priority; cosmetic → BACKLOG.
- Sign-off is the human's — never claim UAT passed on the user's behalf.

## Adding E2E for a new app

1. Create `guinea-pig/e2e/<app>/` mirroring the alate layout
   (`wdio.conf.ts`, `helpers/`, `specs/`, `TEST_ID_CONTRACT.md`).
2. Seed the contract from the app's existing testIDs before writing specs.
3. Wire the app CI dispatch (`<app>-apk-ready`) + a guinea-pig workflow for it.
4. Start advisory; flip to blocking once the suite survives a week of real PRs.
