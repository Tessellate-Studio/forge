# RFD 004: A device test is a GitHub Issue, not a comment

**Status:** Accepted (user, 2026-09-09) · **Tier:** RFD (multi-repo, changes a
shared contract, hard-to-reverse migration) · **Supersedes:** the queue-medium
half of [ADR-003](./adr-003-device-test-queue.md)

## Background

ADR-003 put the device-test queue in **one pinned issue per app repo, items as
comments**. That medium has since needed five separate repairs, and every one
of them was the same class of defect: *the queue has no state of its own, so
state had to be simulated in prose, and prose drifts.*

| forge PR | What it repaired |
|---|---|
| #79 | Items with no `**Status:**` line were invisible — two were live OPEN tests, one for over a week |
| #80 | A bold opener counted as a title only when the body looked like a test |
| #81 | Heading glyph + test id stamped into the heading, because the issue page could not be read without expanding every comment |
| #102 | The queue's own bookkeeping (📦 OTA notices, 🔒 claims, corrections) reported as format violations — 27 of them on alate#562, growing daily |
| #117 | A comment stacking two tests hid the second entirely; four were stacked in one comment on alate#562 |

Every one of these is a consequence of the medium. A comment has no state, no
assignee, no labels, no close event, and no identity until after it is posted —
so the format invented all five in markdown:

- **state** → a `**Status:**` line, parsed by prefix, with four legal values
- **who is needed** → a `HUMAN:` prefix inside the Steps prose
- **identity** → the comment's own id, stamped into the heading by a second
  API call after posting
- **at-a-glance state** → a heading glyph mirroring the Status line, which
  drifts the moment either is edited without the other (43 had drifted as of
  2026-09-09)
- **one test per record** → convention only, unenforceable until #117

GitHub Issues have all five natively. `standards/workflows.md` → "Device-test
queue" is currently ~140 lines of format specification; most of it exists to
rebuild what an issue already is.

### What ADR-003 actually decided, and what it did not

ADR-003 rejected two alternatives, for reasons that do **not** apply here:

- a shared queue **file** — rejected for the shared-doc contention documented
  in `anti-patterns.md` → "Concurrent branches collide in content";
- a queue **in forge** — rejected because forge is public and items describe
  unreleased features.

Its stated reasons *for* comments were "comments never merge-conflict across
concurrent worktree branches" and "issues put zero files in the repo". **Both
are equally true of issues-per-test.** One issue per test was never weighed
against comments; it is a medium the ADR did not consider, not a decision it
made and this RFD reverses.

Verified 2026-09-09: alate, badige and loom are PRIVATE; mood-layer and forge
are PUBLIC (`gh repo view --json visibility`). Tests stay in the app repos, so
no item changes visibility under this proposal, and the "forge is public"
constraint that ruled out queue-in-forge is untouched.

## Proposal

**A device test is one GitHub Issue in the app's own repo**, labelled
`device-test`, linked to the PR that shipped the change.

| Today (comment) | Proposed (issue) |
|---|---|
| `**Status:** OPEN` | issue is open |
| `**Status:** ✅ done <date>` | issue is closed as completed |
| `**Status:** ❌ failed → <link>` | issue closed as not-planned, linked to the bug it became |
| `**Status:** 🔧 needs build — <what>` | label `needs-build` |
| `HUMAN:` prefix in Steps | label `needs-human` |
| heading glyph 🤖/🙋/🔧/⚪/🔴 | GitHub's own open/closed + the two labels |
| test id stamped by a 2nd API call | the issue number |
| `**PR:** #n` field | a real linked PR / "closes" reference |
| notes under `---` rules | ordinary issue comments |
| one comment per test (convention) | one issue per test (structural) |

### What this deletes

`expectedGlyph`, `headingDrift`, `statusState`, the four-value Status
vocabulary, the glyph table, the id-stamping two-call enqueue, and the restamp
pass in SKILL.md Step 0.3 — roughly half of `queue-lib.js` and the largest
section of `standards/workflows.md`.

### What this keeps

- **`itemHeadingCount` (#117).** An issue *body* can stack two `### 🤖`
  headings exactly as a comment could. The detection moves; it does not die.
- **`maskCode` / `findStatus` discipline.** Steps and Expect are still prose
  that other prose quotes.
- **The 🔒 device claim**, unchanged in mechanism — see Open Question 1.
- **`needs-runtime` / delivery**, as issue-body fields. These are genuinely
  free-text and gain nothing from being labels.

## Alternatives considered

- **A comment on the shipping PR.** Rejected: a PR closes on merge, so "still
  needs testing" would have to live in a label anyway, and the record would be
  buried in a merged PR nobody reopens. It also cannot hold a test that
  outlives its PR, which is most of them.
- **One PR per test.** Rejected: every test would cost a branch, a PR and a CI
  run, and CI minutes are already a shared org-wide constraint
  (`anti-patterns.md` → "A build that runs without being asked for").
- **Keep comments, keep hardening the parser.** This is the status quo and the
  table above is its track record: five PRs, each correct, each fixing a defect
  the medium made possible. #117 was posted-and-broken within a day of #102.

## Migration

Decided with the user 2026-09-09: **migrate the 21 open tests, archive the
closed ones.**

1. Create the `device-test`, `needs-human`, `needs-build` labels per repo.
2. For each of the 21 open items, open an issue carrying the body verbatim,
   with the labels its parsed state implies, linking back to the source
   comment; edit the source comment to point forward.
3. Unpin the queue issue, retitle it `Device test queue (archived — see the
   device-test label)`, and post a closing comment pointing at the label.
   **Do not lock it** — Open Question 1.
4. Cut over `dtq`, the SessionStart hook, and the drain skill in one PR, so
   there is never a window where the board reads one medium and the drain
   writes the other.

## Open questions

1. **Where does the 🔒 device claim live?** It is currently a comment on the
   queue issue (`claim-lib.js:13`), and locking that issue would block it.
   Options: keep the (unpinned, unlocked) queue issue as the claim's home; or
   give the claim its own pinned `Device claim` issue per repo. Leaning to the
   latter — it is what the claim already is, and it stops the archive being
   load-bearing. **Blocks step 3 of the migration, nothing else.**
2. **crash-monitor floods.** Verified 2026-09-09: `skills/crash-monitor/SKILL.md:77`
   runs `gh issue list --state open` with **no label filter**, so 21+
   device-test issues would enter its triage input every run. It must exclude
   the label. This is a required companion change, not a follow-up.
3. **`wip` work-claim board.** Same shape of question — does a device-test
   issue belong on the work board? Probably not; it is not work someone claims
   until a drain picks it up.

## Consequences

- Closing a test becomes closing an issue: no Status line to edit, no glyph to
  restamp, no id to stamp, and no way to hide a second test inside the first.
- `dtq` becomes a rendering of `gh issue list --label device-test`, and the
  SessionStart hook a count of the same.
- The board's three warning counters (unparseable, stacked, heading drift)
  collapse to one that can still fire: a test-shaped issue whose labels
  contradict its body.
- Per-repo label setup becomes a prerequisite for a repo joining the queue —
  the self-healing block in `workflows.md` grows two `gh label create` lines.
