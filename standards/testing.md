# Testing directive — unit, E2E, visual, rule compliance, and UAT

Where every kind of test lives, and the contract that keeps E2E from rotting.
Platform standard — apps follow it as-is; app-specific deltas go in the app's
own docs.

> **Renamed 2026-07-18:** the lab repo `guinea-pig` is now **litmus**
> (`Tessellate-Studio/litmus`, npm `@tessellate-studio/litmus`). GitHub
> redirects the old slug; docs should say litmus.

## The tiers

| Tier | Lives where | Runs when | Gate |
|---|---|---|---|
| Unit + component (jest) | **In the app repo** | Locally before every commit; app CI on every PR | Green before any commit (TDD rule — `standards/workflows.md`) |
| E2E (appium + wdio, real emulator) | **litmus** (`Tessellate-Studio/litmus`) — never in the app repo | On APK builds via `repository_dispatch`, or manually | Advisory until a suite is proven stable, then blocking per app |
| Visual compliance (screenshots + LLM critique) | **litmus** `visual/` | `visual-critique` job after each E2E run | Advisory (verdict table in the run summary; promote per app once stable) |
| Rule compliance (static checks of these standards) | **litmus** `checks/` | Same dispatch as E2E (`rule-compliance.yml`, no emulator, ~1 min) + weekly sweep | testID-contract integrity and Marcellus font-weight are **hard**; colours/a11y advisory until baselines burn down |
| UAT (manual, on-device) | Checklist per app (release runbook / USER_PATHS.md) | Before promoting any release track | Human sign-off |

## Why litmus is a separate repo (do not merge it into forge)

- It carries the heavy device-lab stack (appium, WebdriverIO, emulator images)
  that no app or platform tool needs at build time.
- Its lifecycle is different: suites change when *screens* change, not when
  platform standards change.
- One lab serves many apps (alate today; badige and others as suites get
  written). Apps consume it as a git dependency
  (`github:Tessellate-Studio/litmus`) for shared test utilities only.

## The testID contract (the load-bearing rule)

E2E selectors find elements by `testID`. The contract file —
`litmus/e2e/<app>/TEST_ID_CONTRACT.md` — is **generated from the app's
source** (`litmus/scripts/gen-testid-contract.ts`), never hand-edited: the
original hand-kept contract drifted fatally within two months.

- **Never remove or rename a testID in an app without a paired litmus PR**
  (regenerate the contract + update selectors/specs). A silently dropped
  testID doesn't fail loudly — the spec times out waiting for an element
  that no longer exists. litmus's rule-compliance run fails hard on both
  a missing suite-used testID and contract drift.
- New interactive elements on covered screens get a `testID` at creation
  time; the next contract regeneration picks them up.

## Trigger flow (alate is the template)

1. App CI builds the APK (cloud builds only — never locally).
2. App CI fires `repository_dispatch` (event: `<app>-apk-ready`) to litmus
   with payload `{run_id, sha, variant, artifact_name}` — `artifact_name`
   follows the app's own convention (alate: `alate-<variant>-apk`), and
   `sha` pins the rule-compliance checkout to the exact commit that built.
3. litmus's `e2e-<app>.yml` downloads the APK artifact and runs the wdio
   suite on an emulator; its `visual-critique` job judges the captured
   screenshots against the app's design rules (advisory).
   `rule-compliance.yml` checks the app source against the machine-checkable
   standards in parallel.
4. Failures land in the app's regression log (symptom → root cause → fix →
   test → lesson), same as any user-reported bug.

Manual run: `workflow_dispatch` on the litmus workflow (pass `apk_run_id`
of an app build), or locally with `APK_PATH` pointing at a downloaded
artifact — APKs are never built on a laptop.

## UAT (user acceptance testing)

- UAT is a **manual on-device pass of the app's user paths** (see the app's
  `USER_PATHS.md`) on a release candidate build — not a re-run of E2E.
- A path row counts as ✓ only when the value reaches a rendered pixel on the
  device (same bar as the end-to-end anti-pattern).
- Findings triage: crash/data-loss → block the release; degraded-but-usable →
  regression log + BACKLOG with priority; cosmetic → BACKLOG.
- Sign-off is the human's — never claim UAT passed on the user's behalf.

## Adding E2E for a new app

1. Create `litmus/e2e/<app>/` mirroring the alate layout
   (`wdio.conf.ts`, `helpers/`, `specs/`).
2. Generate the contract:
   `npx tsx scripts/gen-testid-contract.ts --target <checkout> --app <app>`.
3. Wire the app CI dispatch (`<app>-apk-ready` with the payload above) + a
   litmus workflow for it.
4. Start advisory; flip to blocking once the suite survives a week of real PRs.
