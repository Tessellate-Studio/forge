---
name: device-test
description: Drains the per-repo "Device test queue" GitHub issues across all Tessellate mobile apps (alate, mood-layer, badige) in one phone-in-hand sitting. Sessions enqueue on-device tests they cannot self-verify (per forge standards/workflows.md → "Device-test queue"); this skill fetches every OPEN item, verifies the right build/OTA is actually on the connected device per app, walks the user through each test's Steps + Expect, and closes items by editing their Status line — filing failures to the app's regression log or issues instead of fixing mid-drain. Use whenever the user asks to "drain the device test queue", "run device tests", "what needs testing on my phone", "walk me through device testing", "device test session", or passively "anything waiting on my phone?" / "what do I need to test?". Empty queues everywhere is a valid, quiet result. Output is a per-app walkthrough plus a wrap-up table: passed / failed→filed / skipped-stranded and what unblocks each skip.
---

# Device test drain

Sessions across three app repos ship changes that only a human with the phone
can verify — gesture feel, camera flows, store-track installs. Each one
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

### Step 1 — Plan the sitting

Present one short table before any testing: app · item title · Needs runtime ·
**testable-now verdict**. Order apps alate → mood-layer → badige (heaviest
delivery check first, while attention is fresh); the user can reorder or scope
down. This is the only up-front question of the session — everything after
runs item by item without re-asking.

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

### Step 3 — Walk the items, one at a time

For each OPEN item on the current app:

1. Present **Steps** and **Expect** verbatim from the comment. The user does
   the taps; you watch the seams you can reach — `adb logcat` for errors,
   `adb exec-out screencap -p` when a visual verdict helps.
2. **Pass** → edit the comment's Status line (never delete, never new comment):
   ```bash
   gh api repos/Tessellate-Studio/<repo>/issues/comments/<comment-id> \
     -X PATCH -f body="<original body with Status: OPEN → ✅ done <date>>"
   ```
3. **Fail** → capture what the user saw (their words + screenshot/logcat),
   file it where the app's rules say — regression-log row via PR, or a GitHub
   issue — and set `**Status:** ❌ failed → <link>`. **Do not fix mid-drain**:
   the sitting stays short; the fix is its own session with its own branch.
4. **Stranded** (Step 2 verdict) → leave `**Status:** OPEN`, report it in the
   wrap-up with the exact unblock ("install the v1.2.2 internal-track build").

### Step 4 — Wrap up

One table: item · app · verdict (✅ / ❌ → filed link / ⏸ stranded → unblock).
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
