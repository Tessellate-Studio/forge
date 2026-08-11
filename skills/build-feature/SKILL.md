---
name: build-feature
description: >-
  Implement and VERIFY a feature, fix, or change end-to-end — iterating
  autonomously until the user's ask is objectively met. Covers UI changes
  (layout, spacing, typography, colours, copy — verified on a real device via
  OTA) AND non-UI changes (backend, data-flow, tooling, config — verified via
  TDD + test suite green + code review). Use this whenever the user asks to
  build, change, or fix something in any Tessellate app — e.g. "fix the home
  screen spacing", "add the API endpoint", "the data migration is wrong",
  "redesign the empty state", "fix the build script". Trigger even when they
  don't say "feature" or "skill": any change that should be verified before
  handing back belongs here. For UI changes, the skill measures the result
  against acceptance criteria from a device screenshot and keeps iterating
  until it passes. For non-UI changes, acceptance criteria are test-based
  (Steps 3-4 are skipped; the test suite + code review are the verification
  bar).
---

# Build a feature in alate — implement, then verify on-device until it's actually right

## Why this skill exists

The expensive failure mode when building UI is declaring "done" on a change you
*believe* works but haven't actually looked at — so the user has to run the app,
spot the defect, screenshot it, and prompt you again. That round-trip is pure
waste, and it erodes trust. The whole job of this skill is to flip that: **you**
look at the rendered result on the real device, **you** measure it against what
the user asked for, and **you** keep iterating until it objectively passes —
before you hand it back.

A UI ask is not met when the code compiles and tests pass. It's met when the
pixels on the device match the user's intent. Those are different bars, and this
skill holds you to the second one.

## The loop in one picture

```
clarify ask → acceptance criteria → TDD + implement → tsc + jest green
   → publish OTA → apply on device → screenshot → MEASURE vs criteria
       ├─ all criteria pass → commit → report (with the screenshot)
       └─ any fail → adjust → republish → re-screenshot   (repeat, autonomously)
```

You own the bottom branch. Don't exit the loop by asking the user to check —
exit it by verifying yourself.

---

## Step 0 — Preflight (don't skip)

1. **Read the platform standards.** Before any code, read the shared guardrails
   that apply platform-wide:
   `${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md` (no hardcoded
   colours/fonts/alphas, no hooks below a conditional return, WCAG 2.1 AA, elastic
   layouts, end-to-end shipping, …) and
   `${CLAUDE_PLUGIN_ROOT}/standards/authoritative-claims.md` (cite a source or
   label a hypothesis).
2. **Bug-fix? Read the app's regression log first.** If this is fixing reported
   behaviour, read the app's in-repo `memory/project_regression_log.md` end to end
   and its domain `memory/project_anti_patterns.md`. Patch from a matching entry
   rather than re-discovering.
3. **Branch placement.** If the change doesn't belong on the current branch, cut
   `feat/<slug>` or `fix/<slug>` off the default branch automatically — don't ask.
   Keep code commits separate from doc commits.
4. **Respect frozen scope.** If the user has said "don't touch X", do not modify
   those screens — even incidentally.
5. **Read before editing.** Know the screen's current structure and its theme
   tokens (the app's `constants/theme.ts` — spacing, typography, alphas, colors).
   The app's design vision lives in its `memory/project_design_vision.md`.
6. **Map the integrations, then verify the smallest shippable slice FIRST.**
   Before building the full feature, write a 5-line **integration map** — the
   things that silently sink a build when discovered late:
   - **Endpoints** it calls or adds (which repo owns each?)
   - **DB tables/fields** it reads or writes (check the app's data-ownership
     contract before adding any column)
   - **Env vars / secrets** it needs (are `LOOM_API_URL`-shaped secrets
     actually set, locally AND in CI/deploy?)
   - **Other repos** whose code or contract this touches (shared types, testID
     contracts, composed endpoints)
   - **Breaking changes** to anything an existing consumer reads
   Then confirm how many real accounts/stores/devices you can test against, and
   which flow ships *instantly* vs which needs a release/OTA/deploy. Build and
   verify that smallest end-to-end slice against the real external system
   before stacking the rest — it reshapes the phasing (lead with the path that
   works today) and surfaces the "it no-ops because a var is unset" failures
   before they cost a full build cycle. *Precedent: a two-phase size-finder
   built in full before confirming the quiz path shipped instantly while the
   app-handoff path needed an OTA + a deep-link scheme in the installed binary —
   knowing that up front would have led with the cheap path.*
7. **Planning gate — size the decision, document it if non-trivial.** Run
   the sizing guide (`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/sizing-guide.md`).
   Tactical → skip or quick ADR. Feature-scope → Shape Up Pitch with research.
   Architecture → RFD with full research. Planning doc must exist before Step 1
   (acceptance criteria). Trivial changes: one-line skip note.
8. **Greenfield or multi-phase build? Render on a device BEFORE stacking
   phases.** As soon as the scaffold + theme produce a first screen, put pixels
   on a real device/emulator — don't build N more phases on top of an unseen
   base. Unit tests mock every native module, so they cannot catch import-time
   native crashes, silent font fallbacks, or third-party chrome ignoring theme
   fonts. Precedent (2026-07-07, The Mood Layer v1): 13 phases built blind on
   190 green tests; the first real launch red-screened on an IMPORT-time
   expo-notifications crash in Expo Go, and the entire display typeface had to
   be swapped after the fact — both visible in minute one on a device.

## Step 1 — Turn the ask into ACCEPTANCE CRITERIA, and clarify real forks

Before building, write down 2–5 **objective, checkable** criteria — the things
you'll measure on the screenshot to decide pass/fail. Vague goals ("looks
balanced") cause the endless-iteration trap; concrete ones end it. Express them
as positions/proportions you can eyeball from a screenshot:

- "Wordmark sits within the top ~15% of the screen."
- "No empty vertical band taller than ~10% between the button and the visual."
- "Primary action is the highest-contrast element below the hero."
- "Content fills to ≥~80% of the screen height; bottom margin ≤ ~15%."
- "Tab labels legible (white text on the pill, no wash-out)."

State these back to the user in one line so they can correct your reading of
their intent early — that's far cheaper than discovering the misread after a
build.

**Clarify genuinely ambiguous design decisions up front** with AskUserQuestion —
the forks where two reasonable answers diverge the whole result (e.g. "button
high vs button anchored low", "lavender vs deep-purple nav"). Give 2–4 concrete
options with short ASCII/preview sketches. Don't ask about things with an obvious
default or that you can verify yourself — pick those and move on. One good
question now beats three correction rounds later.

If you're in plan mode, this is where the plan + AskUserQuestion belong; exit
plan mode only once the approach is settled.

## Step 1.5 — Multi-agent build (conditional — Pitch/RFD tier only)

If the planning gate (Step 0, item 7) sized this as **Pitch or RFD tier** AND
the workflow script exists at
`${CLAUDE_PLUGIN_ROOT}/references/workflows/researched-build.js`, delegate the
build (Steps 2–4) to the multi-agent pipeline instead of building single-handed.
Invoke the **Workflow** tool with:

- `scriptPath: "${CLAUDE_PLUGIN_ROOT}/references/workflows/researched-build.js"`
- `args: { tier, criteria, rendersUI, task, context, reviewScriptPath }` —
  `tier` is `'pitch'` or `'rfd'`; `criteria` is the Step 1 acceptance criteria;
  `rendersUI` is whether the change puts pixels on screen; `task` is the ask;
  `context` carries the repo + framework notes; `reviewScriptPath` is
  `"${CLAUDE_PLUGIN_ROOT}/references/workflows/adversarial-review.js"` so the
  RFD review phase reuses it as a nested sub-workflow. Pass `args` as a JSON
  OBJECT, never a JSON-encoded string — a stringified args reaches the script
  as one string and severs it from its inputs.

**`rendersUI: true` REQUIRES `context.verify.publish` and
`context.verify.capture`.** The workflow returns an error and spawns no agents
without them — those two can't be reverse-engineered cheaply, and a wrong guess
measures the wrong build. Everything else is optional and discovered from the
repo when absent:

```
context: {
  repo: 'loom',
  verify: {
    surface: 'the embedded admin page /app/settings in the dev store',
    publish: 'npm run deploy:dev',
    apply:   'hard-reload the embedded admin page so the new bundle loads',
    capture: 'browser screenshot of the embedded admin iframe at 1280x800',
    confirm: '`shopify app versions list` shows the version id you just pushed',
    measure: '% of the 1280x800 viewport',
  },
}
```

Every repo's differ — alate's are the EAS/adb loop in
`references/device-loop.md`, loom's are the Shopify ones above. `apply` and
`confirm` are optional but are the two people leave out, and leaving them out is
how a run measures the *previous* build and reports it as a verdict on this one
— supply them when you know them. A step can be a list of commands, not just
one. Full contract:
`${CLAUDE_PLUGIN_ROOT}/references/agents/verifier-prompt.md`.

If a change genuinely shouldn't be measured on a surface, pass
`rendersUI: false` — don't pass `true` with a made-up `publish` to get past the
check.

The workflow runs researcher → tester (failing tests) → implementer (worktree) →
reviewer (adversarial; a multi-lens panel + skeptic verification for RFD) with a
fix loop → verifier (on-device, UI only) with a fix loop. It returns the diff,
test results, review verdicts, and verification measurements. When it returns,
**skip to Step 5.5** — the build + verify are done; you own integration, commit,
and PR (Step 6).

**Fall back to single-agent (Steps 2–4 below) when:** the tier is ADR / tactical
/ trivial, the workflow script is absent, or the change is small enough that
orchestration overhead isn't worth it. Don't over-orchestrate a one-file fix.

## Step 2 — TDD, implement, keep the suite green

Work in `mobile/`.

1. **Write/extend the test first** (`src/__tests__/<Screen>.test.tsx` or
   `screenSmoke.test.tsx`). Assert the new behaviour — presence/absence of an
   element by `testID`, gating by state, copy. Watch it fail for the right
   reason. **Never remove or rename an existing `testID`** without updating
   litmus's contract — they're the E2E contract.
2. **Implement** using theme tokens, not literals. For layout that must adapt to
   screen size, prefer proportional flex over fixed pixels (it's the whole point
   of flex). For empty/variable states, decide where leftover space goes
   deliberately — a single flex region, not eyeballed margins.
   - *Recommended once the screen renders:* run `/design-system` to catch
     hardcoded colours/fonts/alphas and naming drift against the design system
     before you burn an OTA cycle — far cheaper to fix pre-device. Reinforces the
     "theme tokens, not literals" rule above. Skip with a one-line note for a
     trivial copy-only change.
3. **Typecheck + test**: `npx tsc --noEmit` then `npx jest --no-coverage`. Both
   green before you publish — a broken bundle wastes a whole device cycle.

## Step 3 — Verify on the real device (the part people skip)

alate ships JS via **EAS Update (OTA)**. The test device runs a **preview** build
on the **`preview`** channel — it does NOT connect to Metro/fast-refresh, so the
only way your change reaches it is an OTA on its channel. Read
`references/device-loop.md` for the exact commands, the runtime-fingerprint
caveat, and recovery steps. The essentials:

1. **Publish** to the channel the device actually reads:
   `eas update --channel preview --environment preview --message "..." --non-interactive`
   (run `npx tsc --noEmit && npx jest --no-coverage` first — the script
   `npm run ota:preflight` bundles those gates).
2. **Apply on device** — expo-updates downloads in the background and swaps in on
   the *next* launch, so it's a **double-relaunch**: force-stop → launch (wait
   ~22s for the download) → force-stop → launch (now running the new bundle).
3. **Screenshot** with `adb exec-out screencap -p` and **Read** the PNG. Confirm
   the running update is yours (logcat shows the `branchName: preview` +
   updateGroup you just published) if anything looks stale.

If the device shows the populated state when you need the empty state (or vice
versa), that's data-dependent — note it and don't wipe the user's data to force a
state without asking.

## Step 4 — Self-verify against the criteria, and iterate AUTONOMOUSLY

This is the heart of the skill. With the screenshot open:

1. **Measure each acceptance criterion.** Estimate element positions as a % of
   screen height/width from the image (e.g. "wordmark top edge ≈ 10%", "button
   centre ≈ 52%", "gap between button and visual ≈ 21%"). Compare to the
   criteria. Write the verdict per criterion (pass/fail) — actual numbers, not
   "looks fine".
2. **If any criterion fails, fix it and run the loop again** — adjust the code,
   re-run tsc+jest, republish, re-apply, re-screenshot, re-measure. Keep going
   **without handing back to the user**. The user should not be the one to notice
   the gap is still there; you should, because you measured it.
3. **Watch for repeating the same miss.** If two iterations don't move a
   criterion, your model of the cause is wrong — step back and diagnose from the
   actual layout (e.g. "the flex spacer is *between* the two elements, so it
   *creates* the gap"), don't nudge the same knob again.
4. **Only report done when every criterion passes**, and include the final
   screenshot + the measured verdicts so the user can confirm against their own
   eyes. "Done, verified on device: wordmark at ~10%, button at ~50%, no band
   >8%, content fills ~85%" — that's the shape of a trustworthy report.

## Step 5 — Be honest about structural limits

Some asks can't be satisfied by tweaking spacing because the content is the
constraint (classic: "fill the screen, no gaps" when there are only two small
elements — flex can distribute space but can't fill space that has no content).
When you hit a wall like this, **say so plainly and present options** (grow the
content, add content, anchor to an edge, accept intentional negative space)
rather than guessing repeatedly. One honest "here's why, here are the choices"
beats five silent failed nudges.

## Step 5.5 — Polish the diff before committing (quality pass)

Once every acceptance criterion passes on-device, run a quality pass on the diff
before you commit. **This step is not UI-specific — it applies to every
non-trivial diff this skill or any other work produces (backend, data-flow,
tooling included);** skip with a one-line note for a true one-liner:

1. `/code-review` — surfaces correctness bugs plus reuse/simplification/efficiency
   cleanups in the current diff. Triage and fix what's real.
   - **Large diff from a single-agent build?** If the diff is > ~50 lines AND it
     did NOT already go through `researched-build` (which reviews internally),
     run the deeper **adversarial-review** workflow instead: invoke the Workflow
     tool with `scriptPath:
     "${CLAUDE_PLUGIN_ROOT}/references/workflows/adversarial-review.js"` and
     `args: { diffPath, files, criteria, crossRepo }` — write the diff to a temp
     file and pass its absolute path as `diffPath` (re-encoding a large diff
     inline risks corrupting it), plus the changed-file list as `files` so
     reviewers verify they're looking at the right change before judging. Pass
     `args` as a JSON OBJECT, never a stringified one. It runs parallel
     multi-lens reviewers and refutes each finding with independent skeptics, so
     only confirmed issues survive. Fall back to `/code-review` if the workflow
     script is absent.
2. `/simplify` — applies reuse/efficiency/altitude cleanups (quality only, no bug
   hunt). Re-run `npx tsc --noEmit && npx jest --no-coverage` after it touches
   code, since it edits the working tree.
3. **UI diffs only:** `/design-critique` on the final device screenshot —
   structured feedback on hierarchy, spacing, consistency against the app's
   design vision (for alate: glassmorphic, theme tokens, Marcellus headings).
   Fix what's real, re-verify on-device. (For NEW web/screen surfaces built
   from scratch, `/frontend-design` guides the initial build back in Step 2 —
   not a post-hoc check.)
4. Commit the cleanups separately (`chore: simplify <scope>`) — don't fold them
   into the feature/fix commit.

Full platform rule: `${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` → "Quality
pass before commit".

## Step 5.7 — Pre-merge E2E gate (litmus) — smoke subset only

For a change that touches a **user-facing flow** (skip for backend/config/
copy-only diffs), gate the merge on fast, reliable checks — **never** the full
E2E suite. This is the industry standard, not a cost shortcut: Google's 70/20/10
test pyramid and merge-queue practice both hold that a flaky full suite blocks
good PRs and destroys feedback speed, so the bulk of E2E runs *post*-merge.

1. **testID contract** is already enforced by the reviewer (Step 5.5, or the
   `researched-build` review phase): a renamed/removed testID that litmus depends
   on is a hard block — its paired litmus PR must land first.
2. **Smoke subset:** if litmus exposes a `@smoke` critical-golden-path job,
   trigger just that (`gh workflow run <litmus-smoke> --ref master`), target
   < 10 min, and block the merge on red. If no smoke job exists yet, skip this —
   the full suite runs post-merge (Step 6, item 5).

## Step 6 — Commit and wrap

1. Commit code and docs separately, on the feature branch, with a message that
   says what changed and why (end with the repo's Co-Authored-By trailer). Only
   commit/push when the change is verified and the user is happy — don't push to
   `master` directly.
2. **Open the PR ready (not draft) and merge it on green** — don't park a
   verified, green PR waiting for a manual look; a stale branch drifts out of
   sync and collects conflicts. Hold only for the carve-outs (outward-facing /
   hard-to-reverse, or an explicit user hold). Full rule:
   `${CLAUDE_PLUGIN_ROOT}/standards/anti-patterns.md` → "Merge on green by default".
3. **Update the source doc in the SAME PR.** If this feature/fix originated
   from a tracked item — a BACKLOG.md entry, a regression-log row, a RELEASE
   checklist line, a runbook TODO — update that entry before reporting done:
   status (DONE + date) + PR number, and the merged SHA once it lands. A shipped
   change whose entry still says "open" is how work gets re-done and the user
   has to re-ask. Full rule: `${CLAUDE_PLUGIN_ROOT}/standards/workflows.md` →
   "Status update on completion".
4. If the change has reached the user via OTA, remember the
   pre-production-verification discipline (BACKLOG P1): test on dev/preview, never
   push UI straight to `production` as the way to find out it's wrong.
5. **Post-merge full E2E (litmus) — advisory.** After the merge lands on
   `master`, trigger the FULL litmus suite (`gh workflow run <litmus-e2e> --ref
   master`). It does NOT block (the change already merged): on red, log a
   regression-log entry, open an implementer fix PR, and bisect — don't revert
   reflexively. This is where the bulk of E2E coverage runs, per the pyramid.
   Skip only for changes that touch no user-facing flow.
6. Report with the **bottom line first**, the measured verdicts, the screenshot,
   and only the sections that have real content (per the repo's communication
   style). If you added a regression-worthy fix, log it.
7. **Worktree cleanup.** Before reporting done, prune stale git worktrees left
   by this session or earlier ones. Run `git worktree list` — any worktree
   whose branch is merged or whose path sits outside `.claude/worktrees/` and
   is no longer needed gets `git worktree remove --force <path>`. Then
   `git worktree prune` to clear dangling refs. On Windows, deeply-nested
   React Native build caches may exceed MAX_PATH — use `subst Z: <parent>;
   cmd /c "rmdir /s /q Z:\<dir>"; subst Z: /d` as a fallback for orphaned
   directories that `git worktree remove` can't delete. Don't leave worktree
   directories cluttering the project's parent folder.

## Step 7 — Closing retro (MANDATORY — answer in the final report, don't skip)

End every feature build by answering these three questions, honestly and
grounded in evidence from THIS session — not generic hedging. They exist
because the most expensive failures are the ones the confident final report
papers over (precedent, 2026-07-03 Mood Layer build: an OAuth flow that was
unit-tested green on every piece failed on the first real embedded install —
the least-confident area was known but never said out loud; and the backend
deploy pipeline had been failing silently for 18 days, which the user had no
way to know).

1. **What am I least confident about right now?** Name the specific seams that
   were never exercised for real (integration points, flows verified only by
   unit tests or mocks, environments never touched). "Nothing" is almost never
   the honest answer. For each: what would exercise it, and what failure would
   look like.
2. **What's the biggest thing the user doesn't realize?** Surface the systemic
   or situational fact the user can't see from the diff or the demo — a silent
   pipeline failure, an inert-until-X switch, a dependency chain where failures
   are indistinguishable, a cost/limit about to be hit. If discovering it needs
   one cheap check (a workflow-run list, an env listing), RUN the check before
   answering.
3. **What would have made this session more efficient?** Concrete, both sides:
   what the agent should have done differently (e.g. build the smallest
   end-to-end slice FIRST and verify it against the real external system before
   stacking chunks on top) and what the user could do differently next time
   (steps that could have been parallelized, information that arrived late).

Route the answers, don't just state them: an unexercised seam worth
protecting → regression log or a test; a user-invisible systemic risk → fix it
or land a runbook/BACKLOG entry; an efficiency lesson that generalizes →
promote into the relevant skill or standard so the next build inherits it.

---

## Quick reference

- Run app commands from `mobile/`.
- Tests: `npx jest --no-coverage` (must stay green; ~520+ tests).
- Types: `npx tsc --noEmit`.
- Publish OTA (preview): `eas update --channel preview --environment preview --message "..." --non-interactive`.
- Device loop details, adb discovery, fingerprint caveat: **`references/device-loop.md`**.
- Theme tokens: the app's `constants/theme.ts`. Shared guardrails:
  `${CLAUDE_PLUGIN_ROOT}/standards/`. App-specific anti-patterns + design vision:
  the app's in-repo `memory/`.
- `/design-system` — after the screen renders (Step 2): catch hardcoded
  values / naming drift before an OTA cycle.
- `/code-review` — before commit (Step 5.5): correctness bugs + cleanups in the diff.
- `/simplify` — before commit (Step 5.5): apply reuse/efficiency/altitude cleanups.
  Step 5.5 applies to ANY non-trivial diff, not just UI.
- `/design-critique` — before commit (Step 5.5, UI diffs): critique the final
  device screenshot against the design vision; fix + re-verify.
- `/frontend-design` — during build (Step 2, NEW web/screen surfaces): design
  guidance for the initial implementation, not a post-hoc check.
- Status update (Step 6): BACKLOG / regression-log / runbook entry that spawned
  this work gets its status + PR + SHA updated in the same PR.
- Worktree cleanup (Step 6): `git worktree list` → remove stale → `git worktree prune`.
- Closing retro (Step 7, mandatory): least-confident seams / what the user
  can't see / what would've been faster — answered with evidence, then routed
  (test, runbook entry, or skill update).
