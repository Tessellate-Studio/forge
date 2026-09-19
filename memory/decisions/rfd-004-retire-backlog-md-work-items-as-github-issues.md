# RFD 004: Retire BACKLOG.md. Work items become GitHub issues

**Date:** 2026-09-18
**State:** committed — rollout complete 2026-09-19
**Author:** Saptami Ram (with Claude)
**Decided upstream (not reopened here):** on 2026-09-18 the owner decided to
retire `BACKLOG.md` across the Tessellate repos. Work items become GitHub
issues labelled `P0`–`P3`. Items waiting on an owner yes/no become draft
`decision` PRs (merge = approve, close = reject). The owner also decided that
this RFD is approved through its own decision PR before anything is built.
This document covers **how** to do it, not **whether**.

---

## Background

Every Tessellate app keeps its open work in a root `BACKLOG.md`, in `## P0`–`## P4`
sections. The weekly `forge:roadmap-pulse` skill parses those sections, runs an
honesty pass, RICE-scores the entries it finds open, and prepends a section to
`WEEKLY_DIGEST.md`. The forge standards (`workflows.md`, `anti-patterns.md`,
`doc-placement.md`, `CLAUDE.base.md`) treat BACKLOG as the home for "what +
why", for rejected options, and for status updates on completion.

This design has failed in four ways, and each failure is on record:

1. **Content collisions.** The file is a single shared anchor for every
   session. The standing rule to check it before editing exists because of a
   precedent. In one day, "the same BACKLOG paragraph was rewritten three times
   by three sessions" (`standards/anti-patterns.md`, "Concurrent branches
   collide in content"). Today **10 open PRs across 4 repos touch
   `BACKLOG.md`**: alate #924 #926 #927 #928, badige #83 #84 #86, loom #164,
   mood-layer #128 #129 (`gh pr list --json files`, 2026-09-18). Worktrees
   isolate the git state, but they cannot isolate a paragraph.
2. **No per-item state.** An entry cannot be claimed, labelled, linked as
   blocked, closed by a PR keyword, or listed by a query. Instead the
   status is prose ("BUILT DARK", "PARTIAL", "~~P0~~ RESOLVED",
   "LIVE and shopper-verified"), and the pulse has to guess it back out.
   Device tests already moved off prose for the same reason (RFD-003). So
   did work claims (`claimed` label + `wip`).
3. **The file only grows.** alate's `BACKLOG.md` is **1,270 lines** holding 32
   open items. The "Docs stay lean" tombstone rule and a separate
   `memory/project_backlog_archive.md` exist only to keep that growth in check.
4. **Two sources of truth.** Automated skills (crash-monitor, security-sweep,
   device-test, the `pr-close-label-guard` workflow) already file GitHub
   issues, while planned work lives in markdown. The pulse sees only the
   markdown half.

The `P0`–`P3` labels and the `decision` label were created in alate, badige,
loom, mood-layer and forge on 2026-09-18 (`gh label list`, verified). The
decision-PR pattern ran the same day: alate#922–926, badige#83–85, loom#164,
mood-layer#128–129 and forge#150.

### Measured starting point

The counts come from parsing each repo's `BACKLOG.md` at `origin/HEAD`
(alate `35a69e1`, badige `b2a0408`, loom `ab17d1b`, mood-layer `a6516bf`) with
a throwaway classifier, then correcting it by hand. The corrections are listed
because each one is a parser hazard the real script has to handle:

| Repo | Lines | Open entries | Resolved (skip) | Needs a human call | Entry style |
|---|---|---|---|---|---|
| alate | 1,270 | **32** (P0 2 · P1 18 · P2 5 · P3 4 · P4 3) | 4 | 1 | `### entry` under `## P-section`; tombstone paragraphs; one `- **` entry |
| badige | 612 | **9** (P0 1 · P1 4 · P2 3 · P3 1) | 3 | 0 | `## P1 — title` **is** the entry; `#### ###` sub-sections |
| loom | 100 | **9** (P2 7 · P3 2) | 1 + 6 in `## Done` | 0 | `- **title**` list items; `## P1 — needs the user` (empty) |
| mood-layer | 264 | **9** (P1 3 · P2 1 · Post-launch 1 · P3 4) | 3 + 1 in `## Done / retired` | 3 | `- **title**` list items; struck titles carrying `**Still open:**` |
| **Total** | | **59** | | **4** | |

Hand corrections to the naive pass:

- **alate P4, niche-fit directory.** Six of its own `###` sub-sections ("Data
  model", "Submission flow", "Browse flow", …) were read as six separate
  entries. They are body text.
- **alate P1, "Restock alerts: push ALONGSIDE email".** This is a `- **` list
  entry inside a run of `###` entries. It was swallowed into the entry
  before it.
- **loom P2, "`read_themes` widget check — code half DONE".** A `DONE` matcher
  closed it, but the two user steps are still open, so it stays open.
- **"Needs a human call".** These entries are struck through but carry an
  explicit open residual: mood-layer's two Circle entries and "Hold-to-learn",
  and alate's "Supabase security advisors — CLOSED … residuals are won't-fix".
- alate also has three long-form briefs in `docs/backlog/`:
  `fit-graph.md` (155 lines), `shopify-size-finder-widget.md` (497) and
  `wardrobe-integration.md` (184).

Existing open issues are few: alate 6, badige 0, loom 3, mood-layer 5, forge 2.
So most `#N` references in entries point at **closed** issues or merged PRs,
and dedupe by reference mostly produces "link as context", not "attach to an
open issue". The largest entry body is 8,192 characters, far under the
65,536-character issue body limit.

Every repo is owned by the `Tessellate-Studio` org, and the org has issue types
`Task` / `Bug` / `Feature` (`gh api orgs/Tessellate-Studio/issue-types`,
probed). The installed `gh` is **2.98.0**. It exposes `blockedBy`, `blocking`,
`parent`, `subIssues`, `subIssuesSummary`, `issueType` and
`closedByPullRequestsReferences` as `--json` fields, and has the
`--blocked-by` / `--parent` / `--add-blocked-by` flags (`gh issue list --help`,
`gh issue edit --help`, probed).

---

## Prior Art

The research ran on 2026-09-18 in three rounds (problem space, solution space,
validation). Tiers follow the research protocol.

### How others solve this

- **Kubernetes** ([issue-triage guide](https://github.com/kubernetes/community/blob/master/contributors/guide/issue-triage.md), authoritative):
  label families `priority/*` (critical-urgent → backlog → awaiting-more-evidence),
  `kind/*` (type), `area/*`, plus `needs-triage`. This is the same shape as
  P + type + area, and it is prior art for a "not triaged yet" state.
- **GitLab** ([labels](https://docs.gitlab.com/development/labels/), authoritative):
  scoped labels `priority::1-4` / `type::` are *mutually exclusive*. Adding one
  removes the sibling. GitHub labels have no such rule, so an issue can carry P0
  and P2 at once unless tooling prevents it. That is why the lint below exists.
  GitLab also ties the top priority to a response runbook
  ([S1/P1 runbook](https://handbook.gitlab.com/handbook/security/product-security/psirt/runbooks/handling-s1p1/)).
- **An AI coordinator on GitHub Issues** ([joe-shirey.com](https://www.joe-shirey.com/2026/06/02/using-github-issues-as-backlog.html), community):
  nightly triage and weekly grooming, idempotent label bootstrap per repo, and
  flags on issues idle 60+ days. Closing is hard-limited to two cases (stale
  after a grace period, or duplicate). The author argues a TODO.md "is opaque to the agent". This is
  the closest analogue to roadmap-pulse-on-issues. The closing guardrail is
  adopted below.
- **Documenso** ([Linear → GitHub](https://documenso.com/blog/linear-gh), practitioner):
  consolidated onto GitHub because the code and the community were already there.

### Existing tools/libraries

- **Issue forms** ([syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms), authoritative):
  top-level `labels`, `type`, `projects`, `assignees`. **A label in `labels:`
  that does not exist in the repo is silently not applied.** Dropdown answers
  land in the body only and never become labels. `blank_issues_enabled: false`
  hides the blank option only for users below maintainer access
  ([config](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)).
  The docs do not say that forms constrain `gh issue create` or the API. Treat
  it as a hypothesis that they don't, and design as if they don't.
- **Sub-issues and issue types** were GA on 2025-04-09
  ([changelog](https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/)).
  The limits are 100 sub-issues per parent and 8 levels, and sub-issues can be
  cross-repo ([docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)).
  **Tasklist blocks were retired on 2025-04-30.** Plain `- [ ]` checkboxes
  remain ([changelog](https://github.blog/changelog/2025-02-18-github-issues-projects-february-18th-update/)).
- **Issue dependencies** (blocked by / blocking) were GA on 2025-08-21, with
  50 per relationship type, REST and webhooks
  ([changelog](https://github.blog/changelog/2025-08-21-dependencies-on-issues/),
  [REST](https://docs.github.com/en/rest/issues/issue-dependencies)). They work
  cross-repo, and each POST counts toward secondary limits. They are not
  Project table columns ([discussion](https://github.com/orgs/community/discussions/165749)).
- **`gh` ≥ 2.94.0** added `--type`, `--parent` and `--blocked-by` plus the
  matching JSON fields
  ([changelog](https://github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli/)).
  `gh issue list` **defaults to 30 results**
  ([manual](https://cli.github.com/manual/gh_issue_list)), which would
  silently truncate the pulse's input.
- **Projects v2 fields** need the non-default `project` token scope
  ([cli#11308](https://github.com/cli/cli/issues/11308)) and have no computed
  fields ([discussion](https://github.com/orgs/community/discussions/6080)).
- **Issue fields** were GA on 2026-07-02 for org repos: typed org-level
  Priority, Effort and custom number fields, up to 25 per org
  ([changelog](https://github.blog/changelog/2026-07-02-issue-fields-are-now-generally-available/),
  [limits](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-fields-in-your-organization)).
  `gh issue list --json` does not expose field values. See Alternatives.
- **Backlog.md** ([repo](https://github.com/MrLesk/Backlog.md), community,
  6.8k stars) is the strongest opposing prior art. It keeps tasks as markdown
  in git *for* AI agents ("one task = one context window = one PR"). Its
  commenters raise the problem this RFD has: they want one backlog across
  several repos, and agents need to query tasks without reading all of them
  into context ([HN](https://news.ycombinator.com/item?id=44483530)).
- **todo-to-issue-action** ([README](https://github.com/alstr/todo-to-issue-action/blob/master/README.md))
  created duplicates when two triggers processed one diff, and its fix is to
  write the issue URL back into the source. **git-bug**
  ([repo](https://github.com/git-bug/git-bug)) keeps issues in git with a
  GitHub bridge, which is more tooling weight than this needs.

### Known pitfalls

- **Secondary rate limits** (source: [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)):
  **80 content-generating requests per minute and 500 per hour**, and no more
  than 100 concurrent requests. On a limit, honour `retry-after`, then
  `x-ratelimit-reset`, otherwise wait at least 1 minute with exponential
  backoff. Continuing risks "banning of your integration". The
  best-practice guide says to make writes serially with ≥1 s between them
  ([best practices](https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api)).
  At our scale of ~63 creates plus ~70 label and link writes, this is one
  paced run per repo, not a multi-hour job.
- **Search-index lag produces duplicates** (source: [sassydog-skills#339](https://github.com/Sassy-Dog/sassydog-skills/issues/339)):
  a marker-based dedupe that used GitHub *search* filed a second copy 7 s
  later, with index lag up to about 4 minutes. A backfill with no memory posted
  675+ comments ([fleet-ops#5496](https://github.com/Nishfleet/fleet-ops/issues/5496)).
  The fix is to dedupe on a full **list** read plus a local ledger, never search.
- **Notifications** (source: [configuring notifications](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications),
  [create-an-issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)):
  creating an issue "triggers notifications" to repo watchers. Create-then-assign
  sends two emails ([discussion](https://github.com/orgs/community/discussions/27585)).
  Your own actions do not notify you by default.
- **Body cap** of 65,536 characters returns `422 body is too long`
  ([release-please#1034](https://github.com/googleapis/release-please/issues/1034)).
- **Label priority doesn't sort, and cross-repo views are weak**
  ([cotera.co](https://cotera.co/articles/linear-vs-github-issues-comparison),
  practitioner with SEO lean). That team left GitHub Issues at about 500 tickets
  and 7 repos. We are at ~60 open items and 5 repos. This design answers it
  with a pulse that queries across repos, not with GitHub's UI.
- **No prior art found** for draft PRs used specifically as an owner yes/no
  queue. The closest pattern is ADR-as-PR with "Status: Proposed"
  ([creately](https://creately.com/creately-system-design/architecture-decision-records-adrs-templates-review/),
  marketing tier). Our 2026-09-18 run of 12 decision PRs is the only evidence.

---

## Proposal

### 1. Where each kind of content lives

| Content | Home | Mutability |
|---|---|---|
| A work item: what, why, done-when, what's left **now** | **Issue body** | Edited in place, so it stays true (the honesty pass edits it) |
| Progress notes, findings, status changes, "tried X, didn't work" | **Issue comments** | Append-only, one per event, dated by GitHub |
| A piece that has its own done state and could close on its own | **Sub-issue** (`gh issue create --parent N`) | Own lifecycle, ≤100 per parent |
| A small checklist with no separate lifecycle | `- [ ]` lines in the body | Ticked in place |
| "Does the owner approve X?" | **Draft PR labelled `decision`** that adds or edits a doc in `memory/decisions/` | Merge = approve, close = reject |
| A decided design, and rejected alternatives worth keeping | `memory/decisions/` (ADR / pitch / RFD) | Superseded, never rewritten |
| Bug root cause + lesson | `memory/project_regression_log.md` (unchanged) | Append |
| Exact console steps for a human | `docs/manual-runbook.md` (unchanged) | Per runbook rule |
| A long product brief (tens of KB, many sections) | `docs/briefs/<name>.md`, linked from its issue | Edited like any doc |
| Weekly priorities | **The roadmap Artifact** (§4.6) | Refreshed in place each run; previous scores embedded |

**Rules for sub-entries:**

- **A `####` sub-section stays in the body.** It becomes a sub-issue only when
  it passes the "could close on its own" test, *and* someone decides so. The
  migration never splits an entry automatically. It only *suggests* splits
  in the dry-run table (e.g. alate's "Cross-brand size translation" has Stage 2 and
  Stage 3). The override file (§5.4) turns a suggestion into sub-issues.
- **A dated narrative inside an entry** (the "2026-09-03: …, then later that
  day …" style that makes mood-layer entries 3 KB) is migrated verbatim into the
  body once. From then on, new narrative goes in comments, and the body is
  trimmed to the current state by whoever changes the state.
- **Link a decision to its issue in both directions.** The decision doc gets a
  `**Tracking:** <repo>#N` line (RFD-003 already does this). The issue body
  links the doc. The decision PR says `Refs #N`, **never** `Closes #N`,
  because approving a plan is not shipping it.

### 2. Label scheme

Labels are the single store for priority and type. There is **no Priority
field in the issue body**, because a dropdown answer and a label would drift
apart, and forms cannot turn a dropdown into a label anyway.

| Family | Values | Cardinality | Who sets it |
|---|---|---|---|
| Priority | `P0` blocker / pre-launch · `P1` do next · `P2` soon · `P3` later | **Exactly one** on every open work issue | Human or filing skill. The pulse *proposes* changes and changes one only on a manual run with the owner's yes |
| Type | `bug` · `feature` · `chore` · `refactor` (`enhancement` read as an alias of `feature`) | At most one | Issue form / filing skill |
| Area | loom and alate only (owner, Q6 as amended 2026-09-19). loom keeps `admin-ui api sdk extension supabase infra`; alate gets `mobile backend scraper fit-engine infra` (in bootstrap's config, created when alate is bootstrapped in step 5). mood-layer's existing `data ui circle notifications build infra` are left untouched, not deleted, and never applied by the migration; badige has none | 0–n | Optional. The migration infers area for loom and alate only, on a confident path/keyword match, else leaves it empty |
| Lifecycle | `decision` · `on hold` · `claimed` · `needs-input` · `needs-triage` | See matrix | See matrix |
| Queues (separate systems) | `device-test` + `needs-human` `needs-build` `parked` `failed` (RFD-003) | n/a | device-test skill |
| Provenance | `migrated-from-backlog` (new), `crash-monitor`, `security-sweep`, `auto-generated`, `ci-failure`, `ops-alert` | n/a | The filing tool |

**How the lifecycle labels interact:**

| Label | Goes on | Means | Pulse scoring | Pulse auto-build (Step 5.5) | Expiry / sweep |
|---|---|---|---|---|---|
| `decision` | **PRs only** (draft) | A plan awaiting owner yes/no | Not scored. Listed under "awaiting your yes/no", oldest first | Never | None. An open decision PR >14 days old is surfaced |
| `needs-input` | Issues (and non-decision PRs) | Blocked on a human answer that is *not* a doc approval, or on an open decision PR (`Blocked on decision #N` in the body) | Scored, shown under "needs you" | Never | Surfaced after 14 days |
| `on hold` | Issues, PRs | "Not now" was decided. The applying comment carries a **review-by date +14 days** (workflows.md) | Scored but ranked after all non-held items. Listed under "holds expiring" | Never | Past the date → reminder comment, **never close** (workflows.md contract) |
| `claimed` | Issues, PRs | A live session owns it (`wip`) | Scored normally | Skip if the claim is live (not the pulse's own) | `wip sweep` |
| `device-test` | Issues | A queued on-device test | **Excluded.** It belongs to a different queue | Never | device-test skill |
| `needs-triage` | Issues | Filed without a P label (human form, or an auto-filer that couldn't decide) | Scored provisionally; a P is proposed | Never | The pulse lists every open issue with 0 or >1 P labels |

Concrete consequences:

- **Never put `needs-input` on a `decision` PR.** Closing a decision PR is a
  valid answer (reject), but `pr-close-label-guard.yml` turns any PR closed
  with `needs-input` into a follow-up issue (`.github/workflows/pr-close-label-guard.yml:3-16`).
  The guard gets a one-line skip for `decision`-labelled PRs (§3).
- **Retire loom's and mood-layer's `critical` / `high` / `medium` / `low`
  labels.** They collide with P0–P3. The existing issue forms' "Priority:
  critical/high/normal" dropdown writes only to the body. Mapping:
  critical→P0, high→P1, medium→P2, low→P3. Relabel first, then delete the four
  labels (owner approved, Q4).
- **P-label exclusivity is enforced in two places:** by the filing helper at
  write time, and by the pulse's lint weekly (GitLab's scoped-label rule, done
  in tooling because GitHub can't). No Action runs on `issues: labeled`,
  because a guard that spends CI minutes for a rule the weekly lint already
  catches is not worth it.
- **Issue types** (`Task` / `Bug` / `Feature`, org-level) are left unset. Type
  labels already exist per repo and the owner chose labels. Running both would
  create a second store for the same fact (see Alternatives).

### 3. Issue shape: canonical forms in forge, synced to each repo

**Canonical copies live in forge** at `templates/issue-forms/{bug,feature,chore,refactor}.yml` plus
`config.yml` (`blank_issues_enabled: false`). A forge tool copies them into each
repo's `.github/ISSUE_TEMPLATE/`. The same tool, run in check mode inside the
existing `code-inspection` reusable workflow, fails when a repo's copy's hash
differs from forge's. That keeps RFD-003's worry about "four template copies
would drift four ways" in check without giving up forms for human filing.
alate, loom and mood-layer already carry these four file names, so this
replaces their bodies rather than adding files. badige and forge gain the
folder.

The shared body sections are the same headings the pulse parses. A
migrated issue that lacks them is still valid, because every section is
optional to the parser:

```yaml
# templates/issue-forms/feature.yml (bug/chore/refactor differ only in name, labels, first field)
name: Feature
description: New functionality or a user-visible improvement
labels: ["feature", "needs-triage"]      # P label set in the sidebar by a maintainer, or by triage
body:
  - type: textarea
    id: what
    attributes: { label: What, description: "The work, written so a session can start it cold." }
    validations: { required: true }
  - type: textarea
    id: why
    attributes: { label: Why / evidence, description: "User impact and where it came from — regression row, Sentry id, user quote, decision doc." }
    validations: { required: true }
  - type: textarea
    id: done-when
    attributes: { label: Done when, description: "Acceptance criteria, ideally a runnable **Verify:** block. The honesty pass executes it." }
    validations: { required: true }
  - type: textarea
    id: context
    attributes: { label: Context & history, description: "Rejected options, links, memory/decisions docs, briefs. Progress notes go in comments, not here." }
  - type: dropdown
    id: effort
    attributes: { label: Effort (person-days), options: ["unknown", "0.5", "1", "2", "3", "5", "10", "20"] }
  - type: dropdown
    id: reach
    attributes: { label: Reach, options: ["unknown", "1 — just me / internal", "10 — early testers", "100 — all current users", "1000 — future users at scale"] }
```

- **Why `needs-triage` and not a P label in the form:** a single form cannot
  map a dropdown to a label. Four forms × four priorities would be 16 files.
  A maintainer filing on the web sets the P label in the sidebar in the same
  step, and anything left untriaged shows up in the next pulse's lint.
- **Agents do not use forms.** Forms do not constrain `gh issue create`
  (hypothesis, per the docs' silence; design assumes it). Skills file through
  a forge helper, `wi new` (`tools/work-item/cli.js`, the same pattern as
  `dtq enqueue`). The helper renders the same section headings from flags,
  requires exactly one `--priority P0..P3`, and **searches before it creates**
  by *listing* open issues (`-L 1000 --json number,title,body`), never through
  the search API (§5.3, index lag). `wi new --dry-run` prints the body.
- **Label bootstrap.** `tools/labels/bootstrap.js --repo <r> [--dry-run]`
  creates the canonical set in each repo, idempotently: P0–P3, `bug feature
  chore refactor`, `decision`, `on hold`, `claimed`, `needs-input`,
  `needs-triage`, `migrated-from-backlog`, and the device-test set. It uses
  one colour and one description everywhere. This matters because issue forms
  silently drop labels that don't exist: **alate's `feature.yml`, `chore.yml`
  and `refactor.yml` apply `feature`/`chore`/`refactor` labels that alate does
  not have today** (`gh label list -R Tessellate-Studio/alate`, 2026-09-18).
  The `on hold` descriptions also differ between alate and the other repos, and
  bootstrap aligns them to workflows.md.
- `forge:new-app` runs the bootstrap and the form sync when it scaffolds an app.
  A new app never gets a `BACKLOG.md`.

### 4. roadmap-pulse on issues

The skill keeps its six steps and its "every verdict cited" contract. Its inputs,
its write-backs and its digest change.

#### 4.1 Scope and inventory

`.roadmap-pulse-state.json` gains `repos: ["Tessellate-Studio/alate", "Tessellate-Studio/loom", …]`
(alate's pulse already spans loom, tessellate-pages and litmus per alate
`CLAUDE.md:212`) and `digestIssue: {repo, number}`. The inventory step
replaces "`ls *.md` → BACKLOG" with one call per repo:

```bash
gh issue list -R <repo> --state open -L 1000 \
  --json number,title,body,labels,createdAt,updatedAt,url,issueType,parent,subIssuesSummary,blockedBy,blocking,closedByPullRequestsReferences
gh issue list -R <repo> --state closed -L 300 --search "closed:>=<lastRunDate>" \
  --json number,title,stateReason,closedAt,closedByPullRequestsReferences,labels
gh pr list    -R <repo> --state open -L 200 --label decision --json number,title,createdAt,isDraft,url
```

`-L` is mandatory everywhere. The default of 30 would silently drop half of
alate. Comments are fetched only for the issues the honesty pass inspects
(`gh issue view N --json comments`), not for all of them. `RELEASE_V2.md`,
`USER_PATHS.md`, the regression log and the anti-patterns files stay file
inputs, unchanged. Out of scope: any issue labelled `device-test`.

**Dual mode during rollout.** A repo whose `BACKLOG.md` still has entries is
read the old way. A repo whose `BACKLOG.md` is the one-line pointer (it
carries `<!-- backlog-retired -->`) is read from issues. This is what lets
forge ship before any repo migrates, and it makes rollback per repo (§7).

#### 4.2 Honesty pass on issues (Step 1)

The five existing failure modes carry over. What changes is where each check
looks and what counts as a rewrite:

| Failure mode | Check on issues | Autonomous (cron) action | Manual-run action |
|---|---|---|---|
| Shipped but still open | (a) `closedByPullRequestsReferences` holds a merged PR while the issue is open. (b) The issue timeline (`gh api repos/<r>/issues/N/timeline`) has a `cross-referenced` merged PR. (c) The existing `git log <default> --grep "<distinctive phrase>"` | **One** evidence comment (hidden marker `<!-- pulse:suspect-shipped -->`, edited on later runs rather than re-posted). Listed in the digest under "close these?". **Never closes.** | Owner confirms → `gh issue close N --reason completed --comment "<SHA, branch --contains proof>"` |
| Shipped from an orphan branch | Closed `completed` since the last run, with no merged PR in its timeline and no default-branch SHA cited | Comment + digest flag | Reopen with a history note |
| Deferred without a source | Open `P3` or `on hold` whose body has no *because* / link / decision doc | Digest flag | Add rationale to the body |
| Stale `file:line` citation | Same algorithm, run over the issue body | **Edit the body in place** (GitHub keeps edit history) + one comment naming the old → new citation | Same |
| Still pending but actually live | Same probes. Run the body's `**Verify:**` block | Comment with the probe output. Narrow "Done when" in the body | Close or narrow, per the three-outcome grading table (unchanged) |
| *New:* label hygiene | 0 or >1 P labels; P0 with no activity for 14 days; `needs-input` >14 days; `on hold` past its review-by date; dead `claimed` | Digest section. `on hold` expiry → reminder comment. `claimed` → `wip sweep` | Fix labels with the owner |

The closing guardrail is adopted from prior art: **an unattended run never
closes or reopens an issue, and never changes a P label.** It comments and
reports. Everything that changes state goes through a manual run, on the owner's word.
"Strike-through, don't delete" becomes "close with a reason, never delete".
A closed issue keeps its whole body and comments, so the "Docs stay lean"
carve-out about keeping what no diff can give back is met by construction.

`references/rewrite-patterns.md` loses its BACKLOG section and gains an
"Issue rewrites" section: evidence-comment template, close-with-reason template,
body-narrowing template (keep a `Verified done <date>: …` line so the item isn't
re-listed next week), and citation-edit template.

#### 4.3 Dependencies (Step 3)

- **Confirmed dependencies are native links.** `blockedBy` / `blocking` from
  the list call are the confirmed graph (they work across repos, with 50 per
  type). This replaces the `**Depends on:**` lines.
- **Inference runs over issue bodies and titles.** High confidence: `#N` or
  `repo#N` next to "depends on / blocked by / after / requires / needs", or a
  direct title mention. Medium: a shared `path/file.ts` or a shared external
  system (unchanged). An issue with ≥1 native link is not re-inferred unless
  its body changed after the link's creation date.
- **Persisting.** On a manual run, confirmed dependencies are written as
  `gh issue edit <dependent> --add-blocked-by <blocker-url>`. An unattended
  run persists **nothing** to the issue. High-confidence suggestions go in the
  digest's "needs confirmation" table, which replaces the `**Suggested
  dependency:**` marker (that marker needed a file to live in). The
  rejection cooldown (4 weeks) stays in `.roadmap-pulse-state.json`.
- **Parent/child** from sub-issues gives the pulse a second signal. A parent is
  scored as the rollup of its open children, and only leaf issues are
  auto-build candidates. Cycle detection runs on the native graph, as today.

#### 4.4 RICE inputs and scoring (Step 4)

The owner decided that priority lives in P labels. RICE is advisory: it ranks
items within and across P bands, and it can justify a *proposed* P change.

| Input | Where it comes from | Why here |
|---|---|---|
| Reach, Effort | The body's `### Reach` / `### Effort (person-days)` form sections, **if a human filled them**. Otherwise the rubric heuristic | These are the two axes a human knows better than a keyword heuristic. Form dropdowns keep them on the scoring-contract scale |
| Impact, Confidence | rubric `evaluateFromContext` (unchanged contract) | The heuristic is what exists. *Proposed, not built:* pass the type label and the "Why / evidence" section into `context` so a bug with a Sentry id or repro can earn Confidence 1.0 |
| Goals overlay | Step 2 (RELEASE_V2 + owner overrides), unchanged | |
| Dependency-unblock overlay | `blocking.totalCount ≥ 1` (native) | Replaces the parsed `Depends on:` lines |
| Reusability overlay | Unchanged keyword rule | |
| P label | **Tie-break and band floor**: a P0 never ranks below a P2 | P is the owner's decision. RICE doesn't overrule it; it only proposes |

`title` in the rubric input is the issue title, and `description` is the "What"
section, else the first 500 characters of the body. Scores are **not written
to issues**. There are no score labels (they explode the label list and can't
hold numbers), no per-issue scorecard comments (60 comments a week of
notification noise), and no Projects v2 fields (these need the `project`
scope, which the cron token lacks). Every score for every issue goes in a
hidden JSON block in that run's digest comment (§4.6). The next run reads it
back to build "what changed since last week". That block is also the rubric
calibration corpus the digest was already meant to be.

#### 4.5 Output, auto-build and summary (Steps 5–6)

- The inline table and the roadmap Artifact stay. Their Source column becomes
  the issue URL.
- **Step 5.5 auto-build**: candidates are open issues labelled `P0`, in the
  Must band, that are leaves (no open sub-issues), have no live foreign
  `claimed`, and have none of `needs-input`, `decision`, `on hold`,
  `device-test`, or `blockedBy` with an open blocker. The existing skip words
  (migration / schema / breaking / cross-repo) are unchanged. The build does
  `wip claim <repo>#N` first, and its PR body carries `Closes #N`. The old
  sub-step 5, "Update BACKLOG: mark DONE", is deleted, because the merge
  closes the issue.
- Step 6's "Docs updated" item becomes "Issues touched" (comments posted,
  bodies edited, links added) plus the digest link.

#### 4.6 The digest: the roadmap Artifact only (owner, Q2)

The pulse already publishes its prioritized list as an Artifact page and
refreshes the same URL every run (`artifactUrl` in
`.roadmap-pulse-state.json`). The owner ruled that page is the whole digest:
**no `WEEKLY_DIGEST.md`, no digest issue, no weekly PR.**

- The scores the next run diffs against are embedded in the page as
  `<script type="application/json" id="roadmap-pulse-scores">{…}</script>`,
  read back at the start of each run with the Artifact tool's `read` action.
  If the read fails, the run falls back to a `lastScores` copy in
  `.roadmap-pulse-state.json` and says so in its summary.
- Existing `WEEKLY_DIGEST.md` files (alate 237 lines, loom 53, mood-layer 112)
  get a pointer line to the Artifact on top, in the same PR as that repo's
  migration, and are never appended to again. Their history stays in git.
- Trade-off accepted: week-over-week history is no longer a readable log. Only
  the latest page plus the previous run's scores survive. Git history keeps the
  old digest.

### 5. Migration script: `tools/backlog-migrate/` (Node, no Python)

It is a forge tool (`cli.js` + `lib/{parse,classify,render,github,ledger}.js`),
with no dependencies beyond Node's standard library and the `gh` CLI (called
through `execFileSync`, like `tools/work-claim`). The CLI checks
`gh --version ≥ 2.94`. It runs from a **fresh worktree** of the target repo,
never from the shared checkout.

```
backlog-migrate plan    --repo alate [--source-sha <sha>]   # parse + classify + dedupe → plan.json + review table. Writes nothing to GitHub.
backlog-migrate apply   --repo alate --plan plan.json [--max 25]   # creates/links, paced, checkpointed
backlog-migrate rewrite --repo alate --map memory/backlog-migration.json   # pointer file, link rewrites, docs/briefs move
backlog-migrate rollback --repo alate --map …   # closes created issues not_planned (never deletes)
```

#### 5.1 Parsing

The parser reads `BACKLOG.md` at a pinned SHA (`git show <sha>:BACKLOG.md`), plus
`docs/backlog/*.md` for alate.

- **Section priority** comes from `## ` headings: `P0`–`P3` → that label;
  **`P4` → `P3`** with a `Deferred until: <trigger>` line (owner, Q1).
  mood-layer's `Post-launch — verify after v0.2.0 is live` → `P2`, and each
  entry is checked for device-test shape (below). loom's `P1 — needs the user` →
  `P1` + `needs-input`. `Done`, `Done / retired`, `Dismissed / out of scope` →
  the whole section is skipped.
- **Entry boundaries, by precedence:**
  1. A `## ` heading that itself names a priority and a title
     (`## P1 — …`, `## ~~P0~~ RESOLVED …`) is the entry. This is badige's style.
     Its `###` / `####` headings are body.
  2. In a section that contains `###` headings, each `###` is an entry until
     the next `###` or `##`. A `- **Title**` or `- ~~**Title**~~` line at
     column 0 that *follows a blank line and is not inside an entry's list
     block* also starts an entry. That is the alate "Restock alerts" case, and
     it is decided by the override file when the heuristic is unsure.
  3. In a section without `###`, each column-0 `- **…**` / `- ~~**…**~~` list
     item is an entry. Indented continuation lines are its body. This is the
     loom and mood-layer style.
  4. A column-0 paragraph starting `~~` before the section's first entry is a
     tombstone entry. This is alate's P0 style.
  5. **Known sub-section titles never start an entry.** Any `###` whose
     parent entry's body has already started, *and* whose title matches
     `/^(Data model|Submission flow|Browse flow|Promotion criteria|What to do now|Anti-pattern compliance|Progress|What was fixed|Reconciled|Follow-ups|Rejected alternatives|Where this was left|The order|Shared blocker|Yes —)/i`,
     stays body. Anything else ambiguous is marked `review` in the table
     rather than guessed.
- `####` headings are always body. When they look independently closable
  ("Stage 2", "Phase 2", numbered `### 1.` items), they are recorded as
  `suggestSplit` in the plan.

#### 5.2 Classification

| Verdict | Rule |
|---|---|
| `skip-resolved` | The title starts `~~` or contains `~~P\d~~`, `RESOLVED`, `CLOSED`, `SHIPPED`, `SUPERSEDED`, `DONE` **as a status word** (not "code half DONE", "partly done"), **and** neither the title nor the body contains an open residual (`Still open`, `Remaining:`, `What's left`, `PARTIAL`, `open)`) |
| `review` | A resolved marker **and** an open residual. These are the 4 measured cases. Owner ruling (Q3): create an issue for the residual only |
| `device-test` | The entry is a manual on-device check ("Manual device tests pending", "Verify … on a real device"). It is routed to `dtq enqueue` rather than a work issue. badige's two numbered flows are the measured case |
| `link #N` | See §5.3 |
| `create` | Everything else in a P-section |
| `skip-section` | Anything in a Done/Dismissed section |

Other inferred fields: **type** (`bug` when the title/body leads with broken /
fails / crash / regression / 5xx; `chore` for CI / deps / lint / runner /
timeouts; `refactor` for consolidate / retire / collapse / extract; else
`feature`; low confidence → none, left to triage). **area** is inferred for loom and alate only, and only on a confident path/keyword match; otherwise it is left empty (Q6 as amended 2026-09-19). **`needs-input`** when the body contains `Blocking on the user`,
`Decision needed`, `Needs input`, or `Owner: user (decision)`. **Target repo** is
the repo named in an entry that says it lives elsewhere ("(alate repo)",
"loom#", "litmus fast-follow"). Owner ruling (Q5): file in the repo that owns the code; an entry that names no other repo stays in the source repo.

#### 5.3 Dedupe, idempotency, and links

- **Idempotency marker.** Every created issue body starts with
  `<!-- backlog-migrate v1 repo=<repo> key=<k> src=<sha7>:BACKLOG.md#L<a>-L<b> -->`.
  `k` = first 12 hex characters of `sha1(repo + "\n" + normalizedTitle)`.
  normalizedTitle is lowercased, with markdown stripped and status suffixes
  (` — NEW (date)`, ` — BUILT DARK …`, `(SHIPPED …)`) removed. It is keyed on
  the title, not the body, so re-running after a body edit does not duplicate.
  A second field, `h=<sha1(body)[0:8]>`, detects source drift between `plan`
  and `apply`, which is refused if the source SHA moved.
- **Dedupe reads a full list, never search.** Before `apply`:
  `gh issue list -R <repo> --state all -L 3000 --json number,title,body,state`
  builds a marker index and a title index locally. A key already present →
  `already-migrated`, which is a no-op. The **ledger**
  (`memory/backlog-migration.json`) is written and flushed after *every*
  write, so a crash mid-run resumes exactly where it stopped.
- **Existing issue/PR references.** Each `#N` / `repo#N` / `/issues/N` / `/pull/N`
  in the entry is resolved once with `gh api repos/<o>/<r>/issues/<N>` (which
  covers PRs):
  - An **open issue** whose title shares ≥50% of significant tokens with the
    entry, or that the entry names as its own ("… — alate#825"), → `link #N`.
    Add the P label + `migrated-from-backlog`, and post **one** comment
    carrying the entry text and the marker, unless its body already holds it.
    Don't create.
  - An **open `decision` PR** (e.g. badige#83 for "Decide the fate of the
    notification subsystem", alate#926 for "Colour: decide whether the server
    sees the garment colour") → `create` with `needs-input`, and a
    first body line `Blocked on decision PR #N — merge = approve`.
  - Anything closed or merged → kept as context links in the body. It does not dedupe.
  - Every open issue title is also compared by token overlap. ≥0.5 → `review`.

#### 5.4 Dry-run output and overrides

`plan` writes `plan.json` and prints a markdown table, and that table is
**posted in the migration PR body for review before `apply` runs**:

```
| # | Lines | Section | P | Verdict | Target | Type | Extra labels | Title (≤80) | Body chars | Refs | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 77–163 | P0 — pre-App-Store launch | P0 | create | alate | feature | — | Cross-brand size translation — Stage 1 shipped; … | 5303 | #232 #226 #238 #328 (closed) | suggestSplit: Stage 2, Stage 3 |
| 2 | 468–563 | P1 — near-term polish | P1 | review | alate | chore | — | Supabase security advisors — CLOSED … | 5668 | … | resolved + residual |
…
Totals: create 30 · link 1 · review 1 · device-test 0 · skip-resolved 4 · skip-section 0
```

`overrides.json` (committed next to the ledger) can change any row by `key`:
`verdict`, `priority`, `title`, `labels`, `targetRepo`, `mergeInto` (glue a
false entry back into the previous one), and `split` (headings to turn into
sub-issues). The pilot's review is where the parser heuristics get corrected,
rather than tuned in the abstract.

#### 5.5 Rendering

- **Title:** markdown stripped, status suffix kept (it is current state), max 256 characters.
- **Body:**

  ```markdown
  <!-- backlog-migrate v1 repo=alate key=3f9c0a1b2c4d src=35a69e1:BACKLOG.md#L77-L163 h=9ab01c2d -->
  > Migrated from [`BACKLOG.md` L77–163 @ `35a69e1`](https://github.com/Tessellate-Studio/alate/blob/35a69e1/BACKLOG.md#L77-L163)
  > (section "P0 — pre-App-Store launch") on 2026-MM-DD. Text below is the entry verbatim;
  > only links were made absolute. New progress goes in comments.

  <entry text>
  ```

  The permalink is what guarantees long entries lose no context. The full
  original, with its surrounding sections, stays one click away at a fixed SHA,
  even after `BACKLOG.md` becomes a pointer. Entry headings are demoted one level so they
  nest under the issue title.
- **Link rewriting:** relative links (`./memory/…`, `docs/…`, `../`) become
  absolute blob URLs **at the source SHA**. In-file anchors (`#some-entry`) are
  rewritten in a second pass, once the ledger knows every entry's issue number.
  Until then they point at the permalink.
- **Notification hygiene:** no assignees, no milestone. `@handle` becomes
  `` `@handle` ``, so nobody gets mentioned. Labels go in the create call itself,
  not a follow-up edit (one write, one event). Bare `#N` references are kept.
  They add "mentioned this" backlinks to the referenced (mostly closed) items,
  which is useful provenance, not email.
- **Over the cap:** a body over 60,000 characters is cut at a heading boundary,
  with "continued at <permalink>". No measured entry comes close (max 8,192).

#### 5.6 Pacing

- Writes are serial, with **≥3 s between writes** (≤20/min, under the 80/min
  ceiling). There is a hard **400 writes per rolling hour** budget, under the
  500/hour ceiling, and `--max` caps writes per invocation.
- On 403/429: honour `retry-after`, then `x-ratelimit-reset`, otherwise back off
  60 s → 120 s → 240 s and stop after 3 tries. The ledger makes stopping safe.
- Expected load: ~63 creates or links, ~10 dependency/parent links, and 1 comment
  per `link` verdict. That is about 80 writes across all four repos, so each
  repo is a single run of a few minutes.

#### 5.7 Rewrite step (after `apply`)

1. Write `memory/backlog-migration.json`: `[{key, title, verdict, sourceLines, sourceSha, repo, issue, url}]`.
2. Replace `BACKLOG.md` with the pointer (one visible line, plus the marker that the pulse and the CI guard read):

   ```markdown
   Work items are GitHub issues: [open, by priority](https://github.com/Tessellate-Studio/<repo>/issues?q=is%3Aissue+is%3Aopen+label%3AP0%2CP1%2CP2%2CP3+sort%3Acreated-asc) · this file's history: `git log -p -- BACKLOG.md` (last full version `<sha7>`). <!-- backlog-retired -->
   ```

   The file is **kept, not deleted**. Old links and old sessions that open it
   are redirected instead of hitting a 404.
3. alate only: move `docs/backlog/*.md` to `docs/briefs/`. Each brief gets a
   `**Tracking:** alate#N` header, and its issue links the brief. Open parts of
   a shipped brief (the widget brief's §8e "Still-open hardening") become the
   issue's "What's left" (owner, Q7).
4. Rewrite links in other docs that point at `BACKLOG.md` or `docs/backlog/`:
   `PROJECT_DOCS.md`, `CLAUDE.md`, `memory/decisions/*`, `docs/*`. Code and CI
   comments that say "tracked in BACKLOG P1 …" (alate `ci.yml:105`,
   `code-inspection.yml:36`, `supabase-migrations.yml:233`; loom
   `ops-watchdog.yml:416,429`; mood-layer `ops-watchdog.yml:16,155`; badige
   `ci.yml:120`) become `tracked in <repo>#N`. Historical narrative in regression
   logs and archives is left alone, because it describes the past.
5. **Freeze guard, proven red.** Add a step to each repo's existing PR gate:
   `grep -q 'backlog-retired' BACKLOG.md && [ "$(grep -cv '^\s*$' BACKLOG.md)" -le 1 ] || { echo "::error::BACKLOG.md is retired — file an issue (wi new) instead"; exit 1; }`.
   Pilot acceptance includes a throwaway PR that adds a line and **fails** the gate.
6. Everything above ships in **one PR per repo**: `docs: retire BACKLOG.md — migrated to issues`.

### 6. Every forge file that reads or writes BACKLOG, and its change

The list comes from `git grep -n -i backlog origin/master` at `4d12fb7`: 107
hits in 29 files. Hits where "backlog" is ordinary English or a rubric band
name are listed too, so none looks missed.

**Standards**

| File:line | Change |
|---|---|
| `standards/workflows.md` (new section) | Add **"Work items are GitHub issues"**: the §1 content table, the §2 label scheme and interaction matrix, the issue shape, `wi new` with list-before-create, `Refs` vs `Closes` for decision PRs, and sub-issue vs comment vs checklist rules. Link RFD-004 |
| `standards/workflows.md:302-310` Orphan-branch fixes | "Update BACKLOG / regression-log entries to the new merged SHA" → "the port PR carries `Closes #N` for the tracking issue; regression-log rows get the SHA". |
| `standards/workflows.md:360` claim template **Docs:** | "RFD / ADR / pitch / backlog entry" → "RFD / ADR / pitch / brief this is built against" (the issue is already **Related**) |
| `standards/workflows.md:451` | English ("a backlog of `on hold` items"). No change |
| `standards/workflows.md:467-476` Shared planning docs | Drop BACKLOG from the list (regression log, runbook, RELEASE remain). Add: "work items don't collide in content, because each is its own issue. Claim it (`wip claim`) instead" |
| `standards/workflows.md:522-541` Status update on completion | Lead with the issue: `Closes #N` in the PR body *is* the status update. The regression-log / RELEASE / runbook file updates stay as they are. Plumbing-only PRs use `Refs #N` |
| `standards/workflows.md:795-831` Docs stay lean | The tombstone rule keeps applying to RELEASE docs and the runbook. For work items, closing is the tombstone and the body survives. Delete the "`backlog/` docs for shipped items get deleted" sentence. Carve-out 1 is re-pointed: rejected alternatives stay in the issue or go to `memory/decisions` |
| `standards/workflows.md:980, 1013` Runbook | "Not an evaluation of options (that's BACKLOG)" / "BACKLOG holds what + why" / "That is BACKLOG's job" → the issue (or the decision doc) holds what + why |
| `standards/doc-placement.md:10, 50, 80-81, 100, 125` | Remove `backlog/` from the directory list. Replace the BACKLOG.md row with "**Work items** → GitHub issues, P0–P3 (`BACKLOG.md` is a retired pointer)". `backlog/` section → `docs/briefs/`: long product briefs, each linked from its issue. "Parked feature spec" → an issue, plus `docs/briefs/<name>.md` if it is long. The root-file example tier becomes `RELEASE_V2.md` alone |
| `standards/anti-patterns.md:341` Enriched output | "don't close the BACKLOG/regression entry on the plumbing PR" → "don't put `Closes #N` on the plumbing PR (use `Refs #N`), and don't close the regression row" |
| `standards/anti-patterns.md:380-387` Concurrent branches | The planning-doc list drops BACKLOG. The example `gh pr list … .path=="BACKLOG.md"` becomes `memory/project_regression_log.md` |
| `standards/anti-patterns.md:395` | "a BACKLOG status" → "a runbook status" |
| `standards/anti-patterns.md:432` | This is precedent text, and history. No change |
| `standards/testing.md:72` UAT triage | "regression log + BACKLOG with priority; cosmetic → BACKLOG" → "regression log + an issue (P1/P2); cosmetic → an issue (P3)" |
| `standards/authoritative-claims.md:140` | "a queue item, or a backlog row is a home" → "a queue item, or an issue is a home" |

**References and skills**

| File:line | Change |
|---|---|
| `references/CLAUDE.base.md:50-56` | The shared-docs bullet drops BACKLOG |
| `references/CLAUDE.base.md:62-63` | Status update → "came from an issue? `Closes #N` in the PR body. From a regression-log / runbook entry? Update it in the same PR" |
| `references/CLAUDE.base.md:68` | "History, context and rejected options go in BACKLOG" → "… go in the issue (decided designs: `memory/decisions/`)" |
| `references/CLAUDE.base.md:108-111` Planning docs | The `BACKLOG.md` line becomes "**Work items** — GitHub issues, P0–P3 (`gh issue list -l P1`). Owner yes/no → draft `decision` PRs". The `WEEKLY_DIGEST.md` line is deleted (the digest is the roadmap Artifact) |
| `skills/roadmap-pulse/SKILL.md` (15 hits) | Rewrite per §4: description frontmatter ("scans open GitHub issues (P0–P3) plus RELEASE notes and the regression log"), doc-target table, inventory, Steps 1/3/4/5/5.5/6, "What this skill does NOT do", dual mode. The worktree-harness warning is kept but loses its BACKLOG example |
| `skills/roadmap-pulse/references/staleness-detection.md` (9) | Per §4.2 table. The squash-merge gotchas become "timeline cross-reference + `closedByPullRequestsReferences`". Add the label-hygiene checks |
| `skills/roadmap-pulse/references/rewrite-patterns.md` (6) | The BACKLOG section → "Issue rewrites" (§4.2). The regression-log and anti-pattern sections are unchanged |
| `skills/roadmap-pulse/references/scoring-contract.md` (3) | The input `title` = issue title and `description` = the "What" section. Add §4.4's input-source table and the P-band floor. "references to bands in BACKLOG.md entries" is deleted |
| `skills/roadmap-pulse/references/dependency-inference.md` (3) | Per §4.3: native `blockedBy`/`blocking` is the persisted form. Suggestions go in the digest. `**Depends on:**` persistence is deleted. Sub-issue rollup is added |
| `skills/roadmap-pulse/references/digest-format.md` (3) | Per §4.6: location = the roadmap Artifact page. Scores live in the embedded JSON block. Drop the append-to-file instructions. "rest can stay in the BACKLOG" → "rest stay in the issue list" |
| `skills/roadmap-pulse/scripts/invoke_rubric.sh` | No change. It takes JSON on stdin |
| `skills/build-feature/SKILL.md:421-427, 485, 537` | "a BACKLOG.md entry" → "a GitHub issue (`Closes #N` in the PR body)". "land a runbook/BACKLOG entry" → "file an issue (`wi new --priority …`)" |
| `skills/status-check/SKILL.md:144` | "a BACKLOG status line per 'Status update on completion'" → "a runbook status line". Closing an issue a merged PR forgot is already its job |
| `skills/new-app/SKILL.md:11, 90-91` | "no pre-built backlog" → "no pre-filed issues". "BACKLOG appears when there's real out-of-scope work" → "work items are issues. Scaffold runs `labels/bootstrap.js` and syncs the issue forms". The no-WEEKLY_DIGEST line stays; add "roadmap-pulse publishes its Artifact on its first run" |
| `skills/new-app/references/new-app-brief.md:27` | "Don't pre-write a backlog or feature list" → "Don't pre-file issues or a feature list" |
| `skills/crash-monitor/SKILL.md:67, 68, 149, 320` | English ("Sentry's standing backlog"), so no wording change. **But** filed issues gain a P label: an unresolved production crash → `P0` if it's fatal on a user path, else `P1`, and 4b `needs-input` issues → `P1` |
| `skills/security-sweep/SKILL.md:3, 64` | English ("Dependabot PR backlog"), so no wording change. Tracked-advisory issues gain a P label: runtime-reachable high/critical → `P1`, other runtime → `P2`, build-time only → `P3` |
| `skills/device-test/SKILL.md:3` | English ("needs-build backlog"). No change. `device-test` issues stay outside the P scheme. A failure the drain *files as a bug* gets `P1` |
| `.github/workflows/pr-close-label-guard.yml:66` | Early-return when the PR carries `decision`, because closing a decision PR *is* the answer |

**rubric/\*: no functional change.** Here `backlog` is the rubric's lowest
**priority band**, not the file. `rubric-engine.js:75` returns `'backlog'`,
and that string is part of the scoring API that `report-generator.js:73-74, 194, 231-234, 317`,
`cli/commands/report.js:24, 207, 236-237`, `compare.js:241`, `evaluate.js:189`,
`templates/rubric-config.yml:17`, `docs/rubric-workflow.md:34, 102, 121` and the
tests (`unit/rubric-engine.test.js:77, 86, 129`, `integration/workflow.test.js:234`)
consume. Renaming it would be an API break with no benefit. The one change is
`rubric/README.md:34`, whose example `--output backlog.md` becomes
`--output prioritized.md` so it no longer suggests the retired file.
`README.md:3` ("gut-feel backlog decisions") is English and stays.

**App repos** (in each repo's migration PR, §5.7):

| File | Change |
|---|---|
| alate `CLAUDE.md:89-90` | The shared-docs check command targets `memory/project_regression_log.md`, not `BACKLOG.md` |
| alate `CLAUDE.md:96` | "BACKLOG status" → "runbook status" |
| alate `CLAUDE.md:99-111` | Keep the history. Add "the digest is now the roadmap Artifact, so the pulse needs no doc PR for it" |
| alate `CLAUDE.md:123` | Status update → `Closes #N` |
| alate `CLAUDE.md:134` | "History and findings go in BACKLOG" → "go in the issue" |
| alate `CLAUDE.md:212` | "BACKLOG + roadmap-pulse span ALL related repos" → "roadmap-pulse spans ALL related repos' issues". An item is filed **in the repo that owns the code** |
| alate `CLAUDE.md:308` | The BACKLOG link → the issues filter URL |
| alate `CLAUDE.md:310` | `backlog/` → `docs/briefs/`. (Today's link `./backlog/` is already broken: the directory is `docs/backlog/`) |
| alate `PROJECT_DOCS.md:16,24,46,60,100-110,156,165,200,213,226` | Mirror the doc-placement changes |
| alate `.husky/pre-commit:290` | The reminder says "came from an issue? `Closes #N` in the PR body" |
| mood-layer `CLAUDE.md:53` | Status update → `Closes #N` |
| mood-layer `CLAUDE.md:66` | "options go in BACKLOG" → "go in the issue" |
| mood-layer `CLAUDE.md:133` | The BACKLOG line → the issues filter URL |
| mood-layer `PROJECT_DOCS.md:13,37,45,60,64` | Mirror. Line 37 "walk BACKLOG.md for each feature" → "walk the open P0/P1 issues" |
| mood-layer `.husky/pre-commit:129` | Same as alate |
| loom `CLAUDE.md:53,81,88` + `PROJECT_DOCS.md:40` + `.husky/pre-commit:141` | Same pattern. `scripts/deploy/shouldDeploy.js:57` (`'backlog/'` in a docs-only path list) is harmless and stays |
| badige `PROJECT_DOCS.md:15,46` | Same pattern. badige's `CLAUDE.md` has no BACKLOG reference |

### 7. Rollout, rollback, risks

**Order.** Each step is shippable on its own, and forge ships only through a
`plugin.json` version bump:

1. **This RFD merges.** That is the approval.
2. **forge PR A — tooling, inert.** `tools/backlog-migrate/` with fixture tests
   cut from all four repos' real shapes (the hand corrections in Background are
   the first test cases), `tools/labels/bootstrap.js`, `tools/work-item/`
   (`wi new`), `templates/issue-forms/*` and the form-sync check. Nothing
   calls them yet.
3. **forge PR B — standards + skills + roadmap-pulse dual mode.** Everything in
   §6's forge tables, the P-labelling changes in crash-monitor and
   security-sweep, and the guard skip. **Bump `plugin.json`** (minor). In dual
   mode an un-migrated repo behaves exactly as today, so this bump is safe
   before any migration.
4. **Pilot: loom.** It is the smallest (9 entries), uses the list-item style,
   has one BACKLOG-touching PR (#164), and sits inside alate's pulse scope, so
   the cross-repo pulse path gets exercised. Steps: drain or rebase #164 →
   `bootstrap` → sync forms → `plan` → review the table in the migration PR →
   `apply` → `rewrite` → the freeze guard proven red → merge → run the pulse
   manually over alate+loom in mixed mode. The pilot is accepted when all
   9 issues exist with the right P, the ledger matches, a re-run of
   `apply` creates **0** issues, the guard fails the throwaway PR, and the
   pulse's top-10 cites loom issue URLs.
5. **mood-layer, then badige.** mood-layer tests the residual `review` cases.
   badige tests the heading-as-entry style and the device-test routing.
6. **alate last.** It is the largest (32 + 1 + 3 briefs) and has the most PRs in
   flight (#924 #926 #927 #928). Its `WEEKLY_DIGEST.md` gets the Artifact pointer
   line in the same PR.
7. **forge PR C.** Remove BACKLOG file mode from roadmap-pulse, bump `plugin.json`.

**Freeze protocol for live sessions.** Before `plan` in a repo:
`gh pr list --state open --json number,headRefName,files` → every PR touching
`BACKLOG.md` is merged, closed, or rebased to drop its BACKLOG hunk. Then
`wip` → nobody holds a claim on a BACKLOG-editing branch. Today only
badige#71 is claimed, and it does not touch BACKLOG. `plan` pins the source SHA,
and `apply` refuses if `origin/<default>:BACKLOG.md` has moved since. After the
pointer lands, the freeze guard turns any late session's BACKLOG edit into a
red check with an instruction, instead of a silent merge into a dead file.
A decision PR that edited BACKLOG (several of today's do) is rebased to put its
note in a comment on the relevant issue instead.

**Rollback.**

- *Per repo*, before the pointer PR merges: close the PR. The created issues
  are removed with `backlog-migrate rollback`, which closes them `not_planned`
  with a comment and removes `migrated-from-backlog`. It **never deletes**:
  deletion is irreversible and not an agent action, so the owner can delete by
  hand if wanted.
- *Per repo*, after merge: `git revert` the pointer commit. `BACKLOG.md`
  returns in full, and the pulse's dual mode automatically goes back to file
  mode for that repo. Then run `rollback` on the issues.
- *forge*: revert PR B/C and bump `plugin.json`.

Nothing in this plan destroys content. The BACKLOG text stays in git at the
pinned SHA, and every issue permalinks it.

**Risks**

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Losing context from long entries** (alate's 5 KB entries, mood-layer's 3 KB narratives) | Medium / high | The text is migrated verbatim, with only links rewritten. Every issue permalinks its exact source lines at a fixed SHA. The body cap is not reached (max 8,192 of 65,536). Nothing is summarised by the script. Trimming to current state happens later, by humans or the pulse, with the original one click away |
| **Parser mis-splits** (the 3 measured hazards) | High for alate / medium | Dry-run table reviewed in the PR before `apply`, `overrides.json`, and `review` verdicts instead of guesses. The fixture tests pin each measured hazard |
| **Notification spam** | Low / low | ~63 creates spread over four separate runs, no assignees, `@` neutralised, labels in the create call. The owner's own actions don't notify the owner by default. If any other account watches these repos, they will see the creates |
| **Duplicates on re-run or crash** | Medium without design / high | List-based marker index (never search), a per-write ledger, source-SHA pinning, and the pilot's "re-run creates 0" acceptance test |
| **Live sessions mid-edit on BACKLOG.md** (10 open PRs today) | High / medium | Freeze protocol + proven-red guard + dual-mode pulse. Migration is per repo, so one repo's freeze doesn't block the others |
| **Secondary rate limits** | Low at ~80 writes / high if hit | Serial ≥3 s, a 400/hour budget, retry-after, backoff, and a stop that the ledger makes safe |
| **The pulse silently reads a partial list** | Medium / high | `-L` on every list call, and the run metadata prints the per-repo open-issue count next to `gh issue list … --json number --jq length` from a separate call. A mismatch fails the run |
| **Label drift** (P0 + P2 on one issue, missing labels) | Medium / low | `wi new` validates at write time, the weekly lint catches the rest, and `bootstrap` aligns label sets |
| **Agents keep "adding a BACKLOG entry" out of habit** | High early / low | Every standard and CLAUDE.md line in §6 changes in the same release, and the guard gives the right instruction in its error |
| **Issue list becomes the new dumping ground** (the Backlog.md critique: markdown is reviewable in PRs, issues are not) | Medium / medium | Label hygiene + "deferred without a source" run weekly. `on hold` has a hard review-by date. Decisions still go through a reviewable PR (`decision`) |

### Security model

No change. Issues are visible to exactly the people who can see the private
repos today, the same audience as `BACKLOG.md`. The migration and pulse run
under the owner's existing `gh` auth. No new token and no `project` scope are
needed. The freeze guard and form-sync check run inside existing PR gates, so
there are no new workflows and no new CI minutes beyond a grep.

---

## Alternatives Considered

**A. Keep markdown, but split it: one file per item** (`backlog/<slug>.md`,
the Backlog.md model). This gets rid of the single-file collision, and the
items stay reviewable in PRs. It lost for three reasons: there is still no
claim, no `Closes #N`, and no native blocked-by; auto-filers would still write
issues, so the two-sources problem remains; and it needs a custom
parser/indexer for queries that `gh issue list --json` already answers. The
owner has already decided against markdown.

**B. Org-level issue fields (typed Priority single-select, number fields for
Reach/Effort) instead of P labels.** These are GA since 2026-07-02, org-only,
and native to sort and filter. They lost for now because the owner chose
labels and created them on 2026-09-18. Also, `gh issue list --json` does not
expose field values, so every pulse read would need GraphQL. Revisit when gh
exposes them. That would be a new ADR, and it would move only the RICE inputs
(§4.4), not priority.

**C. GitHub Projects v2 as the backlog view, with RICE number fields.** This
gives a cross-repo board and numeric filters. It lost because it needs the
`project` token scope (the cron and agent tokens lack it), has no computed
fields (the pulse would compute RICE and write it back anyway), and adds a
second place where state lives. A read-only Project view can be added later
without changing anything here.

**D. Keep `WEEKLY_DIGEST.md` as a file.** It is diffable and greppable in the
checkout. It lost (owner, Q2) because in alate it costs one PR per week and the file
is itself a collision surface. A pinned digest issue lost too: the owner
reads the roadmap Artifact, and one digest surface is enough.

**E. Native issue types instead of type labels.** The org has Task/Bug/Feature.
This lost because type labels already exist and are used by filters in three
repos, forms apply both, and running both stores the same fact twice. It could
be revisited with B.

**F. Migrate with a one-off agent session instead of a tool.** This lost
because the same run happens four times. Idempotency and the dry-run table
must be code, not care: the prior-art duplicate incidents all came from
dedupe that nothing enforced.

---

## Implementation Plan

Each step is one PR (or one per repo). Effort estimates are hypotheses.

1. **forge — tooling** (≈1.5 days): `tools/backlog-migrate/` (parse,
   classify, render, github, ledger + fixture tests from all four repos,
   including the three measured parser hazards and the four residual cases),
   `tools/labels/bootstrap.js`, `tools/work-item/` (`wi new`),
   `templates/issue-forms/*` + the sync/check mode wired into
   `code-inspection.yml`. No version bump needed. Nothing calls them yet.
2. **forge — standards, skills, pulse dual mode** (≈1.5 days): every forge
   row in §6, the P-labelling in crash-monitor / security-sweep / device-test,
   the `pr-close-label-guard` skip, and the pulse rewrite (§4) behind dual mode.
   **`plugin.json` minor bump.**
3. **loom pilot** (≈0.5 day): the freeze → bootstrap → forms → plan → review → apply →
   rewrite → guard sequence. Acceptance is in §7, step 4.
4. **mood-layer** (≈0.5 day), then **badige** (≈0.5 day). Same sequence.
5. **alate** (≈1 day): the same sequence plus the `docs/briefs/` move, the
   `WEEKLY_DIGEST.md` Artifact pointer, CI-comment rewrites, and the CLAUDE.md
   rows in §6.
6. **forge — remove file mode** (≈0.25 day): drop the BACKLOG path from
   roadmap-pulse and bump `plugin.json`.

## Open Questions

All resolved by the owner on 2026-09-18.

- [x] **Q1. P4 entries.** Map to `P3` with a `Deferred until: <trigger>` line. No `P4` label.
- [x] **Q2. Digest location.** The roadmap Artifact only. No digest issue, no `WEEKLY_DIGEST.md`, no weekly PR (§4.6).
- [x] **Q3. Resolved-with-residual entries.** File an issue for the residual only (device checks still route to the device-test queue).
- [x] **Q4. Old priority labels.** P labels only. Relabel loom's and mood-layer's `critical`/`high`/`medium`/`low` issues to P0–P3, then delete those four labels in each repo. 4b (watcher notification settings) dropped; pacing in §5.6 stands.
- [x] **Q5. Cross-repo entries.** File each in the repo that owns the code; litmus and tessellate-pages get the label set via bootstrap.
- [x] **Q6. Area labels.** *Amended by the owner 2026-09-19, superseding the 2026-09-18 "none added" ruling:* area labels are used **only in loom and alate**. loom keeps its existing set (`admin-ui api sdk extension supabase infra`); alate gets a new set, `mobile backend scraper fit-engine infra`, defined in `tools/labels` and created when alate is bootstrapped (step 5). mood-layer and badige get no area labels from the migration; mood-layer's existing area labels are left untouched, not deleted. The migration infers area only for loom and alate, and only on a confident path/keyword match; otherwise it leaves area empty.
- [x] **Q7. alate's `docs/backlog/` briefs.** Move to `docs/briefs/` and link each from its issue.

## Outcome

Rollout complete on 2026-09-19. Every app repo's `BACKLOG.md` is now a one-line
pointer with a freeze guard. Step 6 removed the pulse's file mode (forge 0.16.0).

| Step | PR |
|---|---|
| Decision | forge#151 |
| 1. forge tooling | forge#153 |
| 2. forge standards, skills, pulse dual mode | forge#152 (0.15.0) |
| loom pilot hand fixes, back into the tool | forge#155 |
| 3. loom pilot | loom#175 |
| 4. mood-layer, badige | mood-layer#141, badige#96 |
| 5. alate | alate#959 |
| 6. forge: remove file mode | forge#156 (0.16.0) |
| Cleanup: alate code comments repointed at issues | alate#960 |

**Issues filed:**

| Repo | Work issues | Device tests | Notes |
|---|---|---|---|
| loom | 9 | — | + alate#929 (cross-repo, filed in the repo that owns the code) |
| mood-layer | 9 | 2 | |
| badige | 7 | 2 | |
| alate | 31 (incl. 1 linked to an existing issue) | 2 | + cross-repo tessellate-pages#15, loom#177, litmus#54 |

**Known tool bugs** in `tools/backlog-migrate/`, found during the rollout:

1. **Open.** The parser glues a trailing resolved paragraph onto the previous
   entry.
2. **Fixed in step 6.** Target-repo inference missed an explicit
   `**Repo:** owner/name` line (alate's "v2 themed redesign" entry was planned
   into alate instead of tessellate-pages). The line now wins over the
   "(x repo)" heuristic, for known repos only
   (`__tests__/rollout-fixes.test.js`).
3. **Open.** "Verify … end-to-end" isn't detected as a device test.
4. **Open.** A `verdict` override masks `already-migrated` in the plan table.
5. **Fixed in step 6.** `rewrite` / `apply` stamped UTC dates, so a run in IST
   before 05:30 wrote yesterday's date. They now use the local calendar day
   (`localDate()` in `lib/commands.js`).
6. **Open.** `rewrite` doesn't scan source-code comments for BACKLOG pointers.
   alate's 18 BACKLOG code comments were repointed by hand in alate#960.

The tool is kept for any other app that still has a `BACKLOG.md`. Check the
open bugs above against its output before applying.
