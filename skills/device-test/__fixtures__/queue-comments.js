// Real comments off the two live queue issues, captured 2026-09-08.
//
// WHY REAL ONES. Every rule in the parser was written against a shape someone
// actually posted, and every regression it has had came from a shape nobody
// invented in a test. Long prose is elided with an ellipsis; nothing the
// parser reads — headings, field lines, code spans, `---` rules — is edited,
// and each `id`/`html_url` is the comment's own, so a failure here names a
// comment you can open.
//
// Sources:
//   alate      https://github.com/Tessellate-Studio/alate/issues/562
//   mood-layer https://github.com/Tessellate-Studio/mood-layer/issues/66

const alate = (id, body) => ({
  id,
  html_url: `https://github.com/Tessellate-Studio/alate/issues/562#issuecomment-${id}`,
  created_at: '2026-09-02T09:00:00Z',
  body,
});

const moodLayer = (id, body) => ({
  id,
  html_url: `https://github.com/Tessellate-Studio/mood-layer/issues/66#issuecomment-${id}`,
  created_at: '2026-09-03T09:00:00Z',
  body,
});

/** 📦 OTA-publish record — eas-update.yml posts one on every deploy. */
const otaNotice = alate(
  5496068550,
  [
    '### 📦 production OTA published — cd93c5e3aaf95b968d2dfe7ef9176f972ecfdfcd',
    '',
    '- **Update group:** `209896cf-b66c-49c9-98f8-148ab5bae527`',
    '- **Runtime:** 1.3.1 · **Platforms:** android, ios',
    '- **Message:** Fit calibration: paired typical-size cards, collapsible saved pieces',
    '- **Run:** https://github.com/Tessellate-Studio/alate/actions/runs/33523380062',
    '',
    'Any open item above whose **Delivery** is `production OTA (pending)` and whose',
    '**SHA** is `cd93c5e3…` is now reachable on the phone. …',
    '',
    '_Posted automatically by the EAS Update workflow._',
  ].join('\n')
);

/** 🔒 device claim — every drain that touches the phone posts one. */
const deviceClaim = alate(
  5507399380,
  [
    '### 🔒 Device claim',
    '- **Claimed by:** confident-greider-24081c-74',
    '- **Device:** 804KPSL1724518',
    '- **Claimed at:** 2026-09-02T09:25:42.684Z',
    '- **Claim:** RELEASED',
    '',
    '_Written by /forge:device-test. Release by editing **Claim:** to',
    'RELEASED. …_',
  ].join('\n')
);

/**
 * A legacy item: bold opener instead of a `###` heading, and no Steps/Expect
 * fields because it predates them. Closed `✅ done` by the 2026-09-02 drain.
 */
const legacyBoldItem = alate(
  5469277783,
  [
    '**HUMAN: re-verify** — Tab bar / Recent-card mis-tap fix (PR [#620](https://github.com/Tessellate-Studio/alate/pull/620), merged `60879f7`)',
    '',
    'Original report: tapping "Profile"/"My Fits" on Home sometimes opened a Recent',
    'fit-check card instead. …',
    '',
    '**Root cause was NOT confirmed.** …',
    '',
    '**Please re-verify with real taps**, especially right after backing out of an',
    '*expanded* (not docked) fit-result sheet. …',
    '',
    '**Status:** ✅ done 2026-08-31 — duplicate of the item above, already human-confirmed',
    '',
    '_Drain 2026-09-02: closing as a **duplicate**. …_',
  ].join('\n')
);

/**
 * A drain correction posted as its own comment: written like a little
 * document (two `###` headings, bold runs) and closing on a sentence that
 * opens `**Status:**` and then explains, in prose, why a DIFFERENT item is
 * blocked. Neither heading carries an item glyph; nothing in it is a test.
 */
const correctionNote = alate(
  5571959196,
  [
    '### ⚠️ Correction to `untracked-inventory-stock-verdict` (posted earlier today) — **it cannot be run on the dev store, and no store setting fixes that**',
    '',
    'Posting as a new comment rather than editing the original, since another',
    'session is draining this queue.',
    '',
    '**Do not spend time on that item against `8qvbpu-ix`.** Measured 2026-09-07:',
    '',
    '1. `https://8qvbpu-ix.myshopify.com/products/restock-cardigan.json` → **`302 → /password`**.',
    '2. So `tryShopifyJSON` returns null and **`shopifyFetch.ts` never executes on this store.**',
    '',
    '### 🔴 Related, and worth acting on: flipping `Track quantity` OFF breaks the OTHER queued test',
    '',
    'Shopify reports an **untracked** variant as `availableForSale: true`',
    'unconditionally — that is the whole premise of #675. …',
    '',
    '- **Status:** the earlier `untracked-inventory-stock-verdict` item is **BLOCKED — not runnable on any store we have.**',
  ].join('\n')
);

/**
 * A real test that never got a Status line — and whose appended drain note
 * says exactly that, inside backticks. The mention is the trap: read as a
 * field, it turns a Status-less item into one with a paragraph for a Status.
 */
const itemMissingStatus = alate(
  5523648406,
  [
    '### Fit analysis screen: docked-on-history-launch, end-of-deck bounce/counter, gesture tip, iOS edge-swipe-back fix',
    '**App:** alate (consumer) · **PR:** #670 (draft, not yet merged) · **SHA:** `7d4a918`',
    '- **Delivery:** ships in the next OTA after merge (JS-only — no native config touched)',
    '- **Needs runtime:** any (both platforms; the iOS item needs a real iPhone)',
    '- **Steps:**',
    '  1. Open History with 3+ saved fit checks, tap one → should open **docked**.',
    '  2. Swipe to the last entry, then keep swiping → the card should rubber-band.',
    '- **Expect:** all six behave as described above. …',
    '',
    '---',
    '_Generated by [Claude Code](https://claude.ai/code)_',
    '---',
    '',
    '**Note — 2026-09-07 · daily drain (queue-drift repair):** No `**Status:**` line',
    'on this comment (format drift). Left without one deliberately rather than',
    'appending `OPEN` — this is an early draft of the same PR #670 test at SHA',
    '`7d4a918`, superseded by a later revision … Not re-run separately here to',
    'avoid duplicating the same test three times.',
  ].join('\n')
);

/** A closed test whose Status reads `CLOSED` — a value the format defines no state for. */
const itemUndefinedStatus = alate(
  5424307372,
  [
    '**Device test — iOS TestFlight v1.3.1 (2026-08-26)**',
    '',
    '- **What shipped:** first iOS 1.3.x build — EAS build `537ffa3a`. …',
    '- **Device:** iPhone with TestFlight (currently on 1.2.1).',
    '- **Steps:** 1) Update to 1.3.1 in TestFlight. 2) Launch, sign in with Google. …',
    '- **Expected:** clean launch; cloud sync pulls; OTA update check completes quietly.',
    '',
    '- **Status:** CLOSED— iOS/TestFlight, human-only (no adb path on this platform)',
    '',
    '_Status line added 2026-09-02 by the queue-drift repair (forge#79). …_',
  ].join('\n')
);

/** A live item parked by the user under a status value the format does not define. */
const itemParkedStatus = moodLayer(
  5521503000,
  [
    '### Insights: "last week" copy, no dismiss, last week’s cards only, new footer',
    'Supersedes the 2026-09-02 entry above for PR #97.',
    '- **PR:** #97 · **SHA:** `5ce983d` (merged to master 2026-09-03)',
    '- **Delivery:** Expo Go',
    '- **Needs runtime:** any (pure JS copy, layout and store migration)',
    '- **Steps:**',
    '  1. `npx expo start`, open in Expo Go. Needs ≥3 check-ins in LAST ISO week.',
    '  8. HUMAN: read all of it and say whether the wording matches what you logged.',
    '- **Expect:** header "Last week · <date range> · N check-ins across M days". …',
    '- **Status:** 🅿️ PARKED — the Insights checks are being rethought (user, 2026-09-03)',
    '',
    '_"Ignore all insights page based tests — they need to be rethought." …_',
    '',
    '---',
    '_Generated by [Claude Code](https://claude.ai/code)_',
    '',
    '---',
    '_Drain 2026-09-03, device 804KPSL1724518, mood-layer master `93f1d57`. …_',
  ].join('\n')
);

/**
 * A correction to another item's Expect, posted the morning after the first
 * pass of this fix shipped. Its opening bold run is `**Expect correction for
 * item …**` — which a shape rule matching a bare `**Expect` reads as the
 * Expect FIELD, promoting a note with no test in it to a malformed item.
 */
const expectCorrectionNote = alate(
  5575634751,
  [
    '**Expect correction for item `5572382793` (size-not-carried-card) — and why it FAILed on a case it should not have been judged on.**',
    '',
    'The drain agent was right on both counts, so recording it here rather than',
    "leaving the item's own text misleading.",
    '',
    "**1. That item's Expect #2 is stale.** It reads:",
    '',
    '> A line under the stats divider reading **"this brand\'s range stops at L — they don\'t make XXL"**',
    '',
    'That was written for the **ladder-only** world before #711. …',
    '',
    '**2. The FAIL it filed (#714) was still real, and was mine.** …',
    '',
    '**Applies to that item going forward:** judge the sentence by which route',
    'produced the verdict. …',
  ].join('\n')
);

module.exports = {
  expectCorrectionNote,
  otaNotice,
  deviceClaim,
  legacyBoldItem,
  correctionNote,
  itemMissingStatus,
  itemUndefinedStatus,
  itemParkedStatus,
};
