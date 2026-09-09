---
name: device-test
description: Drains the per-repo "Device test queue" GitHub issues across every Tessellate app with a queue — the three mobile apps (alate, mood-layer, badige) plus loom, whose items are browser-verified rather than adb-driven — AGENT-FIRST, and always runs its actual work in a cost-controlled model:sonnet subagent regardless of the invoking session's model. That subagent IS the drain and never delegates further: it executes every adb-automatable step itself (launch, taps, text entry, screenshots, logcat) and verifies Expect from what it captures; the human is pulled in only for steps marked HUMAN: (gesture feel, camera/biometrics, real accounts, iOS). Sessions enqueue tests per forge standards/workflows.md → "Device-test queue"; this skill fetches every OPEN item, verifies the right build/OTA is on the connected device per app, runs or walks every step of each test and records a per-step outcome (a failed step never skips the independent ones; a step nobody ran reads as not run), and closes items by editing their Status line — filing failures instead of fixing mid-drain, and spinning up a tracked chip for every failure it files so the bug is chased to completion instead of accumulating as an unowned issue (later drains re-check each `❌ failed` item and re-spawn a dead chip). Items that need a fresh native build (no OTA can reach them) get logged as `🔧 needs build` instead of tested — OTA-deliverable changes always test immediately, ad hoc or scheduled, never gated by a build cadence. Self-schedules a daily drain (9am local by default) that skips needs-build items, plus a separate weekly task that dispatches builds only for apps with a needs-build backlog (the one standing exception to the no-automatic-builds CI-spend rule). Use whenever the user asks to "drain the device test queue", "run device tests", "what needs testing on my phone", "device test session", passively "anything waiting on my phone?" — or on a schedule/idle moment whenever a device is adb-connected: agent-only items need no invitation. Empty queues everywhere is a valid, quiet result. Output is a wrap-up table: passed / failed→filed / needs-build→unblock / needs-human, with what unblocks each.
---

# Device test drain

Sessions across four app repos ship changes that need a real phone — or, for
loom, a real browser — to verify.
Most of those steps an agent can drive itself over adb; only judgment calls and
human-only surfaces (gesture feel, camera, real accounts, iOS) need the user —
and the queue format marks exactly those with `HUMAN:`. Each shipping session
enqueues a test item (the enqueue rule and the fixed comment format live in
[`standards/workflows.md` → "Device-test queue"](../../standards/workflows.md)
— single home; this skill never restates it). This skill is the other half:
one sitting, phone in hand, every pending item across every app, no prompting
per item.

**Just checking what's pending?** Don't spawn an agent to poll the threads —
run `dtq` (or `device-test-status`, same tool) from anywhere with `gh`
authenticated: `npx github:Tessellate-Studio/forge dtq`, or `dtq` directly if
forge is installed globally (`npm install -g github:Tessellate-Studio/forge`).
It's read-only: fetches the same issues/comments this skill drains, parses the
fixed format below, and prints a table — open items, which need a human vs.
are agent-runnable, failures with their filed link, and item age. `--watch`
auto-refreshes, `--repo <name>` scopes to one app, `--json` for scripting. See
`skills/device-test/scripts/status-board.js`.

**Prefer clicking to typing?** `skills/device-test/scripts/dtq-board.cmd` is a
double-clickable launcher for the same board (Windows opens a bare `.js`
through Windows Script Host, which cannot run it — that's the "Invalid
character" dialog). Double-click gives the live `--watch` board; from a shell
it passes flags through (`dtq-board.cmd --repo alate --all`). It resolves the
script relative to itself, so a desktop shortcut to it keeps working after a
re-clone — no PATH entry and no PowerShell execution-policy exemption needed.

This also runs automatically: `hooks/device-test-status.mjs` (a SessionStart
hook, registered in `hooks/hooks.json`) checks the same queues at the start of
every session and surfaces a one-line summary when anything is open, failed,
or malformed — silent when every queue is empty, same as this skill's own
"quiet is a valid result" rule. Off switch: `FORGE_DEVICE_TEST_STATUS_DISABLE=1`.

## Model — always a cost-controlled subagent

**Read this section against who you are.** It has exactly two audiences and
opposite instructions for each: the **launching session**, which spawns one
subagent and does nothing else, and the **subagent**, which does the whole
drain and spawns nothing. If a `model: "sonnet"` agent is already running this
file, you are the second one — skip to "you ARE the drain", below. The next
paragraph is addressed to the launcher only, and following it from inside the
agent produces the nested-agent failure this section exists to prevent.

Draining is high tool-call-volume, low-reasoning work: screenshots, taps,
`adb` round-trips, Status-line edits. None of that benefits from a frontier
model, and running it inline would silently bill whatever model the invoking
session happens to be on for every one of those round-trips — expensive if
that session is on a premium model, and the same waste again on every
self-scheduled run (below) if left unpinned. **This skill's entire workflow
(Steps 0-4) MUST execute inside a single subagent spawned via the Agent tool
with `model: "sonnet"`** — never inline in the invoking session, regardless of
what model that session is using. Spawn it with a self-contained prompt
covering the full drain (this file's content is the prompt), `agentType:
"general-purpose"` (needs Bash for `adb`/`gh`, Read for screenshots), and
relay its final wrap-up table back verbatim as this skill's own output. The
one exception is the **read-only** `dtq` check ("just checking what's
pending?" above) — that's a single CLI invocation, not a drain, and doesn't
need a subagent at all.

**If you are reading this from inside that subagent, you ARE the drain — do
not delegate again.** The rule above is satisfied by your own existence: the
moment this file is being read inside a `model: "sonnet"` agent, "must execute
in a subagent" is already true, and spawning another agent satisfies nothing —
it only adds a layer. The agent executing Steps 0-4 runs **every** `adb`, `gh`,
screenshot and Status-line edit itself, and **must not call the Agent tool at
all**: not to "delegate the taps", not to fan out one agent per app, not to
hand off a single item. The one permitted exception is
`mcp__ccd_session__spawn_task` (Step 3 case 3), which queues a *follow-up*
session for later and does not perform any of this drain's work now.

Why this is a hard rule and not a preference: a nested agent is **invisible to
the session that launched the drain**. Its parent's completion notification
fires when the child stops, while the grandchild is still driving the phone —
which is exactly how two sessions ended up on the same handset on 2026-09-07
(see the launch check below). A re-delegating agent also tends to return a
confident summary of work it never did, because it summarises the delegation
rather than the device.

## Before you spawn a drain — re-read the claims, right then

Step 0.4 has the agent read the device claims once it is *running*. That is not
sufficient on its own, because the launching session decides to spawn some
seconds earlier, and a drain that has been spawned but has not claimed yet is
invisible everywhere you would think to look. So immediately before the Agent
call — not at the top of the turn, not "we checked a few minutes ago" — fetch
the claim comments on the queue issues of every app the drain will touch on
the device (alate, mood-layer, badige; loom carries no claim because it never
uses adb) and read them fresh. Paginate the fetch, per Step 0.2 — a claim is a
comment like any other, and on a long queue it is one of the newest, which is
exactly what an unpaginated read drops. Two rules follow from how this failed:

- **A completion notification is NOT evidence that a drain stopped.** "No live
  background children" describes the agent you spawned, not its descendants.
  On 2026-09-07 a drain subagent re-delegated (the rule above); the parent read
  the child's completion, checked the claims on alate#562, saw all three
  reading `RELEASED`, concluded nothing was running, and launched a
  replacement drain. The grandchild had simply not claimed yet — it claimed
  **16 seconds before** the replacement session did. Both then drove device
  `804KPSL1724518` through alate's body-profile mutate/restore flow, and the
  user's real saved body profile was wiped to fresh onboarding, recoverable
  only by a manual account sign-in. Both sessions had recorded correct
  snapshot and restore steps; both believed they had restored correctly. The
  interleaving destroyed it anyway. **Verify against the claim comments, never
  against the notification.**
- **A claim that appears seconds after you spawn means you are the newcomer —
  stand down.** If a `HELD` claim shows up on any queue issue between your
  pre-spawn read and your agent's own Step 0.4 read, someone else got there
  first, however small the gap. Stop the agent, release anything you posted,
  and report who holds the device. Do not race it, and do not reason that two
  claims seconds apart are effectively simultaneous — a 16-second gap is
  precisely what the collision above was made of. Whoever's claim is
  **earlier** holds the phone; the later one yields, every time.

## Self-scheduled automation — daily drain, weekly build

Two standing scheduled tasks (via the scheduled-tasks MCP, registered once and
left running — see `mcp__scheduled-tasks__list_scheduled_tasks` to check they
still exist) keep the queue moving without a manual trigger:

- **`device-test-daily-drain`**, every morning (9:00 AM local unless the user
  picked otherwise) — runs this skill's full workflow, with one restriction:
  **skip any item whose Status is already `🔧 needs build`** (Step 1, below) —
  re-checking those daily is wasted API calls when only a fresh build changes
  the answer. Every other OPEN item, including every OTA-deliverable one,
  tests immediately — OTA items are NEVER gated by the weekly build cycle, only
  native-build-blocked ones are. Silent when nothing was pending or nothing
  changed, per this skill's own "quiet is correct" rule — a scheduled task
  that pings every morning regardless of outcome is a nuisance, not a signal.
- **`device-test-weekly-build`**, once a week — does NOT run this skill's
  drain workflow. It only checks each app's queue for comments marked `🔧
  needs build`; for any app with at least one, it dispatches that app's build
  workflow (`workflow_dispatch` via `gh workflow run`, discovered per-repo with
  `gh workflow list` rather than hardcoded — build workflow names drift), logs
  the dispatch on the affected item(s), and for sideload-friendly apps
  (mood-layer, badige — see the Scope table) auto-installs the finished
  artifact on a connected device via `adb install -r`, flipping the item back
  to plain `OPEN` so the next daily drain picks it up. For Play-Store apps
  (alate), a fresh CI build still can't be sideloaded onto a Play-installed
  copy (Play App Signing — see alate regression history, e.g. issue #596); the
  weekly task notes the build is ready and needs Play Console promotion, a
  step that stays the user's per the manual-runbook rule. **This task never
  fires when no app has a `🔧 needs build` item** — see `standards/workflows.md`
  → "CI spend" for why this is the one standing exception to "no build without
  a human click," and the guardrails that keep it from becoming an
  unconditional timer.

Both tasks' prompts just need to say "run the forge:device-test skill" (daily)
or describe the narrower weekly check above — the actual logic lives here, in
one place, not duplicated into the scheduled-task prompts themselves.

## Scope table — the apps and how a change reaches each surface

Every path below is absolute and literal. **A spawned fix-session gets its
`cwd` from this table** (Step 3 case 3), so a wrong path silently lands that
session in a directory that does not exist — the table used to say
`Documents/Tessellate/apps/<app>`, which has never existed on this machine.

| App | Remote | Local checkout | Delivery today | Queue |
|---|---|---|---|---|
| alate | `Tessellate-Studio/alate` | `C:\Users\SAPTAMI\OneDrive\Apps\Tessellate\apps\alate` | Play internal testing + TestFlight; JS fixes as **production-channel OTAs** (from master only) | issue labelled `device-test-queue` |
| The Mood Layer | `Tessellate-Studio/mood-layer` | `C:\Users\SAPTAMI\OneDrive\Apps\Tessellate\apps\mood-layer` | **Expo Go / local dev server** — no store presence | issue labelled `device-test-queue` |
| badige | `Tessellate-Studio/badige` | `C:\Users\SAPTAMI\OneDrive\Apps\Tessellate\apps\badige` | **APK sideload / dev build** — no store presence | issue labelled `device-test-queue` |
| loom (Alate for Brands) | `Tessellate-Studio/loom` | `C:\Users\SAPTAMI\OneDrive\Apps\Tessellate\apps\loom` | **Shopify app + theme app extension** — `shopify app deploy` from `main`; nothing installs on a phone | issue labelled `device-test-queue` ([#88](https://github.com/Tessellate-Studio/loom/issues/88)) |

forge itself is **not** under `apps/` — it lives at
`C:\Users\SAPTAMI\OneDrive\Apps\Tessellate\tools\forge`. Use that when a chip
is spawned against this repo rather than an app.

**When an app gains store presence, edit only its Delivery cell here** (one
forge PR, version bump included). Queue items are delivery-agnostic — nothing
enqueued needs rewriting when the delivery path changes. The `REPOS` constant
in `skills/device-test/scripts/queue-lib.js` mirrors this table (it is what
`dtq` and the SessionStart hook read) — **a repo added here must be added
there in the same PR**, or the queue is drainable but invisible on the board.

### loom is in scope, and it is verified in a browser

loom carries a `device-test-queue` label and an open queue issue
([loom#88](https://github.com/Tessellate-Studio/loom/issues/88)) with real
enqueued items, and drains have already been working it. The previous
"out of scope: loom is a Shopify web app" line contradicted that, and the cost
of leaving the contradiction standing is a labelled queue quietly accumulating
items that no drain is accountable for. It is in scope. A loom item differs
from a phone item in exactly three ways:

- **No adb, so no device claim.** loom items never touch the handset — run
  them without claiming, and never let a live device claim held by another
  session block them. If *you* are holding the device for another app, keep
  the claim and note that this item was off-device.
- **The browser is the harness.** Use the in-app browser tools
  (`mcp__Claude_Browser__*`) exactly the way Step 3 uses `adb`: `navigate`,
  `read_page` / `get_page_text` to assert on structure and copy, screenshots
  for the wrap-up, and judge **Expect** from what you captured.
  `read_console_messages` and `read_network_requests` are loom's logcat — an
  item whose Expect says "no console errors" is verified there, not by
  eyeballing the page. Back-end pre-reqs stated in an item (e.g. a
  `size-finder` status `curl`) are agent-runnable and should be checked before
  anything else, since a failing one explains every downstream step.
- **Delivery is `shopify app deploy` from `main`** — not an OTA, not a store
  build. Extension assets do **not** ship on merge, so Step 2's "verify
  delivery before walking items" still applies in full: confirm the deployed
  extension version is the one under test before recording any verdict. No CI
  workflow performs that deploy, so an item blocked on it is
  `🔧 needs build — shopify app deploy from loom main`, and the unblock stays
  the user's per the manual-runbook rule. The weekly build task does not cover
  loom for the same reason: there is nothing to `workflow_dispatch`.

`HUMAN:` works identically here, and loom items lean on it harder — the
dev-store storefront password, physical QR scans and real-account flows are
all human-held. An item that is `HUMAN:`-gated at step 1 blocks everything
after it; say so and leave it OPEN rather than reporting the whole item as
untested for no stated reason.

## Workflow

### Step 0 — Preflight

1. **Phone connected?** `adb devices` — if no device and the user didn't say
   the phone is nearby, say what's needed and stop **for the phone apps**.
   iOS-only items can still proceed (TestFlight, no adb) — flag that
   screenshots will be the user's job — and so can every **loom** item, which
   never uses adb at all (Scope table → "loom is in scope"). No phone is a
   reason to skip alate/mood-layer/badige, not a reason to end the drain.
2. **List every queue — one call per repo.** Tests are issues now, so the
   whole fetch is a label filter:
   ```bash
   gh api "repos/Tessellate-Studio/<repo>/issues?labels=device-test&state=all&per_page=100" \
     --paginate --jq '.[] | select(.pull_request | not) | {number, title, state, state_reason, labels: [.labels[].name]}'
   ```
   Three ways this lies if you get it wrong, all of which make a busy queue
   look empty rather than erroring:
   - **Without `--paginate` you get only the first 100**, and the ones you
     lose are the newest — exactly what a drain needs. `queue-lib.js` already
     paginates; it is hand-rolled `gh api` calls inside a session that forget.
   - **`gh api`, not `gh issue list --json`** — the latter fails outright on
     gh 2.98.0 ("invalid character '{' after object key") for every field
     combination, taking the whole fetch down.
   - **An empty response is not an empty queue.** `gh` can return nothing
     without failing; reading that as `[]` printed `alate  nothing pending`
     while alate held 17 open tests (2026-09-09). `queue-lib.parseGh` refuses
     an empty body — do the same in any hand-rolled call.

   A test is pending iff its issue is **open**. `needs-human`, `needs-build`,
   `parked` and `failed` say which kind; the label table lives in
   [`workflows.md` → "Device-test queue"](../../standards/workflows.md).
   Prefer `dtq` over hand-rolled calls — it reads both media during the
   migration and you will otherwise miss whichever half you did not query.

3. **Repair what the board flags — do not just report it.** There is no
   format drift left to repair: state is the issue's own, so a `**Status:**`
   line cannot contradict a glyph, and no id needs stamping. Two things still
   reach a human:
   - **An open `device-test` issue missing its body fields** (no Verifies, no
     Steps, no Expect) → ask the PR it came from and fill them in, or close it
     `not_planned` saying why. It is one row on the board reading "missing
     fields", not a parse failure.
   - **Two tests stacked in one issue body** → split them, one issue per test.
     `dtq` counts the `### <glyph>` headings in a body and says how many are
     hidden behind the one it is showing; a stacked test has no row of its
     own, so nothing runs it, closes it, or notices it is missing.

   Say what was repaired in the wrap-up.
4. **Claim the device before touching it.** The queue issue carries the lock —
   format and semantics in
   [`standards/workflows.md` → "Claiming the device"](../../standards/workflows.md).
   Read the claims first:
   - **Held by another session and still alive** → do NOT drive the device.
     Say who holds it, when it last touched the phone, and what it's waiting
     on; then stop **the device half of the drain**. Fetching, reading,
     reporting and every **loom** item are still fine — those never touch the
     handset; `adb` is what's off-limits. A claim is alive whenever it was
     touched inside the last 30 minutes,
     **however long ago it was taken** — a three-hour job that is still
     working holds the phone — and a claim marked `**Waiting on:** human`
     is alive indefinitely.
   - **Free, released, or silent past the window** → post your own claim
     comment naming your session and the `adb` serial, then proceed. If you
     took over a silent claim, say so in yours.
   - **Someone claimed between the launch check and now → you are the
     newcomer; stand down.** The session that spawned you re-read the claims
     immediately before spawning ("Before you spawn a drain", above). If a
     `HELD` claim exists now that was not there then — or one appears with a
     `**Claimed at:**` earlier than yours — the other session got there first
     even if the gap is seconds. Release your claim, don't touch `adb`, and
     report who holds it. The earlier `**Claimed at:**` wins; ties do not
     get split by optimism.
   - **`RELEASED` on every claim does not prove nobody is running.** It proves
     nobody has claimed *yet*. A drain that was spawned moments ago has not
     posted its claim, and a completion notification about a parent agent says
     nothing about a descendant still driving the phone. Treat an all-released
     issue as "free right now", claim it, then **re-read the claims once more
     after posting yours** — if a second claim landed alongside it, apply the
     rule above rather than proceeding.

   **Then keep the heartbeat up.** Rewrite `**Last touch:**` on your claim
   every time you drive the device — piggyback it on the PATCHes you're
   already making per item, not as a separate timer. Before handing the phone
   to a human, set `**Waiting on:** human — <what you asked for>`, and clear
   it back to `—` when you resume. Silence is the only thing that releases a
   claim you didn't close yourself.

   One claim per device, and it is advisory — nothing stops a raw `adb`
   command. It exists because two sessions drove the same handset on
   2026-09-01 and the collision could only be reconstructed afterwards by one
   session messaging the other. Every session commits under the same GitHub
   account, so the byline never reveals who is on the phone.

   It happened again on **2026-09-07**, with the lock in place, because the
   lock was only ever read from *here* — inside the agent, after it started.
   A nested drain that had not claimed yet was indistinguishable from no drain
   at all, a replacement was launched into the gap, and the two sessions
   interleaved through alate's body-profile mutate/restore flow and destroyed
   the user's real saved profile. Each had snapshotted and restored correctly
   on its own. That is why the check now also runs on the **launch** path
   ("Before you spawn a drain", above) and why re-delegation is banned: a
   claim can only protect a window it is inside.
5. **A device claim is not a work claim.** 🔒 locks the handset; 🚧 says who
   owns a piece of work
   ([`standards/workflows.md` → "Work claims"](../../standards/workflows.md)).
   The drain takes 🔒 and needs nothing else to walk the queue — but the moment
   it stops draining and starts *fixing* a tracked issue or PR, that item gets
   its own `wip claim <repo>#<n>`, released when the fix is handed off. A drain
   that files a failure is still draining; a drain that opens a fix PR is
   working an item someone else could pick up.
6. **All queues empty → say so and stop.** Quiet is a correct result — don't
   invent work. Close your claim before stopping (Step 4).

### Step 1 — Split the work: agent items, human items, and build-blocked items

Classify every item by Status first, then (for OPEN ones) by Steps:

- **Already `❌ failed`** — a previous drain filed this one. It is open work,
  not a closed item, so it gets re-checked every drain: read the linked issue
  (`gh issue view`). **Closed** → re-run the item now; if it passes, flip it
  to `✅ done` and minimize it, which is the only thing that actually retires
  a failure. **Still open** → check whether its recorded `task_id` chip is
  still live (`mcp__ccd_session__dismiss_task` reports an already-started or
  dismissed task); if the chip is gone and the bug is not fixed, **spawn a
  fresh one** (Step 3 case 3) and record the new id. Either way, carry it into
  the wrap-up with the issue link and its age — a failure that has been open
  across several drains is worth saying out loud, not quietly re-listing.
- **Already `🔧 needs build`** — a previous drain already determined this item
  can't be reached by any OTA and the installed build predates it. On a
  **daily** run, skip these entirely (see "Self-scheduled automation" above —
  that's the whole point of the marker). On an **ad hoc** run (the user
  explicitly asked right now), it's fine to give Step 2's version check one
  more cheap look in case a human already installed a newer build since the
  marker was written — if it's now satisfiable, drop back to OPEN and treat it
  like any other item this run; if still blocked, leave it exactly as-is
  (don't rewrite a comment that's still accurate).
- **OPEN, agent-runnable** (no `HUMAN:` prefix anywhere — every step is
  adb-executable, or browser-executable on loom): **just run them (Step 2 →
  3), no question asked.** This is the self-maintenance path — the user should
  not be consulted about tests an agent can execute and judge from a
  screenshot/logcat (or a page read and its console).
- **OPEN, needs-human** (at least one `HUMAN:` step): present one short table —
  app · item · the specific `HUMAN:` steps · Needs runtime · testable-now
  verdict — and walk them with the user if they're present. If the user isn't
  in the loop right now (including every automated daily/weekly run — there is
  never a human present for those), leave those items OPEN, report them in the
  wrap-up, and still run all their non-HUMAN steps as a smoke pass (a crash on
  launch shouldn't wait for a human sitting to be discovered).

Order apps alate → mood-layer → badige → loom. loom last because it needs no
device: if the phone disconnects or a claim is lost mid-drain, its items are
still runnable, and putting them at the end means that failure costs nothing.

### Step 2 — Per app: verify delivery BEFORE walking items

Measuring against a stale build is worse than not testing — every verdict
would be about the previous bundle. This applies to loom's browser surface
exactly as it does to a phone: a storefront page renders whatever extension
version was last deployed, and it looks identical whether or not the change
under test is in it. Per app, before its first item:

**alate**
1. Installed build: `adb shell dumpsys package com.tessellate.alate | grep -E "versionCode|versionName"`.
2. Compare against each item's **Needs runtime**. Item needs a newer tag build
   than installed AND isn't reachable by any OTA → **needs build** (Step 3
   case 4, below): write `🔧 needs build` on the item now, don't wait until
   Step 3 to decide — tell the user which build would unblock it (Play
   internal / `gh run download` + `adb install`) in the wrap-up. Never trigger
   a heavy build yourself from inside a drain — that's the separate weekly
   scheduled task's job (see "Self-scheduled automation"), not this loop's.
3. OTA-delivered items: confirm the update published to the production channel
   (`eas update:list --branch production --limit 3` from `mobile/`), then
   force-stop → relaunch → force-stop → relaunch (expo-updates applies on
   second launch), then — **MANDATORY, not a fallback** — confirm via logcat
   that the RUNNING bundle is that exact update group and no
   `UpdateFailedToLoad`/`CheckError` fired (gate + commands:
   `build-feature/references/device-loop.md` → "MANDATORY before measuring").
   A verdict recorded without that confirmation is void — alate #596 proved
   an entire class of binaries silently could not receive ANY OTA, and every
   unconfirmed "verified on device" in that window measured stale JS.
   Runtime mismatch (installed build's runtime vs the update's — both
   platforms use `expo.version` under the appVersion policy since alate
   v1.3.1) → **needs build** — under this policy the OTA existing doesn't
   help; only a new binary bumps `expo.version`. Write `🔧 needs build` same
   as case 2. Never generalize an iOS delivery pass to Android or vice versa —
   the lanes are independent and have diverged for months.

**mood-layer** — start the dev server (`npx expo start` in the checkout), user
opens in Expo Go. Confirm the loaded JS is current (Metro logs show the
connection) before the first item. There's no native-build gate here (no store
presence) — a `needs build` item on this app means the dev server itself is
stale against the item's SHA, not a heavy CI build.

**badige** — check the installed package (`adb shell dumpsys package | grep -i
badige` or its known package id); if the item's SHA is newer than the
installed APK → **needs build**: write `🔧 needs build — <SHA/workflow that'd
unblock it>` now, same as alate case 2/3. Don't dispatch the APK workflow
yourself from inside a drain (see Step 2's alate note); the weekly scheduled
task handles it, or the user can locate an existing artifact with `gh run
list` and `adb install -r` it themselves before the next daily drain.

**loom** — no install to check; what can be stale is the **deployed extension
version**. The item's PR being merged proves nothing, because extension assets
ship on `shopify app deploy` from `main`, not on merge, and no CI workflow
runs it (`gh api repos/Tessellate-Studio/loom/actions/workflows` lists only
CI, Deploy, No user data, Ops watchdog and Dependabot; `Deploy` ships
`loom-api` and `shopify_admin` to Vercel and never touches the extension). So:
run any backend pre-req the item states (a `curl` against the alate backend is
agent-runnable — do it first, a failing one explains everything downstream),
then establish that the deployed extension carries the change. If you cannot
establish it from anything the repo records, do **not** record a pass —
`🔧 needs build — shopify app deploy from loom main (confirm in Partner
Dashboard → extension version history)` and name it in the wrap-up. The
weekly build task doesn't cover loom: there is no workflow to dispatch, so
the unblock is the user's.

### Step 3 — Execute the items, agent-first

For each OPEN item on the current app:

1. **Execute every non-`HUMAN:` step yourself** — yourself, not via another
   agent (see "Model"): `adb shell am force-stop` /
   `monkey -p <pkg> 1` or `am start` to launch, `adb shell input tap/swipe/
   text/keyevent` for interaction, `adb exec-out screencap -p` after each
   meaningful step, `adb logcat` filtered on the app for errors. Judge
   **Expect** from the captured screenshot/logcat — Read the PNG, state the
   verdict with what you saw, keep the final screenshot for the wrap-up.
   Coordinates: take a screenshot first and derive tap targets from it rather
   than guessing; if a target can't be located confidently after two
   attempts, downgrade the item to needs-human with a note — never close on
   a guessed tap.
   On **loom** the same paragraph applies with the browser tools substituted
   for `adb` — `navigate` / `read_page` / screenshots to drive and capture,
   `read_console_messages` and `read_network_requests` for errors (Scope table
   → "loom is in scope"). No claim, no version check against an install.

   For `HUMAN:` steps (and only those), hand the phone to the user with the
   step + Expect verbatim (set `**Waiting on:** human — <what>` on your claim
   first); you keep watching logcat/screenshots around their action.

   **Every step gets its own verdict; a failed step does not end the item.**
   Steps are independent probes of the same PR unless the item says
   otherwise, so after a step fails, run the next one and record what *it*
   did. Stop early only when a step is genuinely **blocked** — the screen
   can't be reached, the app won't launch, the build is wrong — and then
   write the remaining steps down as `⏭ NOT RUN — blocked by step N`, never
   leave them silent. A step prefixed `DEPENDS: step N` (the standard's
   ordering marker; absent it, steps are independent) is skipped only when
   step N failed, as `⏭ NOT RUN — depends on step N`. A `HUMAN:` step with
   nobody to hand the phone to is `⏭ NOT RUN — needs human`; a step that
   cannot exist on this platform is `⛔ N/A — <why, and where it can run>`.

   Record the outcomes as a per-step table in the note (format and the
   Status-line rule: standard → "Every step gets its own verdict"), not as
   one word for the whole item. A step nobody ran must read as *not run* —
   a reader who sees only `❌ failed → #694` on a five-step item assumes all
   five were tested. *Precedent: alate #562 item 5526181662 — step 1 failed,
   the drain stopped "rather than compound on a failed precondition", and
   step 2 (a swipe) would have hard-crashed the app: every sift swipe had
   killed it since PR #670 shipped four days earlier, and that queue item
   was the only scheduled thing that would ever swipe that screen
   (forge #100).*

   **A crash seen mid-drain is its own finding, filed the moment you see
   it** — even if it surfaced on a step that wasn't under test, or on an
   item that had already failed. "No mid-drain fixes" is about not *fixing*;
   it has never been about not *looking*. File it (regression-log row or
   issue, per the app's rules), link it from the per-step table, and carry
   on with the remaining steps if the app relaunches.

   **A verdict is an issue operation now, not a Status edit.** Tick each
   step's checkbox as you RUN it, pass or fail — a step nobody reached stays
   unticked and reads as *not run* without anyone writing prose about it. Then
   close or label per the table below. There is no Status line and no heading
   glyph to keep in sync, which is the whole reason this medium replaced
   comments.

   **Anything you observed that a label cannot carry goes in a comment on that
   issue** — why it could not run, a pre-req still missing, a PR/SHA
   correction. Ordinary comments, in reading order; no rule, no boundary.
2. **Pass** (every step ✅, or ⛔ N/A with a named home — a ⏭ NOT RUN row is
   not a pass; the issue stays open with the unticked boxes saying what is
   left) → close it as completed:
   ```bash
   gh issue close <n> -R Tessellate-Studio/<repo> --reason completed \
     --comment "<what ran, on which build, and what you saw>"
   ```
   Nothing to minimize: a closed issue is already out of the default view,
   which is what the minimize dance existed to fake.
3. **Fail** (any step ❌, whatever the others did) → capture what was seen
   (screenshot/logcat; the user's words for a `HUMAN:` step), file it where
   the app's rules say — regression-log row via PR, or a GitHub issue — and
   **label the test `failed`, leaving it OPEN**, with a comment linking the
   bug:
   ```bash
   gh issue edit <n> -R Tessellate-Studio/<repo> --add-label failed
   ```
   **A failure is open work, not a closed run.** The test is retired only when
   a later drain re-runs it after the fix lands and it passes — which is why
   it must not be closed here. Every drain re-checks open `failed` tests for
   exactly this reason. **Do not fix mid-drain**: the sitting stays short; the
   fix is its own session with its own branch.

   **Then spin up a chip for it — filing is not tracking.** An issue with
   nobody on it is a note, not a fix, and a queue that only accumulates
   filed-and-forgotten failures has stopped self-healing. So every failure
   this skill files ALSO gets a background task chip, in the same breath as
   the issue, via the session-management `spawn_task` tool
   (`mcp__ccd_session__spawn_task`):
   - `title` — imperative, under 60 chars, naming the app and the symptom
     ("Fix alate#694 fit sheet opens expanded").
   - `cwd` — that app's local checkout from the Scope table, **copied
     verbatim**, so the spawned session lands in the right repo rather than
     wherever the drain ran. These are absolute Windows paths under
     `...\Tessellate\apps\`; don't reconstruct one from memory or from the
     repo name — a `cwd` that doesn't exist strands the chip silently.
   - `prompt` — self-contained, because that session sees none of this one:
     the filed issue to read first, the device serial and installed build,
     what was observed **verbatim** (which entry points reproduced it, how
     many times, and what was NOT reached), the suggested starting point, an
     instruction to fix it via `forge:build-feature` so the result is
     device-verified rather than eyeballed, and a closing instruction to flip
     this queue item's Status line + heading glyph and close the issue once
     it verifies.
   **Record the returned `task_id` on the queue item**, in the note under the
   `---` rule, beside the issue link. An unrecorded chip is indistinguishable
   from one that was never spawned, so without it the next drain cannot tell
   whether the failure is being worked or has simply been sitting.
4. **Needs build** (Step 2 verdict — no OTA can reach it and the installed
   build predates it) → set `**Status:** 🔧 needs build — <what's needed>`
   (e.g. "next tag ≥ v1.3.2", "next EAS/APK build off master") — this is the
   durable log the weekly build task reads (see "Self-scheduled automation"
   and `standards/workflows.md` → "Device-test queue"). Report the exact
   unblock in the wrap-up too ("install the v1.2.2 internal-track build") for
   whoever's reading right now, but the Status line is what makes it survive
   past this session. Stays un-minimized — it's open work, not a closed item.

### Step 4 — Wrap up

**Close the device claim FIRST**, before writing anything up — two actions on
the claim comment you posted in Step 0 (nothing to close if this was a
loom-only sitting and you never claimed):

1. edit it so `**Claim:**` reads `RELEASED`;
2. **minimize it as Resolved** (the same GraphQL `minimizeComment` call used
   for a passed item), so it collapses out of the thread instead of sitting
   there looking live.

Do this even when the drain failed, stopped early, or found nothing. Closing
the claim is the signal that the phone is free — nothing else is. The
no-touch window only covers a session that *crashed*; a session that finished
and left its claim standing has told everyone else the device is busy.

One table: item · app · verdict (✅ agent-verified, with screenshot / ✅ human-
confirmed / ❌ → filed link + chip `task_id` (or "chip re-spawned", or how
many drains it has been open) / 🔧 needs build → what would unblock it / 🙋
needs-human → the specific `HUMAN:` steps waiting). Identify each item by its
test ID (the comment id) so the user can jump straight to it.
Then, per the user's communication style: what they need to do (installs,
promotions), what got filed for follow-up sessions. If any repo's queue issue
had drifted from the format, say what you REPAIRED (Step 0.3) — and list only
the ones you genuinely could not classify, with their URL and what's missing.
"N comments don't match the format" with nothing done about them is not an
acceptable wrap-up line. **A daily automated run only speaks up if this table has at
least one non-empty row** (something tested, failed, newly logged as
needs-build, or a failure whose chip had to be re-spawned) — an empty drain
stays silent per the "quiet is correct" rule,
same as the SessionStart hook.

## What this skill does NOT do

- **No store-console actions** — promoting Play tracks, TestFlight review,
  anything in a vendor console is the user's (per the manual-runbook rule).
- **No heavy builds from inside a drain** — a drain session (daily or ad hoc)
  never dispatches a build itself; a `needs build` item just gets logged
  (Step 3 case 4) and named in the wrap-up. The one place a build fires
  without a human click is the separate `device-test-weekly-build` scheduled
  task (see "Self-scheduled automation") — narrower logic, its own task, not
  this skill's per-item loop.
- **No mid-drain fixes** — failures get filed, linked, and handed to a chip
  (Step 3 case 3), not debugged live. Spawning the chip is part of filing;
  what stays out of the drain is the debugging itself. Not fixing is not not
  looking: a crash that surfaces mid-drain is filed on the spot, and the
  item's remaining steps still run (Step 3).
- **No sub-subagents** — the agent running Steps 0-4 never calls the Agent
  tool (see "Model"). `mcp__ccd_session__spawn_task` is the sole exception,
  and it schedules later work rather than doing this drain's.
- **No enqueueing** — writing queue items is the shipping session's job at
  ship time, when Steps and Expect are still warm (see the standard).
- **Never deletes or rewrites queue comments** beyond the Status line.

## When NOT to use

- No phone available and no emulator that satisfies the items' Needs runtime —
  and no loom items pending either, since those never needed one (Step 0.1).
- The user wants to verify an unmerged branch build they're iterating on —
  that's `build-feature`'s device loop (Step 3–4 there), not a queue drain.
- Ad hoc *web* checks on loom that were never enqueued — loom's **queue** is
  in scope (Scope table), but this skill only ever drains enqueued items; a
  one-off "look at the storefront for me" is not a drain.
