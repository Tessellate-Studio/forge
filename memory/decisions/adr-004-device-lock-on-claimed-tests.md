# ADR-004 — The device lock is a claim on the tests, not a litmus issue

**Status:** Accepted (owner, 2026-09-25) · **Tier:** ADR (tactical, reversible) · **Supersedes** [RFD-003](./rfd-003-device-tests-as-issues-one-global-device-lock.md) §3 only; its queue medium (§1) and traceability (§2) stand

## Context

RFD-003 §3 put the device lock on one pinned issue per handset in
`Tessellate-Studio/litmus` (#43 Pixel, #44 iPhone) as a 🔒 comment. By
2026-09-25 the owner judged it a fool's errand: a second place to look, a
second claim format next to the 🚧 work claim, and a lock that said a phone
was busy without saying which test was on it. Meanwhile every test is already
its own issue (RFD-003 §1) and the `claimed` label + 🚧 work claim already
tell anyone who is on an issue.

## Decision

- **A drain claims each device-test issue it takes** with the ordinary work
  claim, plus a `Device` field: `wip claim <repo>#<n> --device pixel`. Same
  label, same session / worktree / related / docs fields as a PR claim.
- **A phone is busy while any OPEN device-test issue holds a live claim
  naming it.** `dtq` reads the `claimed` + `device-test` issues across the
  queue repos and prints the holder per phone; an unreadable repo makes every
  phone UNREADABLE, never free.
- **Two windows.** The work claim keeps its seven-day silence window; for the
  phone, a claim stops counting after 30 minutes with no touch (item activity
  counts), and never while `Waiting on: human`.
- **Race rules carry over unchanged** — post, then re-read; lowest comment id
  wins. GitHub comment ids are global, so this now settles races between
  drains that claimed different tests in different repos.
- **Tests carry a P label**, copied at enqueue from what they verify (the PR
  or the issues it closes; default P2), so drains and escalation can rank
  them. roadmap-pulse still never scores `device-test` issues.
- litmus #43/#44 closed and unpinned 2026-09-25.

## Consequences

- One claim format, one label, one board; the lock names the test.
- A drain must hold a claim continuously while on the phone: claim every test
  up front, and claim the next before releasing the last.
- A claim with no `Device` never locks the phone, so a session fixing a
  failed test can claim it without blocking a drain.

## Hardening from the adversarial review (2026-09-25)

- **Drains claim under `--holder <name>`.** A nested agent shares its parent's
  `CLAUDE_CODE_SESSION_ID` (verified: parent and a spawned subagent both
  printed `7c256b75…`), so session id alone made two drains one claimant.
- **Only a claim's own `Last touch` keeps the phone.** Issue activity
  refreshed every claim on the issue, reviving a crashed drain's.
- **A `--force` takeover retires the claim it replaced** — only when that
  claim was already silent or human-parked, so a same-test race still goes to
  the lower comment id.
- **A `--device` claim whose `claimed` label fails exits non-zero** — the lock
  is found by that label.
- **Closing a test drops its claim from the lock**, so the next test is
  claimed before the last one is closed or released.
