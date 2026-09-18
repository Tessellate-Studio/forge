# Backlog — The Mood Layer

Durable record of out-of-scope and not-yet-started work. Check here before
proposing "should we build X?". Sections are P0 (do next) → P4 (someday). The
*what + why* lives here; the *exactly-how* for any decided external setup lives
in [`docs/manual-runbook.md`](docs/manual-runbook.md) — cross-link,
don't copy. Rubric scores (0–12) come from `@tessellate-studio/forge`
`evaluateFromContext` (heuristic, auditable — rubric-sdk was merged into forge
2026-07-17, PR #21 `07e84af`).

Seeded 2026-07-12 from the first roadmap-pulse run.

## P0 — now (this week)

- ~~**Circle: scheduled-share reminders (no-backend version)**~~ — shipped
  2026-07-13, PR #13 (`c547258`).
  **Still open:** on-device firing is unverified — Expo Go can't fire local
  scheduled notifications (regression-log #4), so every circle service fn
  no-ops under it. Needs the EAS dev build tracked under "Post-launch" (the
  same build unblocks name-it reminder verification).

- ~~**Circle: true auto-deliver to recipient (backend automation)**~~ —
  **decided, built and deployed 2026-07-18.** All five blocking decisions were
  settled; the trust boundary and the deployed shape are written up in
  `docs/SECURITY.md` → "Circle relay". One residual action — the two-phone
  pairing test — is tracked in `docs/manual-runbook.md`.
  Resolutions: **channel** = peer-app delivery (not email/SMS), QR pairing with
  on-device nacl.box encryption; **identity** = per-pairing bearer tokens, no
  accounts; **where** = the *alate* Supabase project, deliberately (free-tier
  projects pause after ~1 week idle; alate's traffic keeps it awake), schema
  `moodlayer`, edge function `moodlayer-relay` v2; **stored server-side** =
  nothing durable — send-and-forget with delete-on-read; **scheduling** = an
  on-device background task (evening after 6 pm / Sunday evening), not a server
  cron. Verified 2026-07-18 by curl round-trip (invite → claim → send → fetch →
  wrong-token 403 → unpair).
  **Still open:** never exercised on real hardware — needs two phones, and the
  Phase-2 background wake + "a week arrived" notification can't fire under Expo
  Go (regression-log #4), so it rides on the same EAS dev build. **Deferred:**
  instant FCM push pokes — only if the daily/weekly cadence feels slow.

## P1 — do next

- ~~**Hold-to-learn opens the FAMILY's helper, not the WORD's**~~ — shipped
  2026-09-03. User, same day, closing the decision: "Situational definition
  is exactly what we need," "add the constructive, ambiguous and destructive
  bit," "Only show the definition, the whole family card is unnecessary,"
  "I'd like it implemented for all the emotions we have on the app."
  `src/content/wordDefinitions.ts` is new: a situational definition per word
  (Atlas-of-Emotions style — what the state actually IS, never a strength
  label) plus a `constructive`/`ambiguous`/`destructive` action set — a real
  third bucket confirmed from the Atlas itself ("the atlas… directs you
  towards possible responses and an assessment of whether each response is
  constructive, destructive or ambiguous"), not a euphemism for good/bad.
  Written fresh for this app's own ~121-word vocabulary (gradient + extended,
  every family), not ported from the Atlas's text.
  `useHelperSheetStore`'s `family` field became a `target` discriminated
  union (`{kind:'family', family}` vs `{kind:'word', wordId}` — the word
  variant deliberately carries no `family`: an adversarial review caught that
  a passed-in family can go stale against an old check-in selection —
  `embarrassed` moved from sadness to fear on 2026-08-30, but a check-in
  written before that still stores `family:'sadness'` on the selection — so
  every consumer derives the family fresh from the word id instead).
  Holding a specific word chip (check-in, judgment flow, a picked
  temperature row) now opens WORD mode — `WordDefinitionContent`, just the
  tag + intensity dots + definition + three action rows, no family essay.
  The deliberate "learn about this family" entry points (Field Guide's nine
  families, a masking doorway's "learn about X", the day-detail sheet's
  "about X") are unchanged, still FAMILY mode with the full card. The Field
  Guide's own per-word detail panel got the same content inline, replacing
  the old `INTENSITY_PHRASES` generic sentence (deleted — dead once its one
  call site was rewritten). Tests: `wordDefinitions.test.ts` pins
  completeness (every word in the app has a definition + all three actions),
  no duplicate definitions, no duplicate actions within a word, and the
  house gentle-copy rule.
  **Still open:** on-device verification (queued); no design review yet on
  whether the action-bucket LABELS ("Constructive"/"Ambiguous"/"Destructive")
  read as clinical against the app's gentle voice — worth a look once it's
  seen on a phone. An 8-angle adversarial review (2026-09-03) found and fixed
  the family-staleness issue above plus four conventions cleanups (hardcoded
  literals → theme tokens in `WordDefinitionContent`'s intensity dots, the
  action labels moved into `wordDefinitions.ts`, a stale comment, a
  duplicated one-line wrapper). Deliberately deferred, not blocking:
  `WORD_DEFINITIONS`'s flat `Record<string, …>` shape gets no compile-time
  completeness check the way `EMOTION_HELPERS`/`EXTENDED_VOCABULARY`'s
  `Record<EmotionFamilyId, …>` shape does (only `wordDefinitions.test.ts`'s
  runtime check guards it) — worth a family-keyed restructure if the
  vocabulary keeps growing; and `WordDefinitionContent`'s read-only intensity
  dots + action rows duplicate `IntensityDial`'s swatch logic and
  `EmotionHelperContent`'s `Section` pattern respectively — worth extracting
  a shared piece if a third caller of either shows up.

- **Insights: many more templates, with the words you actually logged woven
  in (Pitch)** — rubric not yet scored (no `evaluateFromContext` run against
  this entry). User, 2026-09-03: "a lot more variety, so it doesn't feel like
  'I've read this last week or last month'." Today there are seven fixed
  sentence skeletons (`src/content/insights.ts`) and two show a week, so
  repeats are structural. Direction: templates that quote the reader's own
  logged words and families across check-ins AND the practices (a judgment
  sitting's uncovered feelings, a practice's kept conclusion), not counts.
  Constraints unchanged: gentle, ends in an invitation, ≤2 cards/week,
  local-only. Enabler already in place: `insightStore` keeps every past
  week's cards (PR #97 renders only the newest week), so a template-recency
  memory can avoid re-showing a shape someone saw last month. Pitch-tier
  under CLAUDE.md sizing → `/forge:plan` first; the forge skills were not
  loaded in the 2026-09-03 session, so no pitch doc exists yet.

- ~~**Insights-report follow-ups (2026-09-03)**~~ — **(a) and (b) shipped
  2026-09-03, PR #99**, with the month card on the weekly pattern and every
  mark tinted by the current mood from the same review. (a) became
  anti-pattern #10 (reading text never below `body`; check-in flow hints and
  field-guide essences, previews, footer → body, the family key → label).
  (b) became anti-pattern #9 (`useMeasuredHeight` on every screen's title
  row; `noHandTunedOffsets.test.ts`; regression log #31).
  **(c) shipped 2026-09-03, PR #103** — the frame those three shared is now
  `ScreenFrame`, worn by all seven page screens in both states, with
  anti-pattern #11 and a source sweep to hold it. Nothing left open here.

- **Usage analytics — third sanctioned-exception decision needed** — rubric
  not yet scored (no `evaluateFromContext` run against this entry). User wants
  to know within the next few weeks which features/moods are most used and
  whether the app is understandable enough to avoid silent abandonment.
  Scoped, not decided: `memory/decisions/adr-002-usage-analytics.md` proposes
  event-level-only analytics (screen views, feature taps, session
  starts/onboarding drop-off) — explicitly narrower than "which moods," since
  that touches the exact data this app promises never leaves the device.
  Recorded provisionally in `docs/SECURITY.md` → "Usage analytics" as
  PROPOSED, not counted toward the "TWO sanctioned exceptions" line until
  accepted. **Blocking on the user:** tool choice (Aptabase vs. PostHog EU),
  and whether "features, not moods" is an acceptable answer. Do not bundle
  into the in-flight crash-reporting or Play Store submission work — own PR,
  after acceptance. *Owner: user (decision), then agent (implementation
  plan in the ADR).*

- ~~**Install the app icons from the logo handoff**~~ — shipped 2026-07-13,
  PR #14 (`e862632`). The on-device look (2026-08-31) failed it: the pastel
  mark was unrecognizable in the share tray, so the shipped icons were redrawn
  in the vivid register at full opacity with the adaptive mark scaled to the
  66% mask (design-feedback PR, 2026-08-31). That overshot — "I just wanted it
  slightly more saturated but still opaque. This is solid" (user, 2026-09-02)
  — so the mark was retuned to the middle register: pastel mixed 55% toward
  vivid, translucent (0.85 + multiply) with the thread outlines restored so the
  overlaps deepen and it reads as layers again; the 66%-mask geometry is
  untouched. Then, later on 2026-09-02, the user handed over the identity
  canvas's **four-band** primary mark (amber · rose · mauve · blue, pastel,
  translucent) and it was installed everywhere the coloured mark is drawn —
  every icon PNG, the splash, the in-app `LogoMark` (four bands now, same
  geometry as the icon), `appicon_ink.svg` and the `var_*` variants. The
  monochrome outline was first held back ("not the black and white one"),
  then brought to four bands too on 2026-09-03 ("it needs to be 4 bands
  too"): `icon_mono.svg`, `LogoDivider` and the Quilt `TabIcon` all draw
  `LogoMark`'s `LOGO_BANDS`, so every drawing of the mark is one shape. Then,
  same day, the installed launcher icon read "too large and is being cut off
  top and bottom" — the adaptive-foreground SVG had an erroneous
  `scale(1.18)` (carried over by habit from the old three-band mark's
  `scale(0.79)` shrink, never recomputed for the new geometry) that pushed
  the mark past Android's ~66% adaptive-icon safe zone. Dropped — the bare
  mark is the designer's bands unscaled, already 55%×60% of the canvas
  (regression log #32). Verification moves to the device-test queue (the
  icons need a fresh APK — no OTA path; the in-app drawings show in Expo Go).

- **Clean on-device verification pass of the v0.2.0 redesign** — rubric **7/12**.
  Full walkthrough of Quilt cloth, Insights depth, Circle, judgment
  multi-select, and Experiments in Expo Go. The last device session was cut
  short by a dev-server connectivity error (regression-log #6) before a clean
  pass. *Owner: user (device); agent preps Metro.*

## P2 — soon

- **Publish The Mood Layer to Google Play (indie route)** — rubric **6/12**
  (impact 3/3; costed down by external Play Console setup + dependencies).
  **Re-decided 2026-07-18 — the org/DUNS route is OFF.** DUNS is for registered
  organizations; publishing happens as an **individual** instead: a personal
  Google Play developer account ($25 one-time), then Google's 2023+ individual
  requirement of a **12-tester / 14-day closed test** before production. The
  personal account now exists (confirmed 2026-08-20) and CI already builds +
  uploads the AAB — but **parked (user's call, 2026-08-19)**: not the current
  focus, so the remaining setup (upload keystore, Play service account, four
  repo secrets) isn't being worked. Until it's resumed, sideloading the CI APK
  stays the distribution — including for circle members who want the peer-app
  pairing. Exact steps for resuming: manual runbook →
  "Publish to Google Play (indie route) — parked". *Owner: user.* (Supersedes
  the 2026-07-12 "direct under Tessellate org, DUNS applied" decision.)
  **Data-safety form (added 2026-08-13):** the listing must declare **"Crash
  logs — collected, optional, not linked to identity"**. Opt-in crash
  reporting shipped that day (`memory/decisions/adr-001-crash-reporting.md`),
  and the form is the only place that fact becomes visible outside the app's
  own Settings copy. Nothing else in the declaration changes: no analytics, no
  accounts, and the circle relay carries only the user's own gated summary.

## Post-launch — verify after v0.2.0 is live

- **Verify "Name it" reminders on a real device** — rubric **8/12**.
  *User-designated post-launch (2026-07-13): ship first, verify reminders after.*
  Local-notification reminders no-op in Expo Go (expo-notifications removed
  SDK 53+, regression-log #4), so this shipped feature has never actually run.
  `eas.json` is now scaffolded (dev/preview/production profiles); EAS login is
  done. Remaining: `eas build --profile development --platform android`, install
  on device, confirm a reminder fires + deep-links into the check-in flow.
  Tradeoff to note: launching first means the reminder path ships unverified —
  low blast radius (it fails silently/no-ops rather than crashing), which is why
  post-launch is reasonable. *Owner: user. How-to: `docs/manual-runbook.md`.*

## P3 — later

- **Three more drawings of the mark and its chrome could collapse into one**
  — deferred from the 2026-09-03 quality pass on PR #103, all shape, no bug.
  (a) `LogoDivider` hand-draws `LOGO_BANDS` a third time; widening LogoMark's
  `ink` to accept a per-band array would make it `<LogoMark register="ink"
  ink={BAND_INK} />`. (b) The field guide, Reflections and Settings each
  copy-paste the same back-arrow + title row, already drifted (Settings sizes
  its icon button differently) — a `BackHeader` beside the existing
  `ModalHeader` would end it, and would tidy the multi-line `header={` JSX the
  frame conversion left behind. (c) The Insights screen runs two `FlatList`s
  that differ only in data/renderItem/header/footer, the empty one being a
  ScrollView in a list's clothes. Worth doing together, next time any of them
  is opened for another reason.

- ~~**CoachNote owns its anchor**~~ — **done 2026-09-03, PR #103**, by
  `ScreenFrame`: the frame measures its own title row and passes the offset,
  so a page screen cannot mount a note against an unmeasured anchor.
  `topOffset` is still a public prop on CoachNote (the frame is its only
  caller), and CoachNote still re-derives the frame's `insets.top +
  spacing.md` for its own absolute position — one duplicated expression,
  noted in the quality pass and left alone rather than reworking the note's
  positioning contract in a spacing PR.

- **A pause after "take a moment" cards — timer, reminder, or reward** —
  user, 2026-09-03: backlog for now. When an insight invites the reader to
  sit with something ("Worth taking a quiet moment to appreciate"), offer a
  way to actually stay — a short undisturbed timer or a gentle reminder — and
  some real benefit for having done so. Two written rules push back and the
  pitch has to answer them before anything is built: "never directive"
  (CLAUDE.md tone rule) and "a count is scoreboard-shaped"
  (`monthlyDigest.ts:97`, anti-pattern #3: no guilt copy). A reward system is
  the exact shape those rules exclude, so the benefit has to be the moment
  itself (dim the page, the breathing animation, nothing counted), not a
  score or a streak.

- **Further de-overwhelm interactions for word pickers** — folded-by-default
  family groups shipped 2026-07-13, PR #12 (`f7cb894`) (user feedback: nine
  open families read as a wall). Candidates if the feel step still feels
  heavy: a "words you've
  used lately" row at the top (zero scrolling for regulars — convenience, not
  a streak); a family-first two-step flow (pick 1 of 9 families → see only
  its 6 words); a type-to-find filter (fits the typewriter voice; typing may
  itself be work when overwhelmed — test with users); body-first entry
  ("where do you feel it?" → suggest families from the sensation).

- **Check in with any field-guide word** — the field guide's word finder
  (v0.2.x, `src/content/vocabulary.ts`) is education-only: ~70 wheel words are
  browsable but not selectable in a check-in, so the feel step stays a short,
  nameable list. If users want the precision in their quilt, make word-finder
  words selectable (ids are already unique across gradients + extended, and
  `findVocabularyWord` already resolves both, so no data migration — swap the
  check-in's label lookups from `findEmotionWord` to `findVocabularyWord` and
  design how ~90 chips stay navigable). Also consider a "more words →" doorway
  from the check-in feel step into the guide.

## Done / retired

- ~~**Install rubric-sdk for pulse scoring**~~ — done 2026-07-12; superseded
  2026-07-17 by `@tessellate-studio/forge` (PR #21, `07e84af`) after rubric-sdk
  was merged into forge. Pulse scoring is numeric.
