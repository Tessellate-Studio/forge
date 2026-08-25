---
name: device-test
description: Drains the per-repo "Device test queue" GitHub issues across all Tessellate mobile apps (alate, mood-layer, badige) — AGENT-FIRST. The agent executes every adb-automatable step itself (launch, taps, text entry, screenshots, logcat) and verifies Expect from what it captures; the human is pulled in only for steps marked HUMAN: (gesture feel, camera/biometrics, real accounts, iOS). Sessions enqueue tests per forge standards/workflows.md → "Device-test queue"; this skill fetches every OPEN item, verifies the right build/OTA is on the connected device per app, runs or walks each test, and closes items by editing their Status line — filing failures instead of fixing mid-drain. Use whenever the user asks to "drain the device test queue", "run device tests", "what needs testing on my phone", "device test session", passively "anything waiting on my phone?" — or on a schedule/idle moment whenever a device is adb-connected: agent-only items need no invitation. Empty queues everywhere is a valid, quiet result. Output is a wrap-up table: passed / failed→filed / skipped-stranded / needs-human, with what unblocks each.
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
   gh issue list --repo Tessellate-Studio/<repo> --label device-test-queue \
     --state open --json number --jq '.[0].number'
   gh api repos/Tessellate-Studio/<repo>/issues/<n>/comments \
     --jq '.[] | {id: .id, body: .body}'
   ```
   An item is pending iff its body contains `**Status:** OPEN`. No queue issue
   in a repo → that repo simply has nothing pending (the *enqueue* side is
   responsible for creating it); note it and move on.
3. **All queues empty → say so and stop.** Quiet is a correct result — don't
   invent work.

### Step 1 — Split the work: agent items vs human items

Classify every OPEN item by its Steps: **agent-runnable** (no `HUMAN:` prefix
anywhere — every step is adb-executable) vs **needs-human** (at least one
`HUMAN:` step). Then:

- **Agent-runnable items: just run them (Step 2 → 3), no question asked.**
  This is the self-maintenance path — the user should not be consulted about
  tests an agent can execute and judge from a screenshot/logcat.
- **Needs-human items:** present one short table — app · item · the specific
  `HUMAN:` steps · Needs runtime · testable-now verdict — and walk them with
  the user if they're present. If the user isn't in the loop right now, leave
  those items OPEN, report them in the wrap-up, and still run all their
  non-HUMAN steps as a smoke pass (a crash on launch shouldn't wait for a
  human sitting to be discovered).

Order apps alate → mood-layer → badige.

### Step 2 — Per app: verify delivery BEFORE walking items

Measuring against a stale build is worse than not testing — every verdict
would be about the previous bundle. Per app, before its first item:

**alate**
1. Installed build: `adb shell dumpsys package com.tessellate.alate | grep -E "versionCode|versionName"`.
2. Compare against each item's **Needs runtime**. Item needs a newer tag build
   than installed → **stranded**: skip with reason, tell the user which build
   to install (Play internal / `gh run download` + `adb install`) — never
   trigger a heavy build yourself (CI-spend rule: builds are human-dispatched).
3. OTA-delivered items: confirm the update published to the production channel
   (`eas update:list --branch production --limit 3` from `mobile/`) and
   force-stop → relaunch → force-stop → relaunch (expo-updates applies on
   second launch). If a fingerprint-source file changed since the installed
   build (`mobile/app.json`, `mobile/eas.json`), the OTA is unreceivable —
   stranded, same skip-with-reason.

**mood-layer** — start the dev server (`npx expo start` in the checkout), user
opens in Expo Go. Confirm the loaded JS is current (Metro logs show the
connection) before the first item.

**badige** — check the installed package (`adb shell dumpsys package | grep -i
badige` or its known package id); if the item's SHA is newer than the installed
APK, ask the user to dispatch the APK workflow (or locate an existing artifact
with `gh run list`), then `adb install -r` the downloaded artifact.

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
   step + Expect verbatim; you keep watching logcat/screenshots around their
   action.
2. **Pass** → edit the comment's Status line (never delete, never new comment),
   then minimize it as Resolved so the queue doesn't grow unscrollable — see
   `standards/workflows.md` → "Device-test queue" for the GraphQL call (REST
   has no minimize endpoint):
   ```bash
   gh api repos/Tessellate-Studio/<repo>/issues/comments/<comment-id> \
     -X PATCH -f body="<original body with Status: OPEN → ✅ done <date>>"
   ```
3. **Fail** → capture what the user saw (their words + screenshot/logcat),
   file it where the app's rules say — regression-log row via PR, or a GitHub
   issue — and set `**Status:** ❌ failed → <link>`. **Do not fix mid-drain**:
   the sitting stays short; the fix is its own session with its own branch.
   **Do not minimize this comment** — the bug is still open regardless of
   where it's tracked now; hiding it under "Resolved" reads as handled and
   risks it getting forgotten. It stays fully visible in the queue until
   someone actually fixes it and a later drain flips it to ✅ done.
4. **Stranded** (Step 2 verdict) → leave `**Status:** OPEN`, report it in the
   wrap-up with the exact unblock ("install the v1.2.2 internal-track build").
   Stays un-minimized too — it's still open work, not a closed queue item.

### Step 4 — Wrap up

One table: item · app · verdict (✅ agent-verified, with screenshot / ✅ human-
confirmed / ❌ → filed link / ⏸ stranded → unblock / 🙋 needs-human → the
specific `HUMAN:` steps waiting).
Then, per the user's communication style: what they need to do (installs,
promotions), what got filed for follow-up sessions. If any repo's queue issue
had drifted from the format (unparseable comments), say which comment — don't
silently skip it.

## What this skill does NOT do

- **No store-console actions** — promoting Play tracks, TestFlight review,
  anything in a vendor console is the user's (per the manual-runbook rule).
- **No heavy builds** — if an item needs a fresh APK/AAB, it names the dispatch
  and waits for a human; `workflow_dispatch` builds are user-triggered.
- **No mid-drain fixes** — failures get filed and linked, not debugged live.
- **No enqueueing** — writing queue items is the shipping session's job at
  ship time, when Steps and Expect are still warm (see the standard).
- **Never deletes or rewrites queue comments** beyond the Status line.

## When NOT to use

- No phone available and no emulator that satisfies the items' Needs runtime.
- The user wants to verify an unmerged branch build they're iterating on —
  that's `build-feature`'s device loop (Step 3–4 there), not a queue drain.
- The user asks about *web* surfaces (loom) — out of scope by design.
