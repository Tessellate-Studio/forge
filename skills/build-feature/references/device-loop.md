# Device verification loop — exact commands

Concrete commands for publishing an OTA and driving the connected Android test
device to verify a change. Read this when you reach Step 3 of SKILL.md.

## Mental model (read once)

- alate uses **EAS Update**. `updates.url` → `u.expo.dev`; `runtimeVersion`
  policy is **`fingerprint`** (`app.json`).
- The test device runs a **preview** build (internal APK, EAS profile `preview`,
  channel **`preview`**) — NOT a Play Store/production build, and NOT a dev
  client. So: no Metro, no fast-refresh. JS only arrives via an OTA on the
  `preview` channel.
- An OTA only applies to a build whose **native fingerprint matches** the
  published update's runtime version. JS/asset-only changes keep the fingerprint,
  so OTA works. If any *native* dep/config changed since the installed build was
  cut, the update is silently ignored and a fresh build is required — verify the
  build's runtime version with `eas build:list` if an update never shows.
- expo-updates with `fallbackToCacheTimeout: 0` loads the cached bundle
  immediately and downloads the new one in the background; it swaps in on the
  **next** launch. Hence the **double-relaunch**.

## Discover the toolchain + device (don't hardcode)

The wifi-debug IP:port changes per session — ask the user for it if unknown
("what's your wifi debugging IP:port?"), or use a USB device. adb usually lives
under the Android SDK, not on PATH:

```bash
ADB="/c/Users/mailt/AppData/Local/Android/Sdk/platform-tools/adb.exe"   # adjust if missing
"$ADB" connect <DEVICE_IP:PORT>          # e.g. 192.168.68.101:42325 (wifi debugging)
"$ADB" devices -l                        # confirm one device shows "device"
```

EAS auth: `eas whoami` should print an account. If not, the user must
`eas login` (interactive — you can't).

Package: `com.tessellate.alate`.

## Publish the OTA (preview channel)

```bash
cd /c/Users/mailt/Documents/alate/mobile
npx tsc --noEmit && npx jest --no-coverage     # gate — never publish a red build
APP_VARIANT=preview eas update --channel preview --environment preview \
  --message "<what changed>" --non-interactive
```

**`APP_VARIANT=preview` is MANDATORY when the device runs the "Alate Preview"
variant APK** (package `com.tessellate.alate.preview`). app.config.js derives
native config from that env var, and the runtime fingerprint hashes it — an
update published WITHOUT it computes the production fingerprint, the device
silently ignores it, and the fixes "don't arrive" with zero errors anywhere.
Incident: 2026-07-03, three UI fixes published fingerprint-mismatched; verified
by running `npx expo-updates fingerprint:generate --platform android` with and
without the var (`8f3b…` vs `767e…`).

Note the printed **Android Runtime version** + **Update group ID** — they let you
confirm on-device that the running bundle is the one you just shipped. (The
`--environment` flag is required in `--non-interactive` mode.)

## Apply on the device + screenshot

```bash
ADB="/c/Users/mailt/AppData/Local/Android/Sdk/platform-tools/adb.exe"
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
"$ADB" $D exec-out screencap -p > /c/Users/mailt/AppData/Local/Temp/alate-verify.png
"$ADB" $D shell svc power stayon false >/dev/null 2>&1   # restore the device setting
```

Then **Read** `alate-verify.png` and measure against the acceptance criteria.

If the first screenshot looks unchanged, the download likely outran the 22s
window — repeat the apply cycle with a longer first sleep, or confirm via logcat:

```bash
"$ADB" $D logcat -d 2>/dev/null | grep -i "dev.expo.updates" | grep -iE "branchName|DownloadComplete|NEW_UPDATE_LOADED" | tail -5
```

Look for `"branchName":"preview"` and the **update group ID** you just published.

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
- **Don't push to `production`** to test — that updates real users. Preview only,
  until verified and approved.
</content>
