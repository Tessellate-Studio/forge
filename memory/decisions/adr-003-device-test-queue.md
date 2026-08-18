# ADR-003 — Cross-app device-test queue: GitHub issue comments + a forge drain skill

**Status:** Accepted (user, 2026-08-18) · **Tier:** ADR (tactical — reversible, no code, single repo)

## Context

Sessions across alate, mood-layer, and badige ship changes that only a human
with the phone can verify. The user was prompting each session individually
for what to test; wanted a queue that fills itself and drains in one sitting.

## Decision

- **Queue medium: one pinned GitHub issue per app repo, items as comments.**
  Comments never merge-conflict across concurrent worktree branches; issues
  put zero files in the repo, so nothing can reach the app package. A shared
  queue *file* was rejected for exactly the shared-doc contention the
  anti-patterns standard documents; queue-in-forge was rejected because forge
  is public and items describe unreleased features.
- **Enqueue rule + comment format live once in `standards/workflows.md`**
  ("Device-test queue") — single-home principle; app CLAUDE.md files get a
  one-line pointer (separate per-app PRs).
- **Drain side is a forge skill (`skills/device-test/`)** holding the scope
  table with per-app delivery verification (alate: store builds + production
  OTAs with the fingerprint-stranding check; mood-layer: Expo Go; badige: APK
  sideload). Store-presence changes later touch only that table's Delivery
  cell.

## Consequences

- Every session enqueues autonomously; the user runs `/forge:device-test`
  when they have the phone — no per-session prompting.
- Stranded items (runtime fingerprint drift) are skipped with the exact
  unblock named, not silently retried.
- Failures are filed (regression log / issue) and linked from the item's
  Status line — the queue never becomes an investigation doc.
