---
name: security-sweep
description: Dependency vulnerability sweep for a Tessellate app — runs npm audit + Dependabot, separates real advisories from chain noise, classifies each finding runtime-vs-build-time by dependency path, auto-fixes only what is semver-safe AND keeps the test suite green, files tracked issues for the rest, dismisses accepted residuals with written reasons, and maintains the app's dated disposition log. Use whenever the user asks to "run a security sweep", "check dependabot", "triage the vulns", "are we exposed", "npm audit this", "why do we have 50 vulnerabilities", or wants dependency alerts cleaned up or explained. Also fires on passive cues like "the alert list is getting noisy" or "should I care about these CVEs". Self-schedules bi-weekly via the scheduled-tasks MCP; also fires manually. Output is a per-app disposition table (fixed / tracked / accepted-and-dismissed) with distinct-advisory counts, plus PRs, issues, and log entries.
---

# Security sweep

You are a security scanner and auto-fixer for Tessellate apps. Find vulnerabilities, fix what's safe to fix automatically, escalate what isn't — with zero false confidence.

The bar is an honest disposition, not a zero on a dashboard. Most findings in an Expo/React Native tree are build tooling that never ships; saying so with evidence is the deliverable. Claiming "fixed" what isn't, or dismissing something you haven't traced, is the failure mode this skill exists to prevent.

Follow the triage policy in `Tessellate-Studio/forge` → `standards/security-triage.md` for all classification decisions. This file is the *procedure*; that one is the *policy*; each app's disposition log is the *current state*.

## Apps in scope

**The caller supplies scope.** Which apps to sweep, and where they are checked
out locally, come from the invoking prompt or scheduled task — not from this
file. Machine-specific paths do not belong in a versioned, public skill.

Package roots per app, which *are* stable and worth recording here:

| App | Repo | Package roots |
|---|---|---|
| alate | `Tessellate-Studio/alate` (private) | `mobile/` **and** `backend/` |
| badige | `Tessellate-Studio/badige` (private) | `.` |
| mood-layer | `Tessellate-Studio/mood-layer` (public) | `.` |

Shared audit log: `Tessellate-Studio/litmus` → `auto-ship-log.md` (default branch `main`).

**alate has two independent npm packages.** `mobile/` (Expo/RN app) and
`backend/` (Vercel serverless functions) each have their own `package.json` and
`package-lock.json`. Audit BOTH — several alerts live only in `backend/`. The
repo root has its own lockfile too, but it audits clean; don't stop there.

### Working safely in these checkouts

- **Check `git status` before branching.** These checkouts often sit on feature
  branches with uncommitted work (badige has had 80+ uncommitted deletions
  parked for a while). Always branch from `origin/master` after `git fetch`,
  never from whatever is checked out, and never commit unrelated dirty files.
- **When the checkout is dirty, use a scratch worktree** so you don't disturb
  it: `git worktree add /c/sweep/<app> -b <branch> origin/master`. Keep the path
  SHORT — a long path under the scratchpad dir hits Windows' filename limit and
  the worktree add fails partway. Remove it when done.
- **Exception: alate must be worked in the main checkout.** Its pre-push hook
  requires `node_modules` in both `backend/` and `mobile/`, and a fresh worktree
  isn't bootstrapped. Switch the main checkout's branch, do the work, then
  restore the original branch when finished.
- **Record the starting ref before you touch anything** — `git rev-parse
  --abbrev-ref HEAD`, and `git rev-parse HEAD` as well when it prints `HEAD`
  (alate is routinely left on a detached commit). Step 6 restores it, and there
  is no way to recover it once you have switched away.
- **Every branch you create is yours to delete** — see Step 6. The sweep opens
  four to five branches a cycle; unless they are cleaned up they accumulate in
  every repo indefinitely.
- alate's `master` is the default branch; so is badige's. litmus uses `main`.

## Step 1: Scan for vulnerabilities

For each app:

### 1a. npm audit

```bash
cd <local-checkout>/<package-root>
npm audit --json
```

Parse the JSON output. For each advisory, extract:
- Package name, severity (critical/high/moderate/low), vulnerability type
- Whether it's a direct or transitive dependency
- Whether a fix is available and if it's semver-compatible
- Whether the package is in `dependencies` (ships in the app binary = runtime) or `devDependencies` (build-time only)

### 1a-i. Separate real findings from chain noise — do this FIRST

`npm audit`'s headline count is badly misleading on RN/Expo projects. A package
appears in `vulnerabilities` either because it *has* an advisory, or merely
because something it depends on does. Only the first kind is a real finding.

In the JSON, each entry's `via` array holds **objects** for real advisories and
**strings** for "depends on a vulnerable version of X". Filter to entries with at
least one object in `via`. Typical result: 53 reported → 3 real. Triage the 3.

Consequences worth internalising:

- **A fix can raise the headline count while lowering real exposure.** Adding
  packages to the tree adds more *dependents* of an already-known unpatchable
  leaf, each counted separately. Seen twice in the 2026-07-28 sweep: alate
  mobile 23→53 and badige 11→58, both while distinct advisories went *down*.
  Always report distinct-vulnerable-package counts, and explain the raw number
  in the PR body so it doesn't read as a regression.
- Never treat a rising count as a reason to abandon a fix that tests green.

### 1a-ii. "No patch exists" — verify, don't infer

An advisory range written `<=X` does **not** mean X is the newest release. It
usually means X was newest *when the advisory was published*. Getting this wrong
produces confidently false disposition logs (it happened on 2026-07-28 and
needed three follow-up correction PRs).

Before writing "no patch exists", run:

```bash
npm view <package> version
```

Compare that to the advisory range. Real examples from 2026-07-28:

| Package | Advisory range | Latest published | Patch exists? |
|---|---|---|---|
| `brace-expansion` | `<=5.0.7` | 5.0.8 | yes — capped by `glob`/`minimatch` pins |
| `tar` | `<=7.5.20` | 7.5.22 | yes — capped by `@expo/cli`'s `^6.0.5` |
| `postcss` | `<=8.5.17` | 8.5.24 | yes |
| `ip` | `<=2.0.1` | 2.0.1 | **no** — genuinely unpatched |

The correct phrasing when a patch exists but is unreachable is "patched in X,
capped by <parent>'s pin" — not "no fix available". The distinction changes the
re-check plan: one clears on a parent bump, the other can't clear at all.

### 1b. Dependabot alerts

```bash
gh api repos/<github-repo>/dependabot/alerts --paginate \
  -q '.[] | select(.state=="open") | {number, severity: .security_advisory.severity, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem, scope: .dependency.scope, summary: .security_advisory.summary}'
```

Cross-reference with npm audit results to avoid duplicates.

**Dependabot's `scope` field is not trustworthy for this decision.** It reflects
lockfile position, not what ships in the artifact. Nearly every alert across
these three apps reports `scope=runtime` while actually being build tooling.
Classify from the dependency path instead — `npm explain <pkg>` — not the label.

### 1b-i. Runtime vs build-time: resolve by path, not by tree root

This is the primary triage axis, and the naive test ("is the root in
`dependencies`?") gets it wrong constantly, because `expo` and `react-native`
are runtime deps that drag in large CLI toolchains.

Treat as **build-time** regardless of which root pulls them in:
`@expo/cli`, `@expo/prebuild-config`, `@expo/config-plugins`, `@expo/image-utils`,
`@react-native-community/cli-*`, `@react-native/dev-middleware`, Metro, `xcode`,
`glob`/`minimatch`/`brace-expansion`, jest, eslint, detox, babel plugins,
`@vercel/build-utils` and `@vercel/python-analysis` (Vercel's deploy adapter —
it runs in Vercel's build infra, not in the deployed function).

Treat as **runtime** when the vulnerable package is reached by app/server code:
anything imported from `mobile/src/**` or `backend/api/**` and `backend/sdk/**`.

When unsure, `npm explain <pkg>` and read the actual chain, then grep the source
for an import. A package can be declared in `dependencies` and still be dead
weight — check before assuming it's runtime.

## Step 2: Classify each finding

Per the `security-triage.md` standard, classify into one of four buckets:

### 2a. RUNTIME + PATCH AVAILABLE + SEMVER-COMPATIBLE → auto-fix

These are safe to fix automatically:
1. **Capture a baseline FIRST** — run the test suite before touching anything,
   on the same branch you'll be committing to. Without it you can't tell a
   fix-caused failure from a pre-existing one. (mood-layer's suite also fails
   spuriously on the very first run after a cold `npm install`; run it twice
   before believing a red result.)
2. `npm audit fix` (no `--force`) — semver-compatible, lockfile-only
3. **Confirm `package.json` was NOT modified** — `git status` should show only
   `package-lock.json`. If a manifest changed, the fix bumped a direct
   dependency; that's out of scope for the safe pass, revert and route to 2b.
4. **Run `npm ci` and confirm it succeeds.** `npm audit fix` can leave the
   lockfile internally inconsistent (seen on alate `backend/`: optional
   `@emnapi/*` platform packages left unsatisfiable). CI uses `npm ci`, so a
   lockfile that only works with `npm install` is a broken build. If it fails,
   run `npm install` to reconcile, then re-verify.
5. Run the full test suite: `npx jest --no-coverage` (and `npx tsc --noEmit` if
   TypeScript). Compare against the step-1 baseline.
6. If tests pass:
   - Create branch: `security-sweep/<app>-deps-<date>`
   - Commit with message: `fix(deps): patch <package> — <CVE or advisory ID>`
   - Open PR with labels: `security-sweep`, `auto-generated`
   - Auto-merge: `gh pr merge --squash --auto <pr-number>`
   - Log to `Tessellate-Studio/litmus` auto-ship-log.md:
     `| <date> | security-sweep | <repo> | PR #<n> | patch <package> | <CVE/advisory> |`
7. If tests regress vs baseline: **discard the lockfile change** (`git checkout
   -- package-lock.json`) and route to 2b. Do not ship a red suite to patch a
   build-time-only finding — that trade is never worth it.

**Heredocs:** this environment's Bash tool is POSIX sh, not PowerShell. Use
`<<'EOF'`, never `@'...'@` — the latter silently prepends a literal `@` to the
commit message.

### 2b. RUNTIME + PATCH REQUIRES MAJOR BUMP → tracked issue

These can't be auto-fixed safely:
1. Open a GitHub issue in the **app repo** (not litmus):
   - Title: `[security-sweep] Upgrade <package> to <version> — <severity> vuln`
   - Body: advisory details, what breaks on upgrade, suggested migration path
   - Labels: `security`, `needs-triage`
2. Send a push notification if severity is HIGH or CRITICAL:
   `"Security: <severity> vuln in <package> (<repo>) requires major upgrade. Issue filed — <1-2 sentence what's at risk>."`

### 2c. BUILD-TIME-ONLY + NOT REACHABLE → accepted residual

These run only on dev/build machines, not in the shipped binary:
1. Log as accepted-residual in the app's disposition log:
   ```
   | <date> | <package> | <severity> | <advisory-id> | Accepted: build-time-only. <1-line reason, incl. whether a patch exists but is capped> |
   ```
2. **Dismiss the Dependabot alert** — see Step 2e. An accepted residual that
   stays open forever is what turns the alert list into noise nobody reads.
3. No PR, no issue, no notification beyond that.

### 2d. BUILD-TIME-ONLY + PATCH AVAILABLE → auto-fix (lower priority)

Same flow as 2a but with lower urgency label:
- Labels: `security-sweep`, `auto-generated`, `build-time`
- No push notification regardless of severity

### 2e. Close the loop — dismiss alerts you accepted

Triage is only finished when the alert list reflects the decision. Every finding
classified **2c (accepted residual)** must be dismissed on GitHub, with the
reasoning attached. Otherwise accepted alerts accumulate indefinitely and the
next sweep re-triages the same things.

```bash
gh api -X PATCH repos/Tessellate-Studio/<repo>/dependabot/alerts/<n> \
  -f state=dismissed \
  -f dismissed_reason=<reason> \
  -f dismissed_comment="<why, in one or two sentences>"
```

Valid `dismissed_reason` values, and when each applies here:

| Reason | Use for |
|---|---|
| `tolerable_risk` | Build-time tooling — the code runs, but only on a dev machine or build runner, never in the shipped artifact. This is the default for this ecosystem. |
| `not_used` | The vulnerable code path is genuinely never invoked (e.g. an iOS-only plist parser in an Android-only project). |
| `fix_started` | A tracked issue or PR exists and is the agreed path. |
| `inaccurate` | The advisory doesn't apply to how the package is used here. |
| `no_bandwidth` | Avoid — it records nothing useful for the next sweep. |

**Never dismiss:**
- Anything runtime-reachable, whatever the severity.
- Anything with a **reachable** fix that was merely deferred — that belongs in a
  2b tracked issue and the alert stays OPEN so it isn't forgotten. (Example:
  mood-layer's `brace-expansion` GHSA-3jxr-9vmj-r5cp is fixable by the safe
  pass; the fix was deferred only because it breaks the RN jest environment. It
  stays open, tracked in an issue.)
- Anything you haven't personally traced with `npm explain`.

The dismissal comment is part of the audit trail — write it so the next sweep
(or a human six months out) can tell why without re-deriving it. State the
dependency path and whether a patch exists but is capped.

Dismissing requires the `security_events` scope on the `gh` token. If the API
returns 403, do NOT skip the step silently — log the accepted residuals in the
disposition log as normal, and report at the end that dismissal needs a token
with `security_events` before it can run.

## Step 3: Critical/high runtime with no patch — immediate escalation

If npm audit reports a **critical or high severity** vulnerability in a **runtime dependency** with **no patch available**:

1. Open a GitHub issue in the app repo immediately:
   - Title: `[URGENT] [security-sweep] <severity> vuln in <package> — no patch available`
   - Body: full advisory, what's at risk, workaround options if any, alternative packages
   - Labels: `security`, `urgent`, `needs-triage`
2. Send a push notification:
   `"URGENT: <severity> runtime vuln in <package> (<repo>) — no patch exists. <1-2 sentence what's exposed and what the workaround options are>."`

These can't wait for the bi-weekly cycle — the notification ensures the user sees it.

## Step 4: Update disposition logs

Each app already has a log — **use the existing file and its conventions, don't
create a parallel one**:

| App | Disposition log |
|---|---|
| alate | `docs/DEPENDENCY_ALERTS.md` (**not** `docs/SECURITY.md`, which doesn't exist there; `backend/SECURITY.md` is architecture, not alerts) |
| badige | `docs/SECURITY.md` |
| mood-layer | `docs/SECURITY.md` |

Read the existing file before writing. These logs carry prior triage decisions
with real reasoning — check whether a finding is already dispositioned and say
"unchanged from <date>" rather than re-deriving or contradicting it.

Update each with dated entries:

```markdown
## Security sweep — <date>

### Fixed
| Package | Severity | Advisory | PR |
|---|---|---|---|
| <package> | <severity> | <id> | #<n> |

### Needs upgrade (tracked)
| Package | Severity | Advisory | Issue | Current → Required |
|---|---|---|---|---|
| <package> | <severity> | <id> | #<n> | <current> → <required> |

### Accepted residual
| Package | Severity | Advisory | Reason |
|---|---|---|---|
| <package> | <severity> | <id> | <reason> |
```

If `docs/SECURITY.md` doesn't exist, create it with a header explaining its purpose.

## Step 5: Cross-repo summary

Print a concise summary across all apps:

```
## Security sweep — <date>

| App | Vulns found | Auto-fixed | Needs upgrade | Accepted | Critical/no-patch |
|---|---|---|---|---|---|
| alate | <n> | <n> (PRs: ...) | <n> (Issues: ...) | <n> | <n> |
| badige | ... | ... | ... | ... | ... |
| mood-layer | ... | ... | ... | ... | ... |
```

For each auto-fixed PR: 1-line summary with link.
For each tracked issue: 1-line summary with link + **inline explanation of what upgrade is needed and what might break**.
For critical/no-patch: 1-line summary with link + **inline explanation of what's at risk**.

If all apps are clean: `"No open vulnerabilities — clean sweep."`

## Step 6: Clean up the branches this sweep created

A sweep that leaves its branches behind is a sweep that quietly litters four
repos every fortnight. By 2026-08-03 there were **13 stale `security-sweep/*`
branches** across the five repos, the oldest from 2026-07-28 — none of them
deleted, because `delete_branch_on_merge` was `false` everywhere. Do both
halves below; the setting prevents the next mess, the sweep only cleans its own.

### 6a. Make sure the repo deletes merged branches for you

Check once per repo per sweep — it's one call and it is the fix that lasts:

```bash
gh api repos/Tessellate-Studio/<repo> -q '.delete_branch_on_merge'
```

If `false`, turn it on (this is a repo settings change — it is in scope for the
sweep because the sweep is what creates the branches):

```bash
gh api -X PATCH repos/Tessellate-Studio/<repo> -F delete_branch_on_merge=true
```

With this on, GitHub deletes the remote branch the moment the PR squash-merges
and later sweeps need no remote cleanup at all.

### 6b. Delete the local branch — GitHub can't do this half

`delete_branch_on_merge` only touches the remote. The local branch in the
checkout survives, and so does its now-dangling remote-tracking ref.

**Verify the PR actually merged before deleting anything.** Never infer it from
the branch being "old":

```bash
gh pr list -R Tessellate-Studio/<repo> --head <branch> --state all -q '.[0].state'
```

Only when that prints `MERGED`:

```bash
git -C <checkout> remote prune origin
git -C <checkout> branch -D <branch>
```

**`-D` is required, and that is expected — not a warning sign.** These PRs are
squash-merged, so the branch tip is never an ancestor of the default branch
(`gh api .../compare/<default>...<branch>` reports `ahead_by=1` even though the
content is fully merged). `git branch -d` will always refuse. The merged-PR
check above is what makes `-D` safe; without it, `-D` is a data-loss risk.

Do this only for branches **this sweep created**. If you find older
`security-sweep/*` branches from previous runs, they are safe to clean the same
way — merged-PR check first, every time — but say so in the summary rather than
deleting them silently.

### 6c. Then restore the checkout

Delete the branches first, restore last — you cannot delete the branch you are
standing on. Return each checkout to the branch (or detached commit) you found
it on, and record that ref at the very start of the sweep
(`git rev-parse --abbrev-ref HEAD`, plus `git rev-parse HEAD` when it is
detached) because you cannot recover it afterwards.

> **Watch for the base moving under you.** `git checkout -b <branch>
> origin/master` pins the branch to whatever `origin/master` was *at that
> moment*. On a long sweep another automation can advance the default branch,
> and a later `git fetch` will not move your branch. On 2026-08-03 this put a
> loom commit on a branch created from a two-day-old base while the real work
> sat on local `main`. Before opening the PR, confirm the branch actually
> contains your commit (`git log --oneline -1 <branch>`) and that the PR's file
> list matches what you intended (`gh pr view <n> --json files`). If the base
> drifted, fast-forward the branch onto your commit rather than force-resetting
> it.

## CRITICAL RULES

- NEVER `npm audit fix --force` — it can bump react-native to a new major and break the native build
- NEVER suppress or silence a vulnerability finding without logging it. Dismissing an alert per Step 2e **with a written reason** is not suppression; dismissing one you haven't traced is
- NEVER dismiss a runtime-reachable alert, or one whose fix is reachable and merely deferred
- NEVER commit secrets, env values, or API keys
- NEVER include unrelated uncommitted files in a sweep commit — check `git status` before staging
- Always capture a test baseline BEFORE fixing, and verify `npm ci` after
- Runtime vs build-time classification is the primary triage axis — resolve it with `npm explain`, not with Dependabot's `scope` label
- Verify "no patch exists" with `npm view <pkg> version` before ever writing it down
- Count distinct advisories (objects in `via`), not npm's headline number
- The disposition log is mandatory — it's the audit trail. Use each app's existing file
- Auto-ship log entries are mandatory for every auto-merged PR
- When in doubt about classification, route to 2b (tracked issue) — false negatives are worse than false positives
- Clean up every branch this sweep created (Step 6) — and NEVER `git branch -D` one without first confirming its PR reads `MERGED`
- Restore each checkout to the branch you found it on when the sweep finishes