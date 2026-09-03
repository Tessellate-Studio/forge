---
name: device-test
description: Drains the per-repo "Device test queue" GitHub issues across all Tessellate mobile apps (alate, mood-layer, badige) — AGENT-FIRST, and always runs its actual work in a cost-controlled model:sonnet subagent regardless of the invoking session's model. The agent executes every adb-automatable step itself (launch, taps, text entry, screenshots, logcat) and verifies Expect from what it captures; the human is pulled in only for steps marked HUMAN: (gesture feel, camera/biometrics, real accounts, iOS). Sessions enqueue tests per forge standards/workflows.md → "Device-test queue"; this skill fetches every OPEN item, verifies the right build/OTA is on the connected device per app, runs or walks each test, and closes items by editing their Status line — filing failures instead of fixing mid-drain. Items that need a fresh native build (no OTA can reach them) get logged as `🔧 needs build` instead of tested — OTA-deliverable changes always test immediately, ad hoc or scheduled, never gated by a build cadence. Self-schedules a daily drain (9am local by default) that skips needs-build items, plus a separate weekly task that dispatches builds only for apps with a needs-build backlog (the one standing exception to the no-automatic-builds CI-spend rule). Use whenever the user asks to "drain the device test queue", "run device tests", "what needs testing on my phone", "device test session", passively "anything waiting on my phone?" — or on a schedule/idle moment whenever a device is adb-connected: agent-only items need no invitation. Empty queues everywhere is a valid, quiet result. Output is a wrap-up table: passed / failed→filed / needs-build→unblock / needs-human, with what unblocks each.
---

# Device test drain

Sessions across three app repos ship changes that need a real phone to verify.
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

## Scope table — the apps and how a change reaches each phone

| App | Remote | Local checkout | Delivery today | Queue |
|---|---|---|---|---|
| alate | `Tessellate-Studio/alate` | `Documents/Tessellate/apps/alate` | Play internal testing + TestFlight; JS fixes as **production-channel OTAs** (from master only) | issue labelled `device-test-queue` |
| The Mood Layer | `Tessellate-Studio/mood-layer` | `Documents/Tessellate/apps/mood-layer` | **Expo Go / local dev server** — no store presence | issue labelled `device-test-queue` |
| badige | `Tessellate-Studio/badige` | `Documents/Tessellate/apps/badige` | **APK sideload / dev build** — no store presence | issue labelled `device-test-queue` |

Out of scope: `loom` (Alate for Brands) — a Shopify web app; browser
verification belongs to its own build flow, not a device queue.

**When an app gains store presence, edit only its Delivery cell here** (one
forge PR, version bump included). Queue items are delivery-agnostic — nothing
enqueued needs rewriting when the delivery path changes.

## Workflow

### Step 0 — Preflight

1. **Phone connected?** `adb devices` — if no device and the user didn't say
   the phone is nearby, say what's needed and stop. iOS-only items can still
   proceed (TestFlight, no adb) — flag that screenshots will be the user's job.
2. **Fetch every queue.** Per repo in the scope table:
   ```bash
   gh api "repos/Tessellate-Studio/<repo>/issues?labels=device-test-queue&state=open" \
     --jq '.[] | select(.pull_request | not) | .number'
   gh api repos/Tessellate-Studio/<repo>/issues/<n>/comments \
     --jq '.[] | {id: .id, body: .body}'
   ```
   Use `gh api`, NOT `gh issue list --json` — the latter fails outright on
   gh 2.98.0 ("invalid character '{' after object key") for every field
   combination, which silently takes the whole fetch down.

   An item is pending iff its body contains `**Status:** OPEN`. No queue issue
   in a repo → that repo simply has nothing pending (the *enqueue* side is
   responsible for creating it); note it and move on.
3. **Repair format drift — do not just report it.** Anything the parser marks
   UNPARSEABLE is a comment that *looks* like an item but cannot be read as
   one. **Fix it in place; never hand the user a list to tidy by hand.** For
   each one, open it and decide:
   - **A real test missing its Status line** → append `- **Status:** OPEN` so
     it enters the queue, then drain it this sitting like any other item. This
     is the common case: an item enqueued before the format settled.
   - **A note, or commentary on another item** → leave it alone. The parser
     ignores anything with neither a title nor a Status, and skips bot notices
     (`### 📦`, `### 🔒`) outright.
   - **Genuinely ambiguous** → leave it and say so in the wrap-up, with the
     comment URL and what is missing. That is the only case that reaches a
     human, and it should be rare.

   **Restamp drifted headings in the same pass.** `dtq` counts headings that
   don't match their Status line (missing glyph, missing ID, or a glyph that
   contradicts the Status). Rewrite each to `### <glyph> <comment id> —
   <intent>` per the glyph table in the standard. It's one PATCH per comment,
   no device involved, and it's the whole reason the issue page can be read
   without expanding anything. Two rules: **the `**Status:**` line decides the
   glyph, never the reverse** — a heading is never evidence about a test — and
   the intent text stays exactly as its author wrote it.

   Say what was repaired in the wrap-up. A drain that reports "N comments
   don't match the format" without having fixed them has not done its job —
   the whole point of the queue is that nobody maintains it by hand.

   Why this matters more than tidiness: a malformed item is an **invisible**
   item. On alate#562 nine comments were flagged, and two of them were real
   OPEN tests that had silently dropped off the board — one for over a week.
4. **Claim the device before touching it.** The queue issue carries the lock —
   format and semantics in
   [`standards/workflows.md` → "Claiming the device"](../../standards/workflows.md).
   Read the claims first:
   - **Held by another session and still alive** → do NOT drive the device.
     Say who holds it, when it last touched the phone, and what it's waiting
     on; then stop. Fetching, reading and reporting are still fine; `adb` is
     not. A claim is alive whenever it was touched inside the last 30 minutes,
     **however long ago it was taken** — a three-hour job that is still
     working holds the phone — and a claim marked `**Waiting on:** human`
     is alive indefinitely.
   - **Free, released, or silent past the window** → post your own claim
     comment naming your session and the `adb` serial, then proceed. If you
     took over a silent claim, say so in yours.

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
5. **All queues empty → say so and stop.** Quiet is a correct result — don't
   invent work. Close your claim before stopping (Step 4).

### Step 1 — Split the work: agent items, human items, and build-blocked items

Classify every item by Status first, then (for OPEN ones) by Steps:

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
  adb-executable): **just run them (Step 2 → 3), no question asked.** This is
  the self-maintenance path — the user should not be consulted about tests an
  agent can execute and judge from a screenshot/logcat.
- **OPEN, needs-human** (at least one `HUMAN:` step): present one short table —
  app · item · the specific `HUMAN:` steps · Needs runtime · testable-now
  verdict — and walk them with the user if they're present. If the user isn't
  in the loop right now (including every automated daily/weekly run — there is
  never a human present for those), leave those items OPEN, report them in the
  wrap-up, and still run all their non-HUMAN steps as a smoke pass (a crash on
  launch shouldn't wait for a human sitting to be discovered).

Order apps alate → mood-layer → badige.

### Step 2 — Per app: verify delivery BEFORE walking items

Measuring against a stale build is worse than not testing — every verdict
would be about the previous bundle. Per app, before its first item:

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

### Step 3 — Execute the items, agent-first

For each OPEN item on the current app:

1. **Execute every non-`HUMAN:` step yourself**: `adb shell am force-stop` /
   `monkey -p <pkg> 1` or `am start` to launch, `adb shell input tap/swipe/
   text/keyevent` for interaction, `adb exec-out screencap -p` after each
   meaningful step, `adb logcat` filtered on the app for errors. Judge
   **Expect** from the captured screenshot/logcat — Read the PNG, state the
   verdict with what you saw, keep the final screenshot for the wrap-up.
   Coordinates: take a screenshot first and derive tap targets from it rather
   than guessing; if a target can't be located confidently after two
   attempts, downgrade the item to needs-human with a note — never close on
   a guessed tap.
   For `HUMAN:` steps (and only those), hand the phone to the user with the
   step + Expect verbatim (set `**Waiting on:** human — <what>` on your claim
   first); you keep watching logcat/screenshots around their action.

   **Every status edit moves two lines: the `**Status:**` line and the heading
   glyph** (⚪ passed, 🔴 failed, 🔧 needs build — table in the standard). One
   PATCH, both lines. A ⚪ heading over an OPEN item is worse than no glyph at
   all, because someone scrolling the issue reads it as finished.

   **Anything you observed that the Status line can't carry goes in a note on
   that same comment**, under a `---` rule — why it couldn't run, a pre-req
   that's still missing, a PR/SHA correction. Not a new comment: notes live
   with the test they belong to (standard → "Notes go on the item, under a
   rule").
2. **Pass** → edit the Status line and the heading (never delete, never new
   comment), then minimize the comment as Resolved so the queue doesn't grow
   unscrollable — see `standards/workflows.md` → "Device-test queue" for the
   GraphQL call (REST has no minimize endpoint):
   ```bash
   gh api repos/Tessellate-Studio/<repo>/issues/comments/<comment-id> \
     -X PATCH -f body="<body with 🤖/🙋 → ⚪ in the heading and
                        Status: OPEN → ✅ done <date>>"
   ```
3. **Fail** → capture what the user saw (their words + screenshot/logcat),
   file it where the app's rules say — regression-log row via PR, or a GitHub
   issue — and set `**Status:** ❌ failed → <link>`. **Do not fix mid-drain**:
   the sitting stays short; the fix is its own session with its own branch.
   **Do not minimize this comment** — the bug is still open regardless of
   where it's tracked now; hiding it under "Resolved" reads as handled and
   risks it getting forgotten. It stays fully visible in the queue until
   someone actually fixes it and a later drain flips it to ✅ done.
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
the claim comment you posted in Step 0:

1. edit it so `**Claim:**` reads `RELEASED`;
2. **minimize it as Resolved** (the same GraphQL `minimizeComment` call used
   for a passed item), so it collapses out of the thread instead of sitting
   there looking live.

Do this even when the drain failed, stopped early, or found nothing. Closing
the claim is the signal that the phone is free — nothing else is. The
no-touch window only covers a session that *crashed*; a session that finished
and left its claim standing has told everyone else the device is busy.

One table: item · app · verdict (✅ agent-verified, with screenshot / ✅ human-
confirmed / ❌ → filed link / 🔧 needs build → what would unblock it / 🙋
needs-human → the specific `HUMAN:` steps waiting). Identify each item by its
test ID (the comment id) so the user can jump straight to it.
Then, per the user's communication style: what they need to do (installs,
promotions), what got filed for follow-up sessions. If any repo's queue issue
had drifted from the format, say what you REPAIRED (Step 0.3) — and list only
the ones you genuinely could not classify, with their URL and what's missing.
"N comments don't match the format" with nothing done about them is not an
acceptable wrap-up line. **A daily automated run only speaks up if this table has at
least one non-empty row** (something tested, failed, or newly logged as
needs-build) — an empty drain stays silent per the "quiet is correct" rule,
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
- **No mid-drain fixes** — failures get filed and linked, not debugged live.
- **No enqueueing** — writing queue items is the shipping session's job at
  ship time, when Steps and Expect are still warm (see the standard).
- **Never deletes or rewrites queue comments** beyond the Status line.

## When NOT to use

- No phone available and no emulator that satisfies the items' Needs runtime.
- The user wants to verify an unmerged branch build they're iterating on —
  that's `build-feature`'s device loop (Step 3–4 there), not a queue drain.
- The user asks about *web* surfaces (loom) — out of scope by design.
