#!/usr/bin/env node
/**
 * SessionStart hook — keeps the forge plugin current, and says so when it can't.
 *
 * Why this exists: `autoUpdate: true` on a git marketplace does not pull the clone
 * (proven by reflog 2026-07-27 — clone on 07-17, no pull until a manual one on 07-27),
 * and a no-op `claude plugin update` still reports success. Drift is therefore silent.
 * See memory: forge-plugin-staleness.
 *
 * TWO MODES, one file:
 *
 *   (default)   Hook mode. Cheap local checks only, then returns. Reports the outcome of
 *               the last background repair. Spawns the worker detached when a network
 *               check is due. Never blocks session start, never waits on the network.
 *
 *   --repair    Worker mode. Fetches, detects drift, and RUNS the two update commands.
 *               Verifies the result against the filesystem rather than trusting exit
 *               codes — the whole reason this exists is that the CLI reports success
 *               while doing nothing.
 *
 * A repair cannot fix the session that triggered it: the plugin is already loaded by the
 * time the hook runs. It makes the NEXT session correct. That limit is inherent, not a
 * defect — the hook says so in its message rather than implying it self-heals in place.
 *
 * OFF SWITCH: set FORGE_FRESHNESS_DISABLE=1 and neither mode runs. Nothing else to undo.
 *
 * RATE CEILING. This hook spawns a process on session start, so a repair that cannot succeed
 * is a repair that runs forever — observed 2026-07-29, one console window per session for a
 * whole working day. Three independent limits, deliberately layered, because the first two
 * require correctly diagnosing the failure and the third does not:
 *
 *   1. isVersionPinBlocked()  — latches off the one drift a retry provably cannot fix.
 *   2. consecutiveFailures    — backs repeated genuine failures down to daily.
 *   3. MIN_SPAWN_INTERVAL_MS  — a floor on ANY spawn, whatever the reason. This is the one
 *                               that covers failure modes nobody has characterised yet, so
 *                               nothing is allowed to bypass it. When adding a new "but we
 *                               should really check now" condition, put it inside this floor.
 *
 * The floor is measured from lastATTEMPT, which advances on every spawn. Measuring from
 * lastFetch (which only advances on SUCCESS) is what made limits 1 and 2 unreachable: a
 * failing fetch left the check permanently due. If state cannot be persisted the throttle
 * cannot work, so the hook fails CLOSED and skips the repair rather than run it unbounded.
 *
 * SHIPPED WITH THE PLUGIN, registered via hooks/hooks.json. Two consequences:
 *
 *   - All mutable state (throttle, lock, log) lives under the user's ~/.claude/hooks/,
 *     NEVER beside this file. A plugin update replaces the whole cache directory, which
 *     would wipe the throttle and orphan a held lock.
 *
 *   - The "installPath does not exist" check cannot fire for the ordinary missing-cache
 *     case, because this script lives in that cache and would be missing too. It is kept
 *     because it still catches the real case where the manifest points at a version
 *     directory other than the one actually on disk.
 *
 * Because `claude plugin update` compares version strings only, any change to this file
 * MUST come with a version bump in .claude-plugin/plugin.json or it will never reach an
 * installed cache. That is the same upstream bug this hook exists to detect:
 * https://github.com/anthropics/claude-code/issues/17361
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVersionPinBlocked } from './lib/version-pin.js';
import { shouldSpawnRepair } from './lib/spawn-decision.js';

const MARKETPLACE = 'tessellate-forge';
const PLUGIN = 'forge';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // network check at most hourly (worker is detached, so this costs no session latency)
const BACKOFF_INTERVAL_MS = 24 * 60 * 60 * 1000; // after repeated failures, back off to daily
const MAX_FAILURES_BEFORE_BACKOFF = 3;
// Hard rate ceiling. NOTHING bypasses this — not a live problem, not a fresh install, not a
// failure mode nobody has thought of yet. See the "RATE CEILING" note in the header.
const MIN_SPAWN_INTERVAL_MS = 10 * 60 * 1000;
const LOCK_STALE_MS = 15 * 60 * 1000;
const GIT_TIMEOUT_MS = 20_000;
const CLI_TIMEOUT_MS = 180_000;

const root = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const manifestPath = path.join(root, 'plugins', 'installed_plugins.json');
const clonePath = path.join(root, 'plugins', 'marketplaces', MARKETPLACE);
const hooksDir = path.join(root, 'hooks');
const statePath = path.join(hooksDir, '.forge-freshness-state.json');
const lockPath = path.join(hooksDir, '.forge-freshness.lock');
const logPath = path.join(hooksDir, 'forge-freshness.log');

const selfPath = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------- shared helpers

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

/** @returns {boolean} whether the patch actually reached disk. */
function writeState(patch) {
  try {
    fs.mkdirSync(hooksDir, { recursive: true });
    // Merge rather than overwrite: hook mode and worker mode both own different fields.
    fs.writeFileSync(statePath, JSON.stringify({ ...readState(), ...patch }, null, 2));
    return true;
  } catch {
    /* a read-only state file must never break session start */
    return false;
  }
}

function log(line) {
  try {
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()}  ${line}\n`);
  } catch {
    /* logging is best-effort */
  }
}

function git(args) {
  return execFileSync('git', ['-C', clonePath, ...args], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

/** Hash a directory's file contents so cache-vs-clone drift is detected exactly. */
function hashDir(dir) {
  if (!fs.existsSync(dir)) return null;
  const h = createHash('sha256');
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    h.update(name);
    h.update(fs.readFileSync(full));
  }
  return h.digest('hex');
}

function installedEntry() {
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  const entries = manifest?.plugins?.[`${PLUGIN}@${MARKETPLACE}`] ?? [];
  return entries.find((e) => e.scope === 'user') ?? entries[0] ?? null;
}

/** Clone HEAD sha, or null when it can't be read. Part of the version-pin block fingerprint. */
function cloneHead() {
  try {
    const sha = git(['rev-parse', 'HEAD']);
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function behindCount() {
  try {
    const n = git(['rev-list', '--count', 'HEAD..origin/master']);
    return /^\d+$/.test(n) ? Number(n) : null;
  } catch {
    return null;
  }
}

/** cache standards vs clone standards — differ means the clone has rules never extracted. */
function cacheBehindClone(entry) {
  const a = hashDir(path.join(entry.installPath, 'standards'));
  const b = hashDir(path.join(clonePath, 'standards'));
  return a && b && a !== b;
}

// ---------------------------------------------------------------- worker mode

function acquireLock() {
  try {
    fs.mkdirSync(hooksDir, { recursive: true });
    if (fs.existsSync(lockPath)) {
      const held = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (Date.now() - (held.ts ?? 0) < LOCK_STALE_MS) return false; // another repair in flight
      log(`breaking stale lock from pid ${held.pid}`);
    }
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    /* ignore */
  }
}

function resolveClaudeBin() {
  const local = path.join(
    os.homedir(),
    '.local',
    'bin',
    process.platform === 'win32' ? 'claude.exe' : 'claude'
  );
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  if (fs.existsSync(local)) return local;
  return 'claude'; // fall back to PATH resolution
}

function runCli(bin, args) {
  return execFileSync(bin, args, {
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function repair() {
  if (!acquireLock()) {
    log('repair skipped — another repair holds the lock');
    return;
  }

  try {
    const entry = installedEntry();
    if (!entry || !fs.existsSync(clonePath)) {
      log('repair skipped — forge not installed or no marketplace clone');
      return;
    }

    // Refresh remote refs first so the behind-count reflects reality.
    try {
      git(['fetch', '--quiet', 'origin']);
      writeState({ lastFetch: Date.now() });
    } catch {
      // Offline. Do NOT advance the throttle — recording a fetch that never happened
      // would blind the next interval on the strength of a failure.
      log('fetch failed — offline? leaving throttle unadvanced');
    }

    const behindBefore = behindCount();
    const cacheStaleBefore = cacheBehindClone(entry);
    const versionBefore = entry.version;

    if (!behindBefore && !cacheStaleBefore) {
      log('no drift — nothing to repair');
      // Clear a recorded FAILURE once the problem is gone, so it stops being announced.
      // A recorded success is kept: sessions still need to be told to restart.
      const prior = readState().lastRepair;
      writeState({
        consecutiveFailures: 0,
        ...(prior && !prior.ok ? { lastRepair: undefined } : {}),
      });
      return;
    }

    const bin = resolveClaudeBin();
    log(`drift detected (behind=${behindBefore ?? 'n/a'}, cacheStale=${cacheStaleBefore}) — repairing with ${bin}`);

    // Marketplace FIRST. The clone is what goes stale; updating the plugin alone no-ops.
    if (behindBefore) {
      try {
        runCli(bin, ['plugin', 'marketplace', 'update', MARKETPLACE]);
        log('ran: claude plugin marketplace update');
      } catch (err) {
        log(`marketplace update FAILED: ${String(err?.message ?? err).slice(0, 300)}`);
      }
    }

    try {
      runCli(bin, ['plugin', 'update', `${PLUGIN}@${MARKETPLACE}`]);
      log('ran: claude plugin update');
    } catch (err) {
      log(`plugin update FAILED: ${String(err?.message ?? err).slice(0, 300)}`);
    }

    // VERIFY AGAINST THE FILESYSTEM. The CLI reports success while no-oping — trusting
    // its exit code is the exact mistake that let this drift for ten days.
    const entryAfter = installedEntry();
    const behindAfter = behindCount();
    const cacheStaleAfter = entryAfter ? cacheBehindClone(entryAfter) : true;
    const versionAfter = entryAfter?.version ?? 'unknown';
    const healthy = !behindAfter && !cacheStaleAfter && !!entryAfter && fs.existsSync(entryAfter.installPath);

    // Distinguish two very different failures:
    //
    //   behindAfter > 0                     -> the update genuinely failed (network, CLI).
    //                                          Retrying later is worth it.
    //
    //   behindAfter == 0 && cacheStaleAfter -> VERSION-PINNED STALENESS. The clone is
    //                                          current but the cache was never re-extracted,
    //                                          because `claude plugin update` keys off the
    //                                          version string and forge shipped standards
    //                                          changes without bumping it (observed
    //                                          2026-07-28: PR #38 edited anti-patterns.md
    //                                          while plugin.json stayed at 0.4.2).
    //                                          Retrying is POINTLESS — the CLI will no-op
    //                                          forever. Only a forced re-extract fixes it,
    //                                          and that means removing the working copy, so
    //                                          this worker reports instead of attempting it
    //                                          unattended.
    const versionPinned = !healthy && !behindAfter && cacheStaleAfter;
    const state = readState();
    const failures = healthy || versionPinned ? 0 : (state.consecutiveFailures ?? 0) + 1;

    writeState({
      consecutiveFailures: failures,
      lastRepair: {
        ts: Date.now(),
        ok: healthy,
        versionPinned,
        // Fingerprint of the world this verdict was reached in. A version-pinned verdict
        // stays authoritative only while both still hold; see isVersionPinBlocked().
        pinnedAtVersion: versionPinned ? versionAfter : undefined,
        pinnedAtCloneHead: versionPinned ? cloneHead() : undefined,
        from: versionBefore,
        to: versionAfter,
        behindBefore,
        behindAfter,
        detail: healthy
          ? `updated forge ${versionBefore} -> ${versionAfter}`
          : versionPinned
            ? `the clone is current but the cached copy of v${versionAfter} was never re-extracted — ` +
              `forge changed standards without bumping its version, so 'claude plugin update' no-ops. ` +
              `This needs a forced reinstall: claude plugin uninstall ${PLUGIN}@${MARKETPLACE} && ` +
              `claude plugin install ${PLUGIN}@${MARKETPLACE}`
            : `repair ran but drift remains (behind=${behindAfter ?? 'n/a'}, cacheStale=${cacheStaleAfter})`,
      },
    });

    log(
      healthy
        ? `repair OK: ${versionBefore} -> ${versionAfter}`
        : versionPinned
          ? `repair BLOCKED: version-pinned staleness at v${versionAfter} — needs forced reinstall (not attempted unattended)`
          : `repair INCOMPLETE (failure #${failures}): behind=${behindAfter ?? 'n/a'} cacheStale=${cacheStaleAfter}`
    );
  } catch (err) {
    log(`repair threw: ${String(err?.message ?? err).slice(0, 300)}`);
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------- hook mode

function spawnWorker() {
  try {
    const child = spawn(process.execPath, [selfPath, '--repair'], {
      detached: true,
      stdio: 'ignore',
      // On Windows `detached` allocates a NEW console for the child, which
      // steals foreground focus. The worker has no console output to show
      // (stdio is 'ignore'; it logs to forge-freshness.log), so hide it.
      windowsHide: true,
      env: { ...process.env },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * The hook receives its event as JSON on stdin. We want session_id: this machine runs many
 * concurrent sessions, and a single "already reported" flag would mean only ONE of them
 * ever hears that a repair happened. Returns null when stdin isn't readable.
 */
function readSessionId() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw).session_id ?? null;
  } catch {
    return null;
  }
}

/** Has this session already been told about this specific repair? */
function shouldReportRepair(state, last, sessionId) {
  const reported = state.reported ?? {};
  if (reported.repairTs !== last.ts) return true; // a newer repair — nobody has heard yet
  if (!sessionId) return false; // no identity available; fall back to once-only
  return !(reported.sessions ?? []).includes(sessionId);
}

function recordRepairReported(state, last, sessionId) {
  const reported = state.reported ?? {};
  const sessions =
    reported.repairTs === last.ts ? [...(reported.sessions ?? [])] : [];
  if (sessionId && !sessions.includes(sessionId)) sessions.push(sessionId);
  writeState({
    reported: { repairTs: last.ts, sessions: sessions.slice(-50) }, // cap growth
  });
}

function hook() {
  const problems = [];
  const notes = [];
  const entry = installedEntry();
  if (!entry) return { problems, notes }; // forge not installed, or manifest unreadable — stay silent

  // Is anything actually wrong RIGHT NOW? Decided before replaying any repair history, so
  // a resolved-but-still-recorded failure is never announced to a healthy session.
  const installMissing = !entry.installPath || !fs.existsSync(entry.installPath);
  const cloneExists = fs.existsSync(clonePath);
  const cacheStale = !installMissing && cloneExists && cacheBehindClone(entry);
  const behind = !installMissing && cloneExists ? behindCount() : null;
  const liveProblem = installMissing || cacheStale || !!behind;

  // Report what the last background repair did — once per session, not once globally.
  const state = readState();
  const last = state.lastRepair;
  const sessionId = readSessionId();
  if (last?.ts && (last.ok || liveProblem) && shouldReportRepair(state, last, sessionId)) {
    recordRepairReported(state, last, sessionId);
    if (last.ok) {
      notes.push(
        `a background repair updated forge (${last.from} -> ${last.to}). ` +
          `This session is still running the previously loaded copy — restart to pick it up.`
      );
    } else if (last.versionPinned) {
      // The usual two-command refresh is the WRONG advice here — it is precisely what
      // no-ops. Give the forced-reinstall remedy instead.
      problems.push(`automatic repair cannot fix this one: ${last.detail}`);
    } else {
      problems.push(
        `an automatic forge repair ran and did NOT resolve the drift (${last.detail}). ` +
          `Run manually: claude plugin marketplace update ${MARKETPLACE} && ` +
          `claude plugin update ${PLUGIN}@${MARKETPLACE}`
      );
    }
  }

  // A registered path that no longer exists breaks skill loading outright.
  if (installMissing) {
    problems.push(
      `forge ${entry.version} is registered at a path that does not exist (${entry.installPath}). ` +
        `Skills will fail to load. Reinstall: claude plugin install ${PLUGIN}@${MARKETPLACE}`
    );
    return { problems, notes };
  }

  if (!cloneExists) return { problems, notes };

  // Whether a repair is even worth spawning is decided BEFORE describing the drift, so the
  // description can say what will actually happen. Announcing "a repair has been queued"
  // and then not queueing one is how a user ends up waiting on a fix that is never coming.
  const failures = state.consecutiveFailures ?? 0;
  const backedOff = failures >= MAX_FAILURES_BEFORE_BACKOFF;
  const pinBlocked = isVersionPinBlocked(last, entry, { cacheStale, behind, head: cloneHead() });

  // Throttle on lastATTEMPT, not lastFetch. lastFetch only advances when a fetch SUCCEEDS
  // (deliberately — see the fetch handler in repair()), so gating on it meant any persistent
  // fetch failure left the check permanently due and spawned a worker on every session.
  // An attempt counts as an attempt whether or not it achieved anything.
  const decision = shouldSpawnRepair({
    now: Date.now(),
    lastAttempt: state.lastAttempt,
    intervalMs: backedOff ? BACKOFF_INTERVAL_MS : CHECK_INTERVAL_MS,
    minIntervalMs: MIN_SPAWN_INTERVAL_MS,
    liveProblem,
    backedOff,
    pinBlocked,
  });
  // Spawn first, describe second. Recording the attempt can fail (read-only state file), and
  // that turns a queued repair into a skipped one — so the outcome has to be known before any
  // message claims it happened.
  //
  // The record is written BEFORE the spawn and the spawn only happens if it survived: without
  // persistable state the throttle above cannot function, and an unthrottleable repair loop is
  // worse than no repair at all. This is the one place the hook deliberately fails CLOSED, and
  // it reports rather than swallows — a silently disabled self-repair is precisely the failure
  // this hook exists to catch.
  let spawned = false;
  let attemptUnrecordable = false;
  if (decision.spawn) {
    if (writeState({ lastAttempt: Date.now() })) {
      spawned = spawnWorker();
    } else {
      attemptUnrecordable = true;
    }
  }

  const queued = spawned ? ' A repair has been queued.' : '';

  if (cacheStale) {
    problems.push(
      `forge standards in the plugin cache (v${entry.version}) differ from the marketplace ` +
        `clone on disk — the clone has rules that were never extracted.${queued}`
    );
  }

  if (behind) {
    problems.push(
      `the ${MARKETPLACE} clone is ${behind} commit(s) behind origin/master.${queued}`
    );
  }

  if (pinBlocked) {
    problems.push(
      `automatic repair is latched off for this one — retrying cannot fix version-pinned ` +
        `staleness, so it has stopped trying. Fix it with a forced reinstall: ` +
        `claude plugin uninstall ${PLUGIN}@${MARKETPLACE} && ` +
        `claude plugin install ${PLUGIN}@${MARKETPLACE}. The latch releases on its own if ` +
        `the clone or the installed version moves.`
    );
  } else if (backedOff && spawned) {
    problems.push(
      `automatic repair has failed ${failures} times in a row — it is now backed off to ` +
        `daily. See ${logPath} and fix it manually.`
    );
  }

  if (attemptUnrecordable) {
    problems.push(
      `cannot record a repair attempt (${statePath} is not writable), so the automatic ` +
        `repair was skipped rather than run unthrottled — it would otherwise retry on every ` +
        `session. Fix that file's permissions, or set FORGE_FRESHNESS_DISABLE=1 to turn this ` +
        `check off entirely.`
    );
  }

  return { problems, notes };
}

// ---------------------------------------------------------------- entry

// OFF SWITCH. Checked before anything else, and before either mode runs, so setting it stops
// both the session-start check and any new worker. Deliberately silent: a hook that printed a
// notice every session would be its own kind of nuisance. Unsetting it resumes normal
// behaviour with no other state to undo.
if (/^(1|true|yes|on)$/i.test(process.env.FORGE_FRESHNESS_DISABLE ?? '')) {
  process.exit(0);
}

if (process.argv.includes('--repair')) {
  try {
    repair();
  } catch {
    /* worker must never surface anything */
  }
  process.exit(0);
}

let result = { problems: [], notes: [] };
try {
  result = hook();
} catch {
  result = { problems: [], notes: [] }; // never let this hook be why a session starts noisily
}

const { problems, notes } = result;
if (problems.length > 0 || notes.length > 0) {
  const lines = [...problems, ...notes].map((p) => `- ${p}`).join('\n');
  const stale = problems.length > 0;
  // additionalContext MUST be nested under hookSpecificOutput with a
  // hookEventName — a top-level additionalContext key is silently ignored
  // ("Hook JSON output had unrecognized keys"), so the model never saw these
  // warnings. Verified against the debug log of a live session, 2026-08-26.
  process.stdout.write(
    JSON.stringify({
      systemMessage: `forge plugin: ${stale ? 'stale' : 'updated in background'}\n${lines}`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: stale
          ? `The forge plugin providing this session's standards and skills may be out of date. ` +
            `Findings:\n${lines}\n` +
            `An automatic repair runs in the background but CANNOT fix this session — the plugin ` +
            `is already loaded. Treat forge standards read this session as possibly superseded, ` +
            `and tell the user before relying on them for a merge, branch, or review decision.`
          : `A background repair updated the forge plugin. This session still holds the older ` +
            `copy loaded at startup:\n${lines}`,
      },
    })
  );
}

process.exit(0);
