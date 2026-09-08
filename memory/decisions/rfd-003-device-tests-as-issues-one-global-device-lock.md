# RFD 003: Device tests as issues; one global device lock

**Date:** 2026-09-08
**State:** discussion
**Author:** Saptami Ram (with Claude)
**Tracking:** [forge#107](https://github.com/Tessellate-Studio/forge/issues/107)
**Supersedes:** [ADR-003](./adr-003-device-test-queue.md) — the queue *medium* only. Its
three constraints (below) are kept in full.

## Background

ADR-003 (2026-08-18) put every on-device test in one pinned GitHub issue per
app repo, as a comment in a fixed markdown format, and made a forge skill
(`skills/device-test/`) drain them. It chose comments for three reasons that
still hold: comments never merge-conflict across concurrent worktree branches;
issues put zero files in an app repo, so nothing can leak into the package;
and the queue could not live in forge because forge is public and items
describe unreleased features.

Three weeks later the medium is failing on four independent axes, all
observed on 2026-09-07/08 and all traceable to one cause: **a comment is not
a first-class object.** It has no state, no labels, no assignee, no native
link to a PR, no per-item thread, and no stable identity until it exists.

1. **Unreadable.** alate's queue issue (#562) holds 70 comments
   (`gh api --paginate …/issues/562/comments --jq length` → 30 on page one,
   70 in total). `dtq` flagged 27 as not matching the format — many of them
   the queue's own bookkeeping: `### 🔒 Device claim` (5507399380) and
   `### 📦 production OTA published` (5496068550). A human cannot skim it,
   and the count rises with every drain because a released claim and a passed
   test are only *minimized* — GitHub's `minimizeComment` is a UI affordance
   and leaves the comment fully present in the REST feed.
2. **The lock is per-repo; the device is singular.** Each queue issue carries
   its own `🔒` claim. One session on 2026-09-07 claimed alate#562 *and*
   mood-layer#66 separately. An alate drain and a mood-layer drain would each
   read their own repo's claim, each see it free, and both drive the same
   handset. The collision that actually happened that day was two sessions on
   alate, 16 seconds apart, and it wiped the user's saved body profile to
   fresh onboarding.
3. **Acceptance criteria go stale silently.** Twice a drain filed a bug
   against correct code: alate#708 (the item's Expect predated PR #678, which
   deliberately moved men's chest chips to build words) and the Expect on item
   5572382793 (PR #711 had split the copy the item quoted). A comment has no
   native cross-reference to the PR it verifies, so nothing in GitHub's
   timeline shows that a later PR touched the same surface.
4. **Identity is fragile.** Tests are referenced by comment id
   (`5513098991`) from filed issues, from spawned fix-session prompts, and
   from the wrap-up tables the user reads. Any re-post — the weekly rotation
   proposed and retired this week would have required one — breaks every one
   of those references. The id also does not exist until the comment does,
   so enqueue is two calls (post, then stamp the id into the heading).

Two adjacent gaps are already filed and this design is the substrate for
both: [forge#104](https://github.com/Tessellate-Studio/forge/issues/104)
("verified on device" is a claim a PR self-declares; nothing checks it
against a queue item before Merge-on-green) and
[forge#100](https://github.com/Tessellate-Studio/forge/issues/100) (a drain
that stops at the first failed step records nowhere that steps 2–5 never
ran).

Sized as an RFD: five repos (alate, mood-layer, badige, loom, forge), a
shared contract in `standards/workflows.md`, three consumers of the parser
(`dtq`, the SessionStart hook, the drain skill), and a migration with
data-loss risk.

## Prior Art

Research ran via the plan skill's protocol (three rounds, researcher agent,
2026-09-08). Findings labelled by source tier; the researcher's own
against-signals are carried into "Known pitfalls" rather than smoothed over.

### How others solve this

- **Kubernetes SIG Testing — flaky-test tracking**
  (https://github.com/kubernetes/community/blob/main/contributors/devel/sig-testing/flaky-tests.md):
  one issue per test, titled `[Flaky test] <TestName>`, labelled `kind/flake`,
  and a dedup rule — *"if an open issue is found for the same flake, a comment
  should be added instead of making a new issue."* Authoritative. The
  search-before-create step is the piece a naive issue-per-test design omits.
- **GitHub — sub-issues, issue types, advanced search (GA 2025-04; `gh`
  support 2026-06)**
  (https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/,
  https://github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli/):
  first-party primitives for breaking a large tracker into linked child issues
  instead of comment threads. Confirmed available on this org by GraphQL
  introspection: `Issue` exposes `subIssues`, `parent`, `issueType`,
  `closedByPullRequestsReferences`, `linkedBranches`. Authoritative.
- **GitHub — linking a PR to an issue**
  (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue):
  a plain `#N` reference in a PR body or comment produces a visible
  cross-reference on the issue's timeline; a closing keyword additionally
  closes it on merge. Authoritative. This is the native form of "which PR does
  this test verify", and of "which later PR touched it".
- **GitHub — filtering issues with advanced search**
  (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests):
  `is:issue is:open label:device-test` narrows server-side across a repo (or
  an org with `org:`). Authoritative. GitHub's own issue list becomes the
  human-readable board; `dtq` becomes a renderer of the same query.
- **dotnet/sdk — issue-mapping table after a repo split**
  (https://github.com/dotnet/sdk/blob/ViktorHofer-patch-1/documentation/issue-mappings/README.md):
  old references are preserved with a checked-in alias table, not by
  preserving ids. Practitioner. The pattern for comment-id → issue-number.

### Existing tools/libraries

- **forge `createClaimProtocol`** (`tools/work-claim/lib/protocol.js:117`):
  one parameterised claim implementation — heading glyph, `**Field:**` lines,
  HELD/RELEASED, a `Last touch` heartbeat, "waiting on a human never
  expires", latest-comment-wins resolution, fail-open on an unreadable
  timestamp. The 🚧 work claim (`tools/work-claim/lib/claim.js:101`) and the
  🔒 device claim (`skills/device-test/scripts/claim-lib.js:77`) are already
  its two variants. The `wip` CLI (`tools/work-claim/cli.js`) gives
  `claim/touch/release/sweep/scan` over it, and `hooks/work-claims.mjs` reads
  it at session start. **Nothing new is needed to express the lock; only its
  subject changes.**
- **forge `queue-lib.js`** (`skills/device-test/scripts/queue-lib.js`): the
  one parser behind `dtq`, `hooks/device-test-status.mjs` and the drain. Its
  `collect()` → `{key, items[], claim}` shape is what the consumers depend on,
  not the comment format. Note its `REPOS` table (line 22) lists alate,
  mood-layer, badige — loom is absent, yet loom#88 exists with the label.
- **GitHub Marketplace mutex actions** — `label-mutex`
  (https://github.com/marketplace/actions/label-mutex) locks with a label and
  has no timeout; `gh-action-mutex` (https://github.com/ben-z/gh-action-mutex)
  gets a true compare-and-set from git's fast-forward-only push to a lock
  branch. Practitioner. Neither documents heartbeat or crashed-holder
  recovery. The branch-push CAS is the one genuinely atomic primitive GitHub
  offers and is kept here as the escalation path.
- **GitHub REST pagination**
  (https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api):
  30 items per page by default, 100 max. Authoritative. Reproduced on
  alate#562: 30 vs 70. A per-test issue's own comment thread stays small, so
  the footgun mostly disappears; every remaining list call uses `--paginate`.
- **GitHub REST rate limits**
  (https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api):
  5,000 req/h primary; secondary ~900 points/min (writes cost 5), 80
  content-creating requests/min. Authoritative. Four repos, a handful of
  concurrent sessions, and a ≤5-minute heartbeat sit far inside this.

### Known pitfalls

- **A heartbeat lock reduces the race window; it does not remove the race.**
  Kleppmann's fencing-token argument
  (https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html,
  authoritative): a holder that pauses past the timeout can resume and act
  after another holder took over, unless *the resource itself* rejects stale
  holders. An agent turn that thinks for minutes without heartbeating is the
  same failure as a GC pause. Design consequence: the lock must be re-checked
  at the point of use (before device-driving actions), not only at claim time
  — and the heartbeat interval must be a small fraction of the stale window
  (AWS DynamoDB lock-client discussion,
  https://github.com/awslabs/amazon-dynamodb-lock-client/issues/34,
  practitioner).
- **No compare-and-set on GitHub issue writes was found.** ETag/`If-Match`
  is documented for conditional GETs
  (https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api);
  no evidence of write-side CAS on labels or comments. *Unverified negative* —
  treated as absent. Design consequence: claim resolution must be
  deterministic without CAS. GitHub comment ids are server-assigned and
  monotonic, which gives a total order without clock skew: the lowest live
  claim id wins.
- **`minimizeComment` is UI-only**
  (https://github.com/orgs/community/discussions/19865, community): it
  collapses a comment for humans and leaves it in the API feed. Any design
  that keeps a machine-parsed comment list and "closes" items by minimizing
  inherits today's noise. Design consequence: done = GitHub closed state, not
  a hidden comment.
- **Traceability links go stale as a matter of course**
  (https://www.drizz.dev/post/requirements-traceability, vendor content —
  informed community consensus, not authority): the failure mode is endemic,
  and the mitigation is a *revalidation signal*, not a one-time link. Design
  consequence: a static `Verifies:` field is necessary but not sufficient; the
  drain keeps its pre-verdict staleness check, and the enqueue rule requires
  a PR that deliberately changes covered behaviour to amend the open test.
- **`gh issue create --template` does not apply the template's labels**
  (https://github.com/cli/cli/issues/875, community, open). Design
  consequence: labels are always passed explicitly on `--label`; no reliance
  on template defaults. (Templates are not used anyway — see zero-files.)
- **`gh label list` caps at 30 without pagination**
  (https://github.com/cli/cli/issues/8596, community). Audits of the label
  taxonomy use `gh api --paginate`.
- **adb itself has multi-client hazards** (OpenSTF,
  https://github.com/openstf/stf/issues/428, community): even a perfect
  GitHub-side lock does not serialise the transport. Advisory remains
  advisory; what the lock removes is ambiguity, which is the part that
  failed.
- **Research gaps, stated honestly:** no authoritative source was found on
  Firebase Test Lab / AWS Device Farm lease internals; one on-topic article on
  multi-agent PR races returned 403 and was not read; the "100 labels per
  issue" figure seen in community sources was not traced to GitHub docs.

## Proposal

Four subsystems: the queue medium, traceability, the device lock, and
migration. Each keeps ADR-003's three constraints: **no files in app repos,
nothing about unreleased features in public forge, no merge conflicts across
concurrent branches.** Issues satisfy all three exactly as comments did.

### 1. Queue medium — one issue per test, in the app's repo

**Identity.** A test is a GitHub issue in the repo whose change it verifies.
Its id is the issue number: `alate#712`. That id exists at creation, is
stable forever, is a live link anywhere in the repo, and is what filed bugs
and fix-session prompts reference. Comment ids stop being test ids.

**Classification by label, state by GitHub.** One label marks the kind
(`device-test`, colour `5319e7`, the colour `device-test-queue` already
uses); a small set marks the situation. GitHub's open/closed state and close
reason carry the verdict. Nothing is parsed out of prose.

| Situation | Issue state | Labels | Today's glyph |
|---|---|---|---|
| Pending, agent-runnable | open | `device-test` | 🤖 |
| Pending, needs a person | open | `device-test` `needs-human` | 🙋 |
| Blocked on a native build | open | `device-test` `needs-build` | 🔧 |
| Parked by decision | open | `device-test` `parked` | 🅿️ |
| Failed; bug filed | **open** | `device-test` `failed` | 🔴 |
| Passed | closed, reason `completed` | `device-test` | ⚪ |
| Withdrawn / superseded / invalid | closed, reason `not_planned` | `device-test` | — |

A failed test stays **open**, labelled `failed`, linking the bug it produced.
It is retired only when a later drain re-runs it after the fix lands and it
passes — the rule forge PR #93 introduced, now expressed as "an open issue
with a `failed` label is re-checked every drain". `needs-human` is derived
at enqueue from the presence of `HUMAN:` steps (as today) and may be added by
a drain that downgrades an item. `needs-build` is the marker the weekly build
task reads (unchanged semantics; different medium).

**Body = the same fields, one container up.** The fixed format from
`standards/workflows.md` → "Device-test queue" survives with two changes:
`**Status:**` is deleted (state is native), and `**Verifies:**` replaces
`**PR:**` (§2). Steps are written as a GitHub task list so per-step progress
is native and visible — the answer to forge#100's "nothing records that
steps 2–5 never ran":

```markdown
- **Verifies:** #703 (`8d3ce08`) — closes #685
- **Delivery:** production OTA — group a48c3b96 · **Needs runtime:** 1.3.1
- **Steps:**
  - [ ] 1. Delete any history entry for the URL (trash → Remove)
  - [ ] 2. `adb shell am start -a android.intent.action.SEND … restock-cardigan`
  - [ ] 3. Wait ~40s; read STOCK; scroll under the stats divider
- **Expect:**
  1. STOCK renders `—` in grey — not `✕`, not `?`
  2. A line under the divider: "their sizes stop at L — your measurements are past their range"
  3. NO notify-me card — its presence is a FAIL
```

A drain ticks a step's box when it runs it, whether it passed or not; the
verdict is the issue's state. A step a drain deliberately did not run stays
unticked, so "never ran" is visible without reading prose.

**Notes are comments.** Drain observations, snapshots before a profile
mutation, corrections, the human-confirmed TalkBack pass — ordinary comments
on the test's own issue, in reading order. No `---` rule, no parser boundary,
no "fields above, notes below" convention to drift.

**Enqueue.** `gh issue create --repo … --label device-test[,needs-human]
--title "[device-test] <intent>" --body-file <generated>`. The body is
generated by forge (`dtq enqueue`, §5) from the fields the shipping session
supplies — so the template lives in forge, and **no `.github/ISSUE_TEMPLATE`
file enters an app repo** (zero-files constraint; also sidesteps the
`--template` label gap). Before creating, the helper searches
`is:issue is:open label:device-test "<intent slug>"` and, on a hit, appends
to that issue instead — the Kubernetes dedup rule. The `[device-test]` title
prefix is for skimming notification lists and PR sidebars; the label is what
tooling reads.

**Listing.** One search per repo:
`gh api --paginate "search/issues?q=repo:Tessellate-Studio/<repo>+is:issue+is:open+label:device-test"`.
`queue-lib.collect()` keeps its `{key, items[], claim}` shape, populated from
labels and state instead of parsed comments, so `dtq`, the SessionStart hook,
and the drain skill change nothing about how they *consume* it. `REPOS` gains
loom. There is no "unparseable" bucket: an open issue carrying `device-test`
without the body fields is one row ("missing fields") — a drain repairs it
by asking the PR, not by guessing.

**Bot notices.** `eas-update.yml` today posts `### 📦 production OTA
published` on the queue issue. It will instead comment on each open
`device-test` issue whose `Verifies:` PR is in the published range — the
test learns its delivery arrived, which is the only reader that notice ever
had. Device claims leave the queue entirely (§3). With both gone, nothing
non-test is ever posted where tests live.

### 2. Traceability — a test knows its PR, and the PR knows its test

- **`**Verifies:** #<PR> (<sha>)`** is a required body field, written as a
  plain reference (never a closing keyword — the PR is usually already merged,
  and a test must not be closed by the thing it verifies). GitHub renders the
  cross-reference on the PR's timeline automatically. Every later PR or
  issue that mentions the test number appears on the test's timeline. That
  is the visibility the comment medium could never have: when PR #678 changed
  the chest chips, a test issue referencing #662 would have shown #678 in its
  timeline the moment #678's body said "supersedes the chip vocabulary from
  #662 / test alate#N".
- **A PR that deliberately changes behaviour an open test covers must amend
  that test in the same PR** — edit the Expect, add a comment, or close it
  `not_planned` with the reason. Rule text lands in `standards/workflows.md`
  next to the enqueue rule; the shape is the existing "if your change makes a
  doc claim stale, fix it in the same PR" rule applied to tests.
- **The drain keeps its pre-verdict staleness check** (added 2026-09-08 after
  #708): before filing a failure, list merged PRs since the test was opened
  that touch the relevant paths, read the shipped constants/tests, and if the
  behaviour is deliberate, amend the test and pass against the corrected
  criteria. Timeline cross-references make this a lookup rather than a
  search.
- **forge#104 becomes buildable.** With tests as issues, "verified on device"
  can be checked: a UI PR must reference a `device-test` issue, and
  Merge-on-green can require that issue to be closed `completed` (or the PR
  to carry `device-unverified`). That gate is its own issue and is listed
  under Implementation Plan as a follow-on, not part of this RFD's commit.

This is honest about its limit: the link is structural; *detecting* that a
later PR made an Expect stale is still procedural (the rule + the drain's
check). No system found in research does better than a revalidation signal.

### 3. One lock, one device, outside every queue

**Where.** A dedicated **private** repo, `Tessellate-Studio/devices`, holding
one pinned issue per physical device, titled by serial (`804KPSL1724518 —
Pixel, Android`). It is private because a claim names what is being tested;
it is outside every app repo because the device is not an app's; it is not in
forge because forge is public. Zero files anywhere. (Open question 1 offers
an existing private repo as the alternative.)

**What.** The existing 🔒 variant of `createClaimProtocol`
(`claim-lib.js:77`), posted on the device's issue instead of a queue issue.
Same fields, same HELD/RELEASED, same `Waiting on: human` never-expires rule,
same 30-minute silence rule — the semantics the standard already documents in
"Claiming the device" are unchanged; only the subject moves. The `claimed`
label goes on the device issue while held (so the devices repo's issue list
*is* the board), removed on release, swept by `wip sweep` when a claim goes
silent — all existing behaviour of the work-claim tooling.

**Race resolution without CAS.** Two hardening rules, both cheap:

1. **Post, then re-read.** After posting a claim, wait ~5 s and re-read every
   HELD claim on the issue. If another HELD claim has a **lower comment id**,
   release your own and stand down. Comment ids are server-assigned and
   monotonic, so both racers reach the same answer with no clock involved —
   the 16-second race on 2026-09-07 resolves deterministically in one round
   trip.
2. **Re-check at the point of use.** Before each device-driving step (a
   launch, a tap sequence, a profile mutation) the drain re-reads the lock
   and aborts if it no longer holds the lowest live claim. This is the
   nearest available thing to a fencing token; the true form — the device
   rejecting stale holders — is not available over adb. Heartbeat every
   ≤5 minutes (it already piggybacks on the PATCHes a drain makes), so a
   normal agent turn never falls into the 30-minute stale window.

**Launch-time check.** The launching session — not only the agent it spawns
— reads the device issue immediately before spawning a drain, and treats a
"no live background children" completion notice as *not* evidence that a
descendant has stopped (the exact misreading behind the 2026-09-07
collision; forge PR #93 carries the skill-text change).

**Escalation, stated now so it is not re-argued later.** If a collision
recurs despite (1) and (2), the next layer is the one genuinely atomic
primitive GitHub offers: a fast-forward-only push to a `lock` branch in the
devices repo (`gh-action-mutex`'s mechanism), with the issue comment kept for
human visibility. Not built now — enforcement before the guidance has failed
is over-fitting to one bad day, the same judgement forge#94 records.

### 4. Migration — nothing open is lost, every old reference resolves

**Inventory (2026-09-08, `gh api --paginate`, non-done items only):**

| Queue | Live items | Of which | Done (stays put) |
|---|---|---|---|
| alate#562 | 9 | 1 iOS/human-only · 1 routed elsewhere · 1 `❌ failed` · 1 new today · 2 correction comments folding into one item | 21 |
| mood-layer#66 | 6 | 1 `🅿️ parked` · 1 `🔧 needs build` | 12 |
| loom#88 | 1 | — | 0 |
| badige#63 | 0 | — | 0 |

Sixteen issues to create. Done items are history and are not migrated; the
legacy issue is closed, unpinned, and kept as the archive.

**Mechanism** — a forge script (`dtq migrate <repo> [--dry-run]`) that, per
legacy queue issue:

1. Parses every non-done item with today's `queue-lib` (it is the last thing
   that parser does).
2. Creates the new issue: title from the heading's intent text verbatim,
   labels from the Status line (`OPEN` → none / `needs-human` if `HUMAN:` /
   `🔧` → `needs-build` / `❌` → `failed` / `🅿️` → `parked`), body = the
   original fields with `**Status:**` removed and `**Verifies:**` set from
   `**PR:**`, and a first line: `Migrated from <old comment URL> (comment
   5513098991)`. Notes below the `---` rule become comments, in order.
3. Edits the old comment: appends `---\n**Migrated →** alate#712` and sets
   `**Status:** ➡️ migrated → #712` (its heading glyph becomes ➡️, a notice
   glyph, so the old parser skips it).
4. Posts a final comment on the legacy issue: the full alias table
   (`old comment id → new issue`), then closes and unpins it.

**Verification gate.** Before step 4 the script asserts that the set of
comment ids it migrated equals the set of non-done items it parsed at step 1,
re-fetched fresh, and refuses to close the legacy issue on any mismatch. The
dry run prints the exact table it would create. Both are the difference
between "meant to lose nothing" and "cannot lose anything".

**Old references.** Two lookups work forever: the alias table on the closed
legacy issue, and `gh search issues "5513098991"` (the migrated-from line is
in the new body). Spawned fix-session prompts already in flight name comment
ids; those sessions find the new issue by the second lookup.

### 5. What changes where

| Surface | Change |
|---|---|
| `standards/workflows.md` → "Device-test queue" | Enqueue = `gh issue create`; body fields; label table; the amend-your-test rule; `**Status:**` and the glyph table retired |
| `standards/workflows.md` → "Claiming the device" | Subject becomes the device issue in the devices repo; post-then-re-read and re-check-at-use rules; launch-time check |
| `skills/device-test/SKILL.md` | Step 0 lists by label; Step 3 verdicts = close / label; drift repair collapses to "missing fields"; Scope table gains loom and real checkout paths |
| `skills/device-test/scripts/queue-lib.js` | `collect()` from search-by-label; same return shape; `REPOS` + loom; comment parser retained only inside `migrate` |
| `skills/device-test/scripts/status-board.js` (`dtq`) | Renders the same shape; item id is `repo#N`; gains `enqueue`, `claim/touch/release`, `migrate` subcommands (the last is removed after migration) |
| `hooks/device-test-status.mjs` | Unchanged consumer |
| `skills/device-test/scripts/claim-lib.js` | Points at the devices repo; adds the two race rules |
| App repos (alate, mood-layer, badige, loom) | Labels created on first use (self-healing, as today); `eas-update.yml` notice target (alate) |
| `Tessellate-Studio/devices` | New private repo; one pinned issue per device |
| Weekly build task | Reads `needs-build` label instead of the Status marker |

## Alternatives Considered

- **Rotate the pinned issue weekly** (proposed 2026-09-07, retired the same
  day). Keeps every comment-medium weakness and adds a migration every week;
  it solves only readability, and only until the next thread grows.
- **Keep comments; fix the parser.** The parser bug (it flags its own
  notices) is real and worth fixing regardless, but fixing it leaves the
  per-repo lock, the absent PR link, and the fragile ids untouched — three of
  the four failures.
- **A GitHub Projects board as the queue.** Adds a surface and an API; items
  still need a home issue. Fine as a *view* later; it is not a medium.
- **Sub-issues under a per-repo parent "Device test queue".** Attractive
  hierarchy and GA on this org, but the parent becomes the same mega-object
  the thread was, and PRs cannot be parents. Kept as an optional grouping
  (e.g. per release) once the medium is issues.
- **All tests in one central private repo.** Simplest cross-repo listing,
  but breaks `#N` adjacency to the PR and the app repo's own labels and
  regression log. Rejected for tests; adopted for the *lock*, which is the
  one thing that is genuinely not per-app.
- **Issue templates in each app repo.** Violates zero-files and `gh` does not
  apply template labels anyway. The body is generated by forge instead.
- **Lock by assignee or `gh issue lock`.** Neither is CAS; assignees are
  limited to collaborators; conversation lock is idempotent. Rejected.
- **Lock by fast-forward push to a branch (true CAS) now.** The correct
  escalation, deliberately deferred — advisory + deterministic resolution is
  expected to hold, and the standards prefer not to build enforcement ahead
  of a demonstrated failure of guidance.

## Implementation Plan

Ordered by dependency; each is a PR that ships alone. Version bumps in
`.claude-plugin/plugin.json` per forge convention.

1. **Global device lock** — create `Tessellate-Studio/devices` (private) with
   the pinned device issue; point `claim-lib.js` at it; add post-then-re-read
   and re-check-at-use; `dtq claim/touch/release`; update "Claiming the
   device". Independent of the queue medium and the highest safety value —
   ships first. Effort: small.
2. **Parser v2 behind the existing shape** — `queue-lib.collect()` reads
   label-based issues; during transition it also reads legacy comments so
   `dtq` and the hook show both; `REPOS` gains loom. Tests over fixtures for
   each label state. Effort: medium.
3. **Standard + skill rewrite** — "Device-test queue" and SKILL.md as in §5;
   `dtq enqueue` with dedup-before-create; the amend-your-test rule. Effort:
   medium. (Rebased on forge PR #93, which touches the same SKILL.md
   sections.)
4. **Migration** — `dtq migrate --dry-run` per repo, reviewed by the user,
   then run; legacy issues closed with alias tables. Effort: small to write,
   careful to run. Runs once per repo: alate, mood-layer, loom (badige is
   empty).
5. **Notices** — `eas-update.yml` comments on affected test issues.
   Effort: small. (alate only today.)
6. **Retire legacy** — remove the comment parser and `migrate`; retire the
   `device-test-queue` label and this ADR-003 medium text. Effort: small.
7. **Follow-ons, each its own issue:** forge#104 (Merge-on-green requires a
   closed `device-test` issue or a `device-unverified` label on UI PRs);
   forge#100 (task-list steps make "not run" visible; the drain's continue-
   past-failure rule lives there); the `dtq` bot-notice parser fix already
   chipped, which step 2 subsumes.

## Open Questions

- [ ] **Where does the device lock live** — a new private `devices` repo (this
  proposal), or an existing private repo (`litmus`?) with one pinned issue?
  New repo is cleanest; reuse avoids a repo. — needs input from Saptami.
- [ ] **Failed tests stay open** (this proposal, matching PR #93's re-check
  rule) or close-and-reopen on fix? Open keeps them on the board; some prefer
  a closed test to mean "this run ended". — needs input from Saptami.
- [ ] **Label names** — `device-test`, `needs-human`, `needs-build`, `failed`,
  `parked`; `needs-input` and `gate-blocked` already exist on alate with the
  same red — confirm the taxonomy does not collide with them. — Saptami.
- [ ] **iOS / human-held devices** — a second device issue for the iPhone
  (TestFlight, no adb), permanently `Waiting on: human`? Item 5424307372 is
  the one such test today. — Saptami.
- [ ] **Sub-issue grouping** — none now, or group tests under a release
  parent once the medium is issues? Deferred to implementation unless there
  is a preference. — Saptami.
- [ ] **Accept advisory lock + deterministic resolution now, branch-push CAS
  only on recurrence** (this proposal)? — Saptami.
