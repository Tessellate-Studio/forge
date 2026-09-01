# Device verification loop — exact commands

Concrete commands for publishing an OTA and driving the connected Android test
device to verify a change. Read this when you reach Step 3 of SKILL.md.

## Mental model (read once)

- alate uses **EAS Update**. `updates.url` → `u.expo.dev`; `runtimeVersion`
  policy is **`appVersion`** on BOTH platforms since v1.3.1 (PR #605) —
  an OTA reaches every install whose `expo.version` matches, and ONLY an
  `expo.version` bump strands older builds. The old `fingerprint` policy is
  GONE; do not reason from fingerprint-drift folklore in anything dated
  before 2026-08-26.
- **The preview lane is retired** (user decision, 2026-08-13). The test
  device runs a **production** build (Play internal-testing track APK, or
  a TestFlight build on iOS) — NOT a dev client. So: no Metro, no
  fast-refresh. JS only arrives via an OTA on the **`production`** channel,
  same as real users get. (The preview APK workflow input still exists for
  one-off debugging, but no preview OTAs are published anymore — don't
  reach for it here.)
- Because `appVersion` does NOT change when the native surface does, the
  old fingerprint mismatch can no longer silently protect you from
  publishing a JS update that calls a native module the installed binary
  lacks — that job now belongs to the Native-drift gate step in
  `eas-update.yml`, which refuses to publish if native-relevant files
  (`package.json`/`app.json`/`eas.json`) changed since the last release tag
  with no `expo.version` bump.
- expo-updates with `fallbackToCacheTimeout: 0` loads the cached bundle
  immediately and downloads the new one in the background; it swaps in on the
  **next** launch. Hence the **double-relaunch**.

## Discover the toolchain + device (don't hardcode)

The wifi-debug IP:port changes per session — ask the user for it if unknown
("what's your wifi debugging IP:port?"), or use a USB device. adb usually lives
under the Android SDK, not on PATH — don't hardcode a username in the path,
it varies per machine (a stale hardcoded profile path is exactly the kind of
folklore this doc warns about elsewhere):

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"   # adjust if missing
"$ADB" connect <DEVICE_IP:PORT>          # e.g. 192.168.68.101:42325 (wifi debugging)
"$ADB" devices -l                        # confirm one device shows "device"
```

EAS auth: `eas whoami` should print an account. If not, the user must
`eas login` (interactive — you can't).

Package: `com.tessellate.alate`.

## Publish the OTA (production channel)

The preview lane is retired, so this ships on the same `production` channel
real users are on. From the alate checkout's `mobile/` directory (path is
per-session — check this session's known checkout location, don't assume a
username):

```bash
npm run ota:production -- --message "<what changed>"
```

This dispatches `eas-update.yml` on CI by default (issue #629 / PR #637):
typecheck + the full jest suite run as a preflight, bundling happens on a
clean runner, and the Native-drift gate blocks the publish if native-relevant
files changed since the last release tag with no `expo.version` bump. Watch
it with `gh run list --workflow=eas-update.yml --limit 1` — **production
routes through a GitHub `production` Environment that may be waiting on a
human reviewer's approval click before it actually publishes**, so don't
assume "dispatched" means "live" until that run completes.

Add `--local` only when CI is unavailable — it bundles on this machine
instead, which is the fragile path (a two-platform Metro export is the
heaviest thing this repo asks of a dev machine; it has died natively under
load, `0xC0000409` at 99%, 2026-08-31):

```bash
npm run ota:production -- --message "<what changed>" --local
```

Either way, note the printed **Android Runtime version** + **Update group
ID** — they let you confirm on-device that the running bundle is the one you
just shipped.

## Apply on the device + screenshot

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
D="-s <DEVICE_IP:PORT>"
PKG="com.tessellate.alate"

"$ADB" connect <DEVICE_IP:PORT> >/dev/null 2>&1
"$ADB" $D shell svc power stayon true >/dev/null 2>&1   # keep screen on during the wait
"$ADB" $D shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1; sleep 1

# 1) download the update (background)
"$ADB" $D shell am force-stop "$PKG"; sleep 1
"$ADB" $D shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 22                                                 # download window — be generous

# 2) apply it (next launch runs the new bundle)
"$ADB" $D shell am force-stop "$PKG"; sleep 2
"$ADB" $D shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 12                                                 # JS load + render

"$ADB" $D shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1
"$ADB" $D exec-out screencap -p > "$LOCALAPPDATA/Temp/alate-verify.png"
"$ADB" $D shell svc power stayon false >/dev/null 2>&1   # restore the device setting
```

## MANDATORY before measuring: confirm the RUNNING update is yours

**Never measure a screenshot against acceptance criteria until logcat proves
the device is executing the update you just published.** This is not a
fallback for when "the screenshot looks unchanged" — a stale bundle that
renders plausibly passes silently, and that failure mode ran for WEEKS on
alate: no CI-built Android binary before v1.3.1 could receive ANY OTA (no
`expo-channel-name` baked in → the update server 400'd every request —
alate issue #596), so every "verified on device" Android OTA verdict in that
window measured old JS and reported it as a verdict on the new code.

```bash
"$ADB" $D logcat -d 2>/dev/null | grep -i "dev.expo.updates" | grep -iE "branchName|DownloadComplete|NEW_UPDATE_LOADED|UpdateFailedToLoad|CheckError" | tail -8
```

- PASS gate: the **update group ID you just published** appears, and no
  `UpdateFailedToLoad`/`CheckError` follows it.
- `Remote update request not successful` / `CheckError` on every launch =
  the binary cannot receive updates AT ALL (missing channel header, wrong
  runtime, dead lane) — stop and diagnose the delivery lane; do NOT keep
  republishing.
- **Never generalize an iOS pass to Android or vice versa** — the two
  delivery lanes are fully independent (different runtime policies,
  different env injection, different build systems) and have genuinely
  diverged for months at a time.

If the group ID is absent but there is no error, the download likely outran
the 22s window — repeat the apply cycle with a longer first sleep, then
re-check the gate.

Then **Read** `alate-verify.png` and measure against the acceptance criteria.

## Navigating the app over adb (to reach other screens)

- Tap by pixel: `"$ADB" $D shell input tap <X> <Y>` (device is 1440×2880; the
  screencap is full-res — multiply your %-estimates by 1440/2880).
- Scroll: `"$ADB" $D shell input swipe 720 2200 720 600 250`.
- Back / wake: `input keyevent KEYCODE_BACK` / `KEYCODE_WAKEUP`.
- Taps fall through to whatever's frontmost — confirm the app/screen first:
  `"$ADB" $D shell dumpsys activity activities | grep -m1 -i mResumedActivity`
  (the alate activity is `com.tessellate.alate/.MainActivity`; another package
  means your tap missed — relaunch alate).

## Gotchas seen in practice

- **Screen locks during the waits** → screenshot shows the lock screen. Wake +
  swipe up (`input keyevent KEYCODE_WAKEUP`; `input swipe 720 2400 720 800 200`),
  or set `svc power stayon true` first (and restore `false` after).
- **A Play Protect "unknown app" dialog** can overlay the screen on launch (the
  build is sideloaded). Dismiss with a tap on "Don't send" if it blocks the view.
- **Empty vs populated state is data-dependent.** Some screens render differently
  with/without fit history. Don't clear the user's history to force a state
  without asking — note the limitation instead.
- **Publishing here IS publishing to production** — the preview lane is
  retired, so there is no longer a safe channel to rehearse on. The
  `production` GitHub Environment's reviewer-approval gate (required on
  `eas-update.yml`) is the actual safety net now; don't dispatch the OTA
  workflow speculatively, and don't `--skip-native-drift-gate` without a
  human having verified the change is JS-safe.
</content>
