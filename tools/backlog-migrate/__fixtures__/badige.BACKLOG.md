# Bādige — Backlog

Durable record of out-of-scope / deferred work. Newest priorities first.

## P1 — The integration suite runs against the LIVE database; give it a `test` schema

Filed 2026-09-10, out of the row-29 fix (see
[`project_regression_log.md`](project_regression_log.md)).

**The problem.** `src/__tests__/integration/*` creates and deletes real
landlords, tenants, houses, tenancies and payments — in `badige` itself
(`ffbrxqucbdgvcwwhcjbg`), the project the app uses. The suite's README has
always said "create a test Supabase project"; that was never done, and there is
no free project slot left to do it with.

A clean pass is genuinely clean — verified 2026-09-09, all six tables returned
to their exact starting counts. The danger is an **interrupted** run: cleanup is
`afterAll`-only, so a cancelled job or a mid-`beforeAll` failure strands
whatever was already inserted. That had already happened twice — 15 of the 20
rows in `users` were orphans from 2026-06-04 and 2026-07-18 runs, purged
2026-09-10 along with 5 houses, 2 tenancies, 1 payment and 1 proof. It then happened a third time **during that same cleanup**: a network drop mid-run on 2026-09-10 failed all 37 tests and left 5 landlord rows behind — the first insert in each suite landed, then both the rest of `beforeAll` and the `afterAll` deletes lost the connection. Purged the same day. A `globalSetup` truncate would have made it a non-event.

### Yes — a schema in the same project works, and it is the recommended fix

Asked directly: *can this just be tables in the same project?* **Yes.** Postgres
schemas are the isolation unit, and one Supabase project can expose several.
Two facts make it clean here, both verified rather than assumed:

- **`public.users` has its own `UUID PRIMARY KEY DEFAULT uuid_generate_v4()` and
  no foreign key to `auth.users`** (`001_initial_schema.sql`). The fixture graph
  is therefore entirely self-contained — a parallel copy needs no auth coupling,
  which is the usual thing that makes schema-level test isolation painful.
- The project currently exposes only `public` (plus the managed `auth`,
  `storage`, `graphql_public`, `realtime`, `vault`, `extensions`,
  `supabase_migrations`). Adding one more is a settings change, not a migration
  problem.

**Shape of the work:**

1. Add a `test` schema mirroring the 14 tables in `001_initial_schema.sql`
   (+ the later migrations). Drive it from the existing migration files rather
   than hand-copying, so the two cannot drift.
2. Dashboard → Settings → API → **Exposed schemas**: add `test`. Grant usage to
   `anon` / `authenticated` / `service_role`.
3. Point the suite at it — `createClient(url, key, {db: {schema: 'test'}})` in
   [`setup.ts`](src/__tests__/integration/setup.ts). No spec changes: every
   suite already goes through `createAdminClient()`.
4. Add a `TRUNCATE … CASCADE` of the `test` schema to `globalSetup`, so a run
   starts clean regardless of how the previous one died. **This is the part that
   actually fixes the leak** — `afterAll` cleanup cannot survive a killed
   process; a truncate at start can.
5. Only then set the CI secrets and let `Integration (live Supabase)` gate PRs
   (it is deliberately off — see the DO-NOT-SET note in
   [`ci.yml`](.github/workflows/ci.yml)).

**What this does and does not buy.** It isolates the *data*: production rows can
no longer be touched, and a leak is confined to a schema that gets truncated
anyway. It does **not** isolate the *instance* — the same CPU, disk and
connection quota are shared, so a runaway test can still affect the live app,
and concurrent CI runs would still collide inside `test` unless each run gets
its own schema (`test_<run_id>`, dropped at the end) or CI concurrency is
serialised.

### Rejected alternatives

| Option | Why not |
|---|---|
| A second Supabase project | No free slots — the org already holds `alate` and `badige`. This is the only reason we are not doing the obvious thing. |
| Supabase branching (ephemeral preview DBs) | Paid — needs Pro. Revisit if the org upgrades; it is strictly better than schema isolation. |
| Local stack via `supabase start` | Best isolation and free, and the repo already has `supabase/config.toml` + 9 migrations. But **neither the Supabase CLI nor Docker is installed** on this machine (verified 2026-09-10), and the standing rule is that heavy local toolchains stay off the laptop. Reasonable for CI (`supabase/setup-cli`) even if not locally — worth pairing with the schema approach later. |
| Leave it | The suite is real coverage — it caught nothing this time only because the failure was a revoked key. Leaving it pointed at production means the next interrupted run quietly adds to the orphan pile again. |

**Verify:** after the change, run `npm run test:integration`, then confirm
`public` row counts are untouched and the fixtures landed (and were cleared) in
`test`.

## P1 — `app.config.js` silently shadows `app.json`, so EAS Build sees NO android versionCode

Filed 2026-08-01, found by the closing retro on the expo-dependency PR (#56).

**The finding, verified not inferred.** `npx expo config --type public --json`
resolves `android.versionCode` as **absent**. The repo has BOTH config sources:

| source | android versionCode | status |
|---|---|---|
| `android/app/build.gradle:42` | `2` | what a local gradle build uses |
| `app.json` → `expo.android.versionCode` | `2` | **dead — fully shadowed** |
| `app.config.js` | *(not set)* | **what EAS actually reads** |

`app.config.js` exports a static object, so it REPLACES `app.json` rather than
merging with it. The `expo` block in `app.json` therefore has no effect.

**Why it is only now a problem.** While builds ran through gradle, `build.gradle`
supplied the versionCode and nothing noticed. PR #56 added the `expo` package
specifically so **EAS Build** can resolve `app.config.js` — which activates the
path where the versionCode is missing. First EAS release build is where this
shows up, and a wrong/absent versionCode is exactly the class of error the Play
Console rejects late.

**Fix (one line, deliberately not taken here):** add
`android: { versionCode: 2 }` to `app.config.js` and delete the now-dead `expo`
block from `app.json` so there is one source of truth. Not done in #56 because
that PR was scoped to porting a parked dependency change and was verified only
against `npm ci` / `tsc` / jest — changing release versioning deserves its own
change and a real EAS build to confirm.

**Verify:** `npx expo config --type public --json` should report
`android.versionCode: 2`, and `app.json` should no longer carry an `expo` key.

## P0 — `fast-xml-parser` advisory (CVE-2026-41650), pinned behind a React Native bump

Filed P0 by request 2026-07-19. **Read the severity note below before scheduling
work** — the evidence points lower than P0, and the entry is written so that
call can be made deliberately rather than by drift.

**The alert:** `fast-xml-parser` < 5.7.0 — CVE-2026-41650 /
[GHSA-gh4j-gqv2-49f6](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-gh4j-gqv2-49f6),
GitHub severity **MEDIUM**, surfaced via `package-lock.json`.
XMLBuilder does not escape
`-->` in comment content or `]]>` in CDATA when building XML from JS objects, so
user-controlled data reaching either sink allows XML injection (XSS, SOAP
injection, data manipulation).

**Why it is not a one-line fix — it is transitive and pinned:**

```
badige@1.0.0
`-- react-native@0.73.0
  +-- @react-native-community/cli-platform-android@12.1.1
  | `-- fast-xml-parser@4.5.7
  `-- @react-native-community/cli-platform-ios@12.1.1
    `-- fast-xml-parser@4.5.7 (deduped)
```

Nothing in badige depends on it directly. The patched line is 5.7.0, a major
bump from the 4.5.7 the RN 0.73.0 CLI pins, so closing it properly means moving
React Native — a large, device-test-gated change, not a dependency patch. An
`overrides` pin to 5.x is the tempting shortcut but risks breaking the Android
build, since the CLI parses `AndroidManifest.xml` / `.plist` files through this
package at build time.

**Honest severity read (2026-07-19).** The vulnerable sink is XMLBuilder
*writing* XML. In this dependency path the consumer is the React Native CLI
handling project manifests at **build time**, on inputs from our own repo — not
app runtime code, and not attacker-controlled. `grep -rn "fast-xml-parser" src/`
returns nothing. Real exposure for badige therefore looks **low**, and the fix
cost is high (an RN major). Recommend re-rating to P2 and folding it into the
next planned React Native upgrade unless someone can demonstrate a runtime path.
It is recorded at P0 as instructed; the argument for lowering it is above.

**Done when:** `fast-xml-parser` resolves to >= 5.7.0 (almost certainly via a
React Native / `@react-native-community/cli` upgrade), `npm ls fast-xml-parser`
confirms it, the Dependabot alert closes, and an APK builds green in CI.

**Note on the alert count.** A `git push` banner on 2026-07-19 advertised
"2 vulnerabilities (1 high, 1 moderate)". The API disagrees: exactly **one**
alert is open, and it is MEDIUM. Every other alert on the repo is `fixed`. Trust
`gh api repos/Tessellate-Studio/badige/dependabot/alerts`, not the push banner —
the banner appears to lag.

## ~~P1~~ RESOLVED 2026-07-20 — TypeScript gate restored, count at 0

**Done.** `npx tsc --noEmit` reports **0 errors** and the `Typecheck` step is
back in `ci.yml` as a **blocking** step (merged as `7db3e86`).

The backlog was not inert — clearing it surfaced five bugs that were live:
- `EditProfile` read `user.phone`; the field is `phone_number`, so the phone
  input silently never populated.
- `AddExpense`'s `expenseId` (edit mode) was never declared on the param list,
  though ExpenseList passed it and AddExpense read it.
- `subscribeToNotifications` used the supabase-js **v1** `.from(t).on()` API;
  on v2 that throws. Ported to the v2 channel API (still uncalled — unverified
  against a live socket).
- `QUERY_KEYS.notificationsUnread` did not exist, collapsing the unread-badge
  poll onto the notification-list cache key.
- `usePendingPayments` was typed `unknown[] | null` while resolving a paginated
  response.

Plus a contract test that had never tested anything: it called
`submitUtilityPayment` (6 positional args) with one object literal and queried
`getCurrentMonthUtilityStatus(houseId, tenancyId)` as `(tenancyId, 'electricity')`,
asserting only `error === null`. Now correct and asserts `paid === true`.

`EmailInputScreen` was deleted: it imported `signInWithEmailOTP`, which
`services/auth` has never exported, and was registered nowhere.

**Keep the count at 0.** The rationale is in the `ci.yml` header — an un-gated
typecheck is the mechanism that shipped regression-log rows 19 and 25; both
errors were flagged by tsc and merged anyway because a new error is invisible
inside a tolerated pile.

<details>
<summary>Original entry (historical)</summary>

The PR test gate (`.github/workflows/ci.yml`) currently runs **unit tests only**.
`npx tsc --noEmit` was deliberately left out because the repo has pre-existing
type errors that would block every PR.

### Progress — ~~the two named errors + the type noise~~ shipped 2026-06-09, PR #6 (`227741f`); ~64 remain

Net: `npx tsc --noEmit` went from **~2530** errors to **~64** genuine,
pre-existing type errors. These are real app-code bugs, not config noise, and
need per-file decisions (so they were **not** auto-fixed in the gate-restore PR):

- **~30 — navigation HOC vs screen props.** The `LandlordNavigator`,
  `TenantNavigator`, and `AuthNavigator` register screens via
  `withErrorBoundary(Screen)`; the screens declare a hand-rolled
  `navigation: { navigate: (screen: string, ...) => void }` prop that is *not*
  assignable to React Navigation's `ScreenComponentType<ParamList, RouteName>`.
  Correct fix: retype the ~22 screens to use React Navigation's generated
  screen-props (`NativeStackScreenProps` / `BottomTabScreenProps`) instead of the
  custom shape. The `*ParamList` types already exist in `src/types/index.ts`.
- **`src/screens/auth/EmailInputScreen.tsx:12`** (`TS2305`) — imports
  `signInWithEmailOTP` which `services/auth` does not export.
- **`User` type gaps** (`TS2339`) — `EditProfileScreen` reads `User.phone`,
  `SettingsScreen` reads `User.name`; neither is on the `User` type. Decide
  whether to add them or change the call sites.
- **`src/hooks/useNotifications.ts`** (`TS2551` ×3) — uses
  `QUERY_KEYS.notificationsUnread`, which doesn't exist (only `notifications`).
- **`src/services/notifications.ts`** (`TS2339`/`TS2365`/`TS7006`) — `.on(...)`
  called on a `PostgrestQueryBuilder` (should be a realtime channel); a
  `string | number >= number` comparison; an implicit-any `payload` param.
- **~6 `<Button>` prop mismatches** (`TS2322`) — screens pass a `style` /
  `size` prop the `ButtonProps` type doesn't declare.
- Plus assorted: `dataProvider/index.ts` casts, `authStorage.ts` bad comparison,
  `usePaymentQueries`/`useExpenses` query-type mismatches, a `createHouse` vs
  `dpCreateHouse` typo, a 6-arg call passed 1 arg in a contract spec.

Run `npx tsc --noEmit` for the live list.

**Done when:** `npx tsc --noEmit` is clean, the `Typecheck` step is back in
`ci.yml`, and a PR shows it green.

</details>

## ~~P0~~ RESOLVED 2026-07-19 — Supabase security state verified against the live project

**Two access-control holes found and closed. Verified live, not assumed.**

`docs/HANDOVER.md` asserted a batch of database-side changes from the v1.10
session (`3851970`) that could not be verified from git. This entry existed
because an unverified security "yes" is worse than a known "unknown". It has
now been checked directly against project `ffbrxqucbdgvcwwhcjbg`.

**Why this was P0:** badige has disabled legacy JWT keys and runs on
anon/publishable keys throughout — the secret key is unused and there is no
Vercel/EAS server-side path. **RLS is the only control on this data** (tenant
PII, phone numbers, payment proofs, ID proofs, tenancy agreements). Separately,
disabling legacy JWTs killed the previously-leaked `service_role` key — that is
**no longer an open incident**.

**Repo going public (2026-07-19) leaked nothing new.** `.env` was never
committed and is gitignored. The only key in the tree is
`sb_publishable_SltF-…` (`src/services/supabase.ts:8`, `eas.json`, and the
checked-in `index.android.bundle`) — publishable keys are designed to be public
and already shipped inside the APK. What did change is reconnaissance: the
schema, all policies, and the invite-code algorithm are now readable without
decompiling.

### What was fixed

Applied 2026-07-19, recorded as
[`supabase/migrations/012_harden_invitations_and_notifications_rls.sql`](supabase/migrations/012_harden_invitations_and_notifications_rls.sql).

| Sev | Hole | Fix |
|---|---|---|
| **Critical** (OWASP A01) | `tenant_invitations` SELECT was `USING (true)`, role `PUBLIC`. anon was already revoked, but **every authenticated user** could `SELECT *` and read all landlords' tenant phone numbers plus live invitation codes. Codes are the only bearer credential in `acceptInvitation()`, so this also allowed attaching yourself to a stranger's tenancy. | Scoped to the invitee, plus a matching UPDATE policy so accepting still works |
| **High** | `notifications` INSERT was `WITH CHECK (true)` — any signed-in user could forge a notification into any other user's feed (in-app phishing). | Scoped to self or tenancy counterparty |

**Verification (live, post-change):**
- `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true')` → **0**
- Simulated a random signed-in user (`SET LOCAL ROLE authenticated` with a fresh
  `sub`, rolled back): sees **0 invitations**. The same query returned the full
  table before the change.

**Note on reading `pg_policies`:** `roles = {public}` does **not** mean publicly
readable — it means no role restriction. It is only dangerous alongside
`qual = true`. The remaining `{public}` policies are all gated on `auth.uid()`,
which is NULL for anon, so they match zero rows. Don't "fix" them.

### Reconciled checklist — all 8 rows

| # | Claim | Live result |
|---|---|---|
| 1 | Migrations 008–011 applied | **✓** — 008 rent cols ✓, 010 table ✓, 011 soft-delete ✓. ~~009 left 3 rows absolute~~ **corrected 2026-07-19: those 3 rows are test fixtures** (`example.com` / `storage.example.com`), never storage URLs, correctly skipped by 009's `/storage/v1/object/` pattern |
| 2 | All six PII buckets private | **✓** — all 7 buckets `public = false`, `profile-images` included |
| 3 | Anon exposure revoked | **✓** — only `users` is anon-readable, and its RLS still requires `auth.uid() = id` |
| 4 | Authenticated revoked on `fcm_tokens` + `scheduled_reminders` | **Partly — corrected 2026-07-19.** `SELECT` was revoked (hence no lint 0027), but **that lint only detects SELECT exposure**. Both tables still carried `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` for anon *and* authenticated; `TRUNCATE` is not RLS-gated. Closed by migration 013 |
| 5 | `notifications` insert narrowed to `authenticated, service_role` | **✓ narrowed — but was still `WITH CHECK (true)`.** Now fixed |
| 6 | `search_path` pinned, EXECUTE revoked on the 6 `notify_*` functions | **✓** — all six `service_role` only, `pg_catalog` pinned |
| 7 | `idx_unique_active_tenancy_per_house` dropped | **✓ gone** |
| 8 | Leaked Password Protection enabled | **✗ still disabled — and NOT APPLICABLE.** `signInWithOtp` (`src/services/auth.ts:19`) is the only auth call in the codebase; no `signUp`, no `signInWithPassword`. badige has no passwords, so this advisor warning protects nothing. **Do not re-raise it** unless password auth is added |

Advisor also flags `get_user_for_signin` / `restore_account` as anon-executable.
Both function bodies raise `unauthorized` when `auth.uid()` is null or
mismatched — **false positive, no action needed**.

**Second pass, 2026-07-19 — two gaps the first pass missed, both now closed** by
[`supabase/migrations/013_rls_close_remaining_gaps.sql`](supabase/migrations/013_rls_close_remaining_gaps.sql):

| Sev | Gap | Fix |
|---|---|---|
| Medium | `payments` UPDATE declared `USING` with no `WITH CHECK`, letting a landlord move a payment onto a different `tenancy_id` | `WITH CHECK` added, scoped `TO authenticated` |
| Medium | `payment_proofs` INSERT was **more permissive than its SELECT** — it checked only `uploaded_by = auth.uid()`, never that `payment_id` belonged to a tenancy the caller is party to, so any signed-in user could attach a proof row to any payment and pollute another landlord's ledger | INSERT now scoped through `payments → tenancy_agreements`, matching SELECT |

Plus the row-4 grant revokes described above.

**Verified live post-change (re-queried, not assumed):**
- `has_table_privilege` on both tables → all false **except** `fcm_tokens` /
  `authenticated` / `INSERT`, deliberately kept `true` (push-token registration
  upserts there — `src/services/notifications.ts:71`).
- `payments` UPDATE and `payment_proofs` INSERT → both `roles={authenticated}`
  with a non-null `with_check`.
- `SELECT count(*) FROM pg_policies WHERE qual='true' OR with_check='true'` →
  **0** across the whole `public` schema.

### Follow-ups spun out of this audit

- **Repo is missing 3 migration files that exist in the live DB's history:**
  `revoke_anon_graphql_exposure`, `revoke_authenticated_select_on_write_only_tables`,
  `fix_cross_party_rls_policies` (all `2026053113…`). The DB has them; the repo
  does not. Dump and commit them so the schema is reproducible.
- ~~**Migration 009 incomplete** — re-run the strip.~~ **Withdrawn 2026-07-19:
  re-running it is a no-op.** The 3 rows are test fixtures
  (`https://example.com/proof-…`, `https://storage.example.com/test-proof.jpg`)
  and never matched 009's `/storage/v1/object/(public|sign)/` pattern. Two real
  issues sit underneath it, both minor: **(a)** test fixtures are present in the
  production database, and **(b)** 009's `payment_proofs` statement targets a
  `media_url` column that does not exist on that table (the column is
  `proof_url`), so that statement has never done anything.
- **Phone numbers are stored inconsistently** — invitations hold bare 10-digit,
  `users` holds a mix of `+91…` (13), `91…` (12), `+1…`. Migration 012 works
  around it by comparing last-10-digits; normalise on write and drop the
  workaround. **A naive `phone_number = phone_number` join matches zero rows
  today** — do not write one.
- **`reminderService.ts` is broken** — inserts `message` into `notifications`,
  whose column is `body` (`NOT NULL`), and no migration ever renamed it. That
  path cannot succeed. Related to the P2 notification-subsystem decision below.
- **Invitation codes use `Math.random()`** (`src/services/tenancy/validation.ts:97`)
  — not cryptographically random, and the algorithm is now public. Swap for
  `crypto.getRandomValues`.
- ~~**Leaked Password Protection** — one dashboard toggle.~~ **Closed
  2026-07-19: not applicable.** badige is phone-OTP only (`signInWithOtp` is the
  sole auth call). There are no passwords for the feature to protect. Reopen
  only if password auth is ever added.

**Verification script kept:** [`docs/rls-audit.sql`](docs/rls-audit.sql) —
read-only, re-runnable, covers all 8 rows plus the `PUBLIC`-vs-`anon` revoke
trap (`REVOKE … FROM anon, authenticated` is a silent no-op when `PUBLIC` holds
the privilege; check with `has_table_privilege`, not by trusting the statement).

## P2 — Decide the fate of the notification / reminder subsystem (finish it or delete it)

**User's read (2026-07-18):** *"I don't think badige has any notifications or
reminders set up even though there might be partial code about it."* Very likely
correct — the pieces exist on paper but nothing appears to have ever fired.

**What exists on `master`:**
- `send-push-notification` and `send-rent-reminders` edge functions, deployed.
- Migration `010_notification_subsystem_phase1.sql` (schema only).
- Six `notify_*` trigger functions and a `notifications` table.
- Settings UI toggles (Payment Reminders / General / Marketing) that are
  **local React state only** — they read and write nothing.
- A design doc at `docs/system-design/notifications.md` and Phases 2–5 sketched
  in [`docs/HANDOVER.md`](docs/HANDOVER.md) item 12.

**Why it almost certainly never worked** — every external credential it needs is
still an open operator task in HANDOVER's own Critical list:
- FCM: `FCM_SERVICE_ACCOUNT_JSON` + `FCM_PROJECT_ID` never provisioned (item 2).
- Twilio: `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `PHONE_NUMBER` never set, and the
  daily cron job that drives `send-rent-reminders` was never scheduled (item 3).

**New wrinkle worth checking first (2026-07-18).** The project now runs on
**anon/publishable keys everywhere** — legacy JWTs are disabled and the secret
key is unused. But both edge functions are documented as authenticating via a
**service-role bearer** (or the `x-scheduler-secret` header). So either they are
already broken, or their auth gate is not what the docs claim. Establish which
before writing any more code — see the resolved RLS/security-state entry above.

**Further evidence it never worked (2026-07-19 audit).**
`src/services/reminderService.ts:93-95` inserts into `notifications` using a
`message` column — but the table's column is `body` and it is `NOT NULL`, and no
migration ever renamed it. That insert cannot succeed. Whichever way this
subsystem is decided, treat the existing client-side reminder path as dead code
rather than a working baseline.

**Decide, don't drift.** Half-built subsystems rot into false confidence — the
Settings toggles in particular imply to a user that reminders exist. Pick one:

- **(a) Finish it** — provision FCM + Twilio, schedule the cron, wire the
  Settings toggles to `user_settings.notification_categories`, then verify one
  real push and one real SMS end-to-end (AP#21: not shipped until it flows on a
  real device). This is Phases 2–5, roughly 5–6 days per HANDOVER's estimate,
  and it commits you to Twilio spend.
- **(b) Remove it** — drop the dead edge functions, triggers and schema, and
  **remove the Settings toggles** so the UI stops promising something that does
  not happen. Cheapest honest option. Keep the design doc as a record.

**Done when:** one of the two is chosen and executed, HANDOVER items 2, 3 and 12
are closed or deleted accordingly, and no UI control claims a capability the app
does not have.

## P2 — Make the unit-test gate (and inspect) required checks

Once green and stable, mark `Unit Tests` (and optionally the advisory
`Code Inspection`) as required status checks in branch protection so PRs can't
merge red. Flip the advisory inspect to blocking (`fail_on_error: true`) only
after an RN `.bp-config` profile is added (see the code-standards platform).

## P1 — Manual device tests pending (two flows fixed in code, never walked)

Both flows are wired and unit-tested, but no one has run them on a device, so
neither earns a ✓ in [`USER_PATHS.md`](USER_PATHS.md) (AP#1 — a feature is
done when the value reaches a real device; AP#3 — don't upgrade a row on
inference). Needs a landlord account and a tenant account on the same
property, and `USE_STUBS = false`.

### 1. Inline property creation from Invite Tenant (USER_PATHS **L5a**)

The path that regression log #19 showed was silently losing data in
production. Fixed on master in [#32](https://github.com/Tessellate-Studio/badige/pull/32);
guarded by `src/__tests__/importAliasConformance.test.ts`.

- [ ] Landlord → Invite Tenant → choose **create a property inline** (house
      number + optional nickname) rather than picking an existing one.
- [ ] Complete the invite; confirm the success state is real, not the local
      fallback — the old bug fabricated a local-only `House` with an
      `H<timestamp>` id and still reported success.
- [ ] **Confirm in Supabase** that a `houses` row exists with a real uuid and
      the right `landlord_id`. This is the assertion that matters; the UI
      looked correct while broken.
- [ ] Then set L5a to ✓ production with the date.

### 2. Tenant invitation-code acceptance (USER_PATHS **T9** / **E11**)

Wired via `dataProvider.acceptInvitation` → `tenancy/invitations.ts:189`.
E11 was stale (recorded as a "Coming Soon" modal that no longer exists,
corrected 2026-07-19), so this flow has never been verified end-to-end.

- [ ] Landlord generates an invitation code.
- [ ] Tenant with no active tenancy → Dashboard → **Enter Invitation Code**.
- [ ] Enter the code; confirm validation (6-char A-Z0-9) and that submission
      activates the tenancy and resets to the dashboard.
- [ ] Confirm the tenancy row flips to `active` with the right `tenant_id`.
- [ ] Check the reject path too: a wrong or expired code should show an error,
      not a dead button.
- [ ] Then set T9 and E11 to ✓ production with the date.

## P1 — Detox: verify Phase 1, then build Phase 2 — **pick up 2026-08-01**

> **STATUS 2026-08-01 — step 0 ran, and it FAILED. Phase 1 is blocked on a
> Kotlin version conflict; the wiring from PR #48 has been reverted.**
>
> Actions billing reset on the 1st (44 org minutes used), so the shared blocker
> below is **cleared**. Two things then happened:
>
> 1. The APK workflow was on a self-hosted `ci-light` runner that has no
>    `unzip`, so `setup-android` died before Gradle. Fixed by returning to
>    `ubuntu-latest` ([PR #58](https://github.com/Tessellate-Studio/badige/pull/58)).
> 2. With that cleared, `assembleRelease` reached Gradle and **failed at
>    `:detox:compileFullReleaseKotlin`** (run
>    [30709633723](https://github.com/Tessellate-Studio/badige/actions/runs/30709633723),
>    8m22s). Detox **20.47.0** — what `"detox": "^20.13.0"` resolves to today —
>    calls `IdlingResourcesName.entries`, the Kotlin **1.9** enum API. This
>    project pins `kotlinVersion = "1.8.0"` (`android/build.gradle:8`).
>
> So the answer to "did #48 break the release build?" is **yes** — `include
> ':detox'` is not test-scoped, and Gradle compiled the module during
> `assembleRelease`. Per the revert-first instruction below, the include and its
> paired `androidTestImplementation` are now commented out (regression log row
> 28). **The release pipeline is the priority and is restored; Detox is
> deferred.**
>
> **Phase 1 now has a prerequisite that did not exist when this was written:**
> reconcile Kotlin with Detox. Either bump to Kotlin 1.9+ — which cascades into
> AGP 8.1.1 and the deliberate `core-ktx` 1.13.0 pin (`android/build.gradle:24`)
> — or pin Detox back to a release that still compiles on 1.8.0, accepting an
> older runtime. **Decide that before re-enabling anything.** Step 1 below
> (`assembleDebug assembleAndroidTest`) cannot pass until it is resolved, since
> it compiles the same `:detox` Kotlin that just failed.

Scheduled 2026-07-22. **First action on the 1st: check whether GitHub Actions
billing is unblocked** — nothing below can start until it is. *(Resolved — see
the status note above.)*

### Where this was left

[PR #48](https://github.com/Tessellate-Studio/badige/pull/48) wired Detox into
the Android project: `:detox` included from `node_modules` in
`android/settings.gradle`, `testInstrumentationRunner` +
`androidTestImplementation(project(':detox'))` in `android/app/build.gradle`,
and `android/app/src/androidTest/java/com/tessellate/badige/DetoxTest.java`.
The dead iOS surface was removed at the same time.

**That wiring has never been compiled.** Gradle cannot run on the dev machine
(CLAUDE.md → cloud builds only) and the cloud build was blocked, so it is
**unverified plumbing** — do not record Phase 1 as done on the strength of the
diff (AP#3, AP#10).

### The order to do it in

1. **Verify Phase 1.** Trigger a cloud build and confirm it produces
   `app-debug-androidTest.apk` *with* Detox instrumentation. Diagnose failures
   from `gh run view <id> --log-failed`, never by reproducing locally. Likeliest
   failure points, in order: the `:detox` subproject resolving
   `com.facebook.react:react-android:0.73.0`; Kotlin sitting exactly on Detox's
   1.8.0 floor; manifest-merger conflicts from the androidTest variant.
2. **Then Phase 2** — the emulator workflow. Detail in
   [`docs/detox-integration-spec.md`](docs/detox-integration-spec.md), including
   two things already settled: it needs **no Metro step**
   (`react { debuggableVariants = [] }` bundles JS into debug builds), and it
   belongs in **its own workflow**, not `ci.yml`, because an emulator job is
   minutes-expensive.
3. Phase 3 (82 missing selectors, four stale specs, `e2e/` absent from
   `tsconfig`) is the long tail — do not start it before Phase 1 goes green, or
   it just deepens the false-coverage problem it exists to end.

**Done when:** `e2e/onboarding.e2e.ts` runs green in CI — which finally closes
the original ask behind regression log row 13, first-run onboarding covered
end-to-end on a real Android surface.

### Shared blocker — read before scheduling any of this

GitHub Actions has been refusing to start jobs: *"The job was not started
because recent account payments have failed or your spending limit needs to be
increased."* This is **not** a code problem and it is not confined to Detox:

- PRs [#42](https://github.com/Tessellate-Studio/badige/pull/42) and
  [#48](https://github.com/Tessellate-Studio/badige/pull/48) both merged/opened
  with **no CI run at all** — every gate on them was verified only on the dev
  machine.
- The `forge:build-feature` P2 immediately below carries the same blocker and
  the same 2026-08-01 target.
- The whole cloud-build rule in CLAUDE.md depends on Actions working.

Unblocking billing is therefore the single highest-leverage action on the 1st —
it gates three separate workstreams, and until it clears, "CI is green" cannot
be said about anything.

## P2 — Extend forge:build-feature skill to badige — target 2026-08-01

The `forge:build-feature` skill is wired to alate's EAS/OTA workflow
(`eas update --channel preview`, `adb exec-out screencap`). badige uses a
different stack and needs adaptation before the skill's device-verify loop
(Steps 3–4) works here.

**What differs from alate:**

| Concern | alate | badige |
|---------|-------|--------|
| JS delivery | EAS Update (OTA to preview channel) | Metro dev server (debug) or pre-built APK (release) |
| Native build | `eas build` (cloud) | `gh workflow run build-android-apk.yml` (cloud) |
| Install path | OTA double-relaunch | `adb install -r` from downloaded artifact |
| Device loop doc | `references/device-loop.md` | Does not exist yet |
| Working dir | `mobile/` | repo root |
| Token file | `constants/theme.ts` | `src/constants/index.ts` |

**What needs to happen:**

1. Write a `references/device-loop.md` for badige's build → download →
   `adb install -r` → screenshot cycle, including the `gh run download`
   commands and the double-install caveat for release APKs.
2. The skill hardcodes `mobile/` as the working dir and `constants/theme.ts`
   as the token file — either parameterise those in the skill or create a
   per-project config the skill reads.
3. Replace the OTA publish step (Step 3) with the cloud-build + artifact
   download flow. Wall-clock is much longer (~8 min vs ~30s), so the
   iteration loop changes shape — batch more changes per cycle.
4. Confirm `/design-system` works against badige's `COLORS`/`SPACING`/
   `TYPOGRAPHY`/`BORDER_RADIUS` structure (it may already — check).
5. Verify `adb` is available on the machine before the Aug 1 target (it
   was missing as of 2026-07-20).

**Blocked on:** GitHub Actions minutes (currently exhausted). Unblocks once
minutes are available or the billing cycle resets.

**Done when:** `forge:build-feature` can run end-to-end in the badige repo,
including the device-verify screenshot loop, without manual path overrides.

## ~~P3~~ RESOLVED 2026-07-21 — `describeStub` silent test skip fixed; 0 skipped

45 tests (including the entire `dataProvider.contract.spec.ts` suite) were
wrapped in `describeStub()`, which resolves to `describe.skip` when
`USE_STUBS = false` — the production default on master. CI runs with the
default, so those tests never executed in the gate. This is how a 6-arg
function called with 1 object survived for months.

**Chosen: option (b)** — mock the toggle inside the test. Option (a) was
rejected because it needs `USE_STUBS` to become env-driven, which puts a
"ship stub data to production" failure mode into production code to serve a
test, and costs a second CI job.

Option (b) also had a precedent already in the repo:
[`dataProvider.realpath.spec.ts:16`](src/services/__tests__/dataProvider.realpath.spec.ts)
pins the toggle to `false` the same way. The two stub suites now pin it to
`true`, so all three run in every gate and `_shared.ts` keeps `false` as the
honest production default.

Each suite also asserts the pin (`it('runs in stub mode')`). Without it, a
mock that stopped applying — module moved, path renamed — would send every
test down the real Supabase path and fail obscurely instead of naming the cause.

**Result:** `npm run test:unit` went from **123 passed / 45 skipped** to
**170 passed / 0 skipped**, 21/21 suites. `describeStub` no longer exists in
the codebase. Regression log row 27.

## P3 — Adopt the platform planning docs

badige onboarded to the forge plugin but lacks the rest of the platform's
planning-doc stack. `RELEASE` status + `WEEKLY_DIGEST` (via the roadmap-pulse
skill) would bring it in line with alate. Low urgency.
