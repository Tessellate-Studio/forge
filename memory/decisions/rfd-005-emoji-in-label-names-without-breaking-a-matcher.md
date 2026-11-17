# RFD 005: Emoji in label names, without breaking a single matcher

**Date:** 2026-11-17
**State:** discussion
**Author:** Claude (alate session), for the owner

## Background

The owner wants GitHub labels to carry the same emoji as the report markers
(`~/.claude/CLAUDE.md` legend, owner 2026-11-16), so a label pill reads like a
report line: `🐛 bug`, `🚨 P0`, `👀 needs-human`. Asked on 2026-11-17 whether
the emoji should go in label NAMES or only in descriptions, the owner chose
**names**, with emojis that **match the markers where they overlap**.

Today every label is a bare name from one registry, `tools/labels/lib/labels.js`
(RFD 004 §2–§3), synced into each repo by `tools/labels/bootstrap.js`. Code in
every repo matches those bare names as strings. A survey on 2026-11-17 (grep for
label contexts: `-l`, `--label`, `label:`, `labels: [...]`, quoted P/needs
names) found:

| Repo | Files | Matches | Where |
|---|---|---|---|
| forge | 30 | 116 | `labels.js`, issue-form templates, `device-test` scripts (`enqueue.js`, `queue-lib.js`), `hooks/lib/device-test-summary.js`, `backlog-migrate`, `work-item`, standards and skill prose, tests |
| alate | 17 | 88 | 4 issue forms, 8 workflows (`auto-label.yml`, `ci.yml`, `ci-backend.yml`, `ops-alert.yml`, `pr-close-label-guard.yml`, `supabase-migrations.yml`, `vercel-deploy.yml`, `build-android-apk.yml`), `scripts/auto-label.cjs` + test, `CLAUDE.md`, backlog-migration data |
| loom | 7 | 40 | 4 issue forms, `.roadmap-pulse-state.json`, backlog data, one test |
| mood-layer, badige | not surveyed | | same issue forms and labels from `canonicalFor` |

Plus everything outside code: scheduled-task prompts, CLAUDE.md links
(`label:P0,P1`), and what sessions type by hand (`gh issue list -l P1`).

**Why a plain rename is dangerous.** GitHub matches a label name exactly
(case-insensitive). After `bug` becomes `🐛 bug`:
- `gh issue list -l needs-human` returns nothing, with exit code 0. `dtq` would
  report "0 need a human"; the triage query would read empty. Nothing errors.
- `addLabels(['bug'])` on a name the repo lacks **creates** a new plain `bug`
  label (seen while building alate #1915; `auto-label.cjs` now filters through
  `onlyExisting` for this reason). Every unconverted writer mints a duplicate.
- Issue forms silently drop a `labels:` entry the repo does not have
  (`labels.js` header comment), so forms would file unlabelled issues.

That is the same shape as alate regression row 2026-11-17e: a change one place
silently breaks a consumer somewhere else, and nothing goes red.

## Prior Art

Research pass 2026-11-17 (researcher agent; A = authoritative, P = practitioner,
C = community).

### How others solve this
- **Kubernetes `label_sync`** (A, https://github.com/kubernetes/test-infra/blob/master/label_sync/README.md):
  one YAML registry for every repo, plain prefixes (`kind/bug`, `priority/P0`),
  no emoji. A `previously:` field renames in place when only the old label
  exists, and when BOTH exist moves the issues across and removes the old one;
  `deleteAfter` retires a label on a timer. Adopted here (Proposal §4).
- **Open edX** (P, https://discuss.openedx.org/t/all-repos-have-a-core-set-of-labels-available-now-and-your-labels-may-have-changed/10258):
  renamed a core label set across the org; labels moved on issues
  automatically, but project-board filters naming old labels stopped matching.
  They **removed** emoji and punctuation "to simplify things". Evidence against
  this RFD's goal; the owner's choice stands, with the matcher risk handled.
- **Locke Data** (P, https://itsalockev2.netlify.app/posts/2018-07-12-emojify-gh):
  added emoji (shortcodes) to label names across many repos with PATCH; no
  labelled issue lost. Delete-and-recreate would have unlabelled everything.

### Existing tools/libraries
- **GitHub REST labels API** (A, https://docs.github.com/en/rest/issues/labels):
  `name` and `new_name` accept native emoji or `:shortcode:` markup (its own
  example: `"new_name": "bug :bug:"`). Only the description has a stated
  limit (100 characters). Rename = PATCH with `new_name`, which forge's
  `bootstrap` already does (`gh.editLabel(... newName)`, `bootstrap.js:39`).

### Known pitfalls
- **No alias for an old name** (A, silent: https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels):
  nothing documents a redirect. Hypothesis: after a rename, `label:bug` and
  `-l bug` return nothing (verify in step 4 on one repo first).
- **Adding an unknown name creates a label** (staff-confirmed docs gap,
  https://github.com/github/docs/issues/35718): colour `ededed`, no
  description. Any writer missed by the move silently revives a bare label.
- **Issue forms drop unknown labels silently** (A,
  https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms).
- **Dependabot** (A, https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference):
  creates `dependencies` and the ecosystem label itself and skips custom
  `labels:` the repo lacks. Hypothesis: renaming `dependencies` would make it
  recreate the bare one, so this RFD does not touch Dependabot's labels.
- **Variation selectors** (C, https://github.com/mathiasbynens/emoji-regex/issues/68):
  the same visible emoji can be one code point or two (with U+FE0F), so
  `♻️` / `♻` are different strings. Hypothesis: GitHub does not normalise
  them, so a hand-typed `label:"♻️ refactor"` can miss. See open question 3.
- **Search has no wildcard or contains** (C, https://github.com/refined-github/refined-github/issues/3494):
  a dashboard cannot match "anything with bug in it"; every saved query and
  link must carry the exact new name.

## Proposal

Separate the **key** a program matches on from the **name** a person reads,
make every matcher resolve key → name, prove no bare key is left, and only
then turn the emoji on, in one registry change.

### 1. Registry: a stable key and a display name

Each entry in `labels.js` gains a `key` (today's bare name, never changes) and
keeps `name` (what GitHub shows). A new map gives the emoji:

```js
const EMOJI = {
  bug: '🐛', feature: '✨', chore: '🧹', refactor: '🔁',
  P0: '🚨', P1: '🔴', P2: '🟡', P3: '🟢',
  'needs-triage': '🔎', 'needs-human': '👀', decision: '🟣',
  'needs-build': '🔧', parked: '💤', failed: '❌',
  mobile: '📱', backend: '💻', scraper: '🧲', 'fit-engine': '📏', infra: '🧰',
};
const EMOJI_NAMES = false; // the one switch (step 4)
```

`name = EMOJI_NAMES && EMOJI[key] ? `${EMOJI[key]} ${key}` : key`. Labels
without an entry (device-test, claimed, needs-input, on hold, …) keep their
names. Exports: `labelName(key)` and `labelKey(name)` (strips a known emoji
prefix, so `labelKey('🐛 bug') === labelKey('bug') === 'bug'`).

Marker overlap, per the owner: 🐛 bug, 🚨 P0 (urgent), 👀 needs-human (needs a
human), 🟣 decision (decision made / to make), 🟡 P2 (the marker's "watch"),
💤 parked (the marker for "nothing to do, skipped"). Every emoji in the map
is ONE code point with no U+FE0F (owner, open question 3), so the name a
person types in search is the name GitHub stores.
`needs-decision` in the preview is a legacy alate label that duplicates the
canonical `decision` (same description, `gh label list`, 2026-11-17); the
emoji goes on `decision`, and `needs-decision` is folded into it (open
question 1).

### 2. Matchers resolve by key, so order stops mattering

Every reader and writer goes through the key:
- **Reading** (is this issue a P1?): compare `labelKey(name)`, never the name.
  Works before AND after the rename, so consumers can merge in any order.
- **Querying** (`gh issue list -l`, search `label:`): look the name up from the
  repo's live labels by key first (`resolveLabel(repo, key)`), then query.
- **Writing** (`addLabels`, `gh issue create --label`, issue forms):
  JS writers resolve against the repo's live labels by key and never send a
  name the repo lacks (the `onlyExisting` rule from alate #1915, made
  general). Static YAML that cannot resolve at runtime (issue forms,
  workflow `labels:` lists, Dependabot `labels:`) is **generated** from the
  registry (`tools/issue-forms` already generates forms) or updated in the
  flip PR of that repo, guarded by the lint below.

Forge consumers `require` the registry. App repos cannot require forge in CI
(only the app repo is checked out), so each app gets a generated
`.github/labels.json` (key → name) written by `bootstrap --write-json`, and
its scripts read that file; a test in each repo compares it to the live
labels.

### 3. A lint that makes "no bare key" a rule, not a hope

A forge check (`tools/labels/lint.js`, run in each repo's cheap CI) fails on
a canonical key used as a label literal in a label context (the survey regex,
hardened: `-l`, `--label`, `--add-label`, `--remove-label`, `label:`,
`labels:` lists, `addLabels`/`removeLabel` args) outside the registry and the
generated JSON. Prose in standards and skills is updated to name the key and
say "resolve it", and the lint covers fenced shell examples in Markdown too,
because agents copy those.

### 4. The flip: one registry change, then bootstrap renames and sweeps

When the lint is green in every repo, set `EMOJI_NAMES = true` in one forge
PR. `bootstrap` already renames through `editLabel(... newName)`, which keeps
the label on every issue and PR (to verify, research Q1). Run it per repo,
then regenerate each repo's `labels.json`. Readers that compare by key never
notice; writers resolve the live name. Rollback is the same switch set back
to `false` and bootstrap run again.

Each renamed entry records `previously: ['<key>']` (Kubernetes `label_sync`).
On every bootstrap run, if a bare `<key>` label exists ALONGSIDE the emoji
one (a missed writer revived it, research: unknown names are auto-created),
bootstrap moves its issues and PRs to the emoji label, deletes the bare one,
and prints what it moved. A revived label is then a logged event, not a quiet
duplicate. Saved searches and project-board filters are listed in step 4's
checklist (Open edX lost theirs).

### Security model

No change. Labels are metadata; the GitHub token scopes already in use cover
`editLabel`.

## Alternatives Considered

- **Emoji in descriptions only.** Nothing breaks, but the emoji shows only on
  hover and in the labels list, not on the pill. The owner chose names.
- **Plain rename now, fix fallout as it shows.** Fast, but every failure is
  silent (empty lists, minted duplicates, unlabelled form issues). Nobody
  would see it until a queue was found empty. Rejected for the same reason as
  regression row 2026-11-17e.
- **Keep both labels (bare and emoji) for a while.** Doubles every pill and
  needs every writer to add two labels; triage and queues would count twice.
  The key-resolution approach gets the same "works during the move" without
  it.
- **GitHub shortcode names (`:bug: bug`).** Depends on research Q3. Matching
  stays ASCII, but whether labels render shortcodes is unverified.

## Implementation Plan

1. **forge: registry keys + resolver + lint** (`labels.js` `key`/`labelName`/
   `labelKey`/`resolveLabel`, `EMOJI` map with the switch off, `lint.js`,
   `bootstrap --write-json`). No visible change. One PR.
2. **forge: consumers resolve by key** (device-test scripts, device-test
   summary hook, work-item, backlog-migrate, roadmap-pulse, issue-form
   generator, standards/skills prose). Lint green in forge. One PR, version
   bump.
3. **alate, loom, mood-layer, badige: one PR each.** Generated
   `labels.json`, scripts read it (`auto-label.cjs`), workflows' `labels:`
   resolved or generated, issue forms regenerated, CLAUDE.md links, lint in
   cheap CI. Still no visible change.
4. **Flip.** `EMOJI_NAMES = true` (forge PR), `bootstrap` per repo, regenerate
   each `labels.json` (one small PR per repo, or one forge-driven sync).
   Verify: `dtq` counts, triage query, `auto-label` on a test PR and a test
   issue, one issue filed through each form.
5. **Scheduled-task prompts and memory notes** that type `-l <key>`: update to
   resolve, or to the `wi`/`dtq` commands that already resolve.

## Decided

Owner, 2026-11-17, answering the four open questions below with "Yes, all
four" (the recommendations):
1. alate's `needs-decision` is folded into the canonical `decision` in step 3.
2. Only the labels in the map get emoji for now; others stay bare until asked.
3. Single-code-point emoji only: 🔁 refactor, 💤 parked, 💻 backend,
   🧰 infra, 🧲 scraper (the map above already uses them).
4. Native emoji, not `:shortcode:` names.

## Open Questions (answered, kept for the record)

1. **Fold `needs-decision` into `decision`** (alate only, same description)?
   Recommended: yes, rename-merge in step 3, emoji on `decision`.
2. **Which other labels get emoji?** The owner's set covers types, P,
   statuses and alate areas. device-test, claimed, needs-input, owner-replied,
   on hold, security, loom's areas: leave bare, or add now? Recommended: leave
   bare until asked; the switch makes adding one a one-line change.
3. **Emoji that need a hidden U+FE0F character** (♻️ refactor, 🅿️ parked,
   🖥️ backend, 🛠️ infra, 🕸️ scraper): scripts are safe either way (they match
   by key), but a person typing `label:"♻️ refactor"` can miss if their
   keyboard sends the other form. Recommended single-code-point swaps, chosen
   to match the markers where possible: 🔁 refactor, 💤 parked (the marker for
   "nothing to do, skipped"), 💻 backend, 🧰 infra, 🧲 scraper. The owner's
   pick.
4. **Shortcode names** (`:bug: bug`, the REST docs' own example): ASCII to
   match, no FE0F issue, but a person types `:bug:` in search and what GitHub
   stores versus renders is unverified. Recommended: native emoji with the
   swaps in question 3.
