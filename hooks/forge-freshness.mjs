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
 *   --repair    Worker mode. Fetches, detects drift, and fixes it in three steps:
 *
 *                 1. `claude plugin marketplace update`  — pulls the clone.
 *                 2. `claude plugin update`               — when the clone's version string
 *                                                            moved, so the CLI extracts a new
 *                                                            version directory the way it means to.
 *                 3. copy the clone over every installed  — the backstop. Step 2 keys off the
 *                    directory that still differs           version string, and `install`
 *                                                            reuses an existing version dir,
 *                                                            so a change shipped WITHOUT a bump
 *                                                            is unreachable by any CLI command
 *                                                            (proven 2026-09-09: uninstall +
 *                                                            install left 0.12.9/ five commits
 *                                                            stale). Step 2 also only touches the
 *                                                            user scope; every per-project and
 *                                                            per-worktree install drifts until
 *                                                            something copies into it. This does.
 *
 *               Verifies the result against the filesystem rather than trusting exit codes —
 *               the whole reason this exists is that the CLI reports success while doing nothing.
 *
 * A repair cannot fix the session that triggered it: the plugin is already loaded by the
 * time the hook runs. It makes the NEXT session correct. That limit is inherent, not a
 * defect — the hook says so in its message rather than implying it self-heals in place.
 *
 * OFF SWITCH: set FORGE_FRESHNESS_DISABLE=1 and neither mode runs. Nothing else to undo.
 *
 * RATE CEILING. This hook spawns a process on session start, so a repair that cannot succeed
 * is a repair that runs forever — observed 2026-07-29, one console window per session for a
 * whole working day. Two layered limits:
 *
 *   1. consecutiveFailures    — backs repeated genuine failures down to daily.
 *   2. MIN_SPAWN_INTERVAL_MS  — a floor on ANY spawn, whatever the reason. This is the one
 *                               that covers failure modes nobody has characterised yet, so
 *                               nothing is allowed to bypass it. When adding a new "but we
 *                               should really check now" condition, put it inside this floor.
 *
 * (There used to be a third — a latch for "version-pinned" staleness the worker refused to
 * fix unattended, telling the user to uninstall and reinstall by hand. That advice was
 * wrong: the reinstall reuses the stale directory. Step 3 above fixes that case directly,
 * so the latch is gone; a sync that genuinely fails is an ordinary failure for limit 1.)
 *
 * The floor is measured from lastATTEMPT, which advances on every spawn. Measuring from
 * lastFetch (which only advances on SUCCESS) is what made limit 1 unreachable: a failing
 * fetch left the check permanently due. If state cannot be persisted the throttle cannot
 * work, so the hook fails CLOSED and skips the repair rather than run it unbounded.
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
 * Step 3 means a change to this file reaches installed caches without a version bump —
 * once the installed copy is one that has step 3. Bump the version anyway when the hook
 * changes; it costs nothing and keeps `claude plugin list` honest.
 * Upstream bug for the version-string comparison:
 * https://github.com/anthropics/claude-code/issues/17361
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldSpawnRepair } from './lib/spawn-decision.js';
import { emit } from './lib/session-start.js';
import { treeHash, syncTree } from './lib/cache-sync.js';

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

const root =
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
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
    fs.writeFileSync(
      statePath,
      JSON.stringify({ ...readState(), ...patch }, null, 2)
    );
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

/** Every manifest entry for forge, whatever its scope. Empty when the manifest is unreadable. */
function installedEntries() {
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest?.plugins?.[`${PLUGIN}@${MARKETPLACE}`] ?? [];
  } catch {
    return [];
  }
}

function samePath(a, b) {
  if (!a || !b) {
    return false;
  }
  const norm = p =>
    path
      .resolve(p)
      .replace(/[\\/]+$/, '')
      .toLowerCase();
  return norm(a) === norm(b);
}

/**
 * The entry THIS session loaded. Claude Code sets CLAUDE_PLUGIN_ROOT to the directory it
 * ran the hook from, which is ground truth for "what is this session reading" — better
 * than guessing which of a user-scope and several project-scope entries the loader chose.
 * Falls back to the user entry, then the first, when the variable is absent (tests, a
 * manual run).
 */
function installedEntry(entries = installedEntries()) {
  const loaded = process.env.CLAUDE_PLUGIN_ROOT;
  return (
    (loaded && entries.find(e => samePath(e.installPath, loaded))) ??
    entries.find(e => e.scope === 'user') ??
    entries[0] ??
    null
  );
}

/**
 * Distinct install directories a session could still load: on disk, and either user-scoped
 * or belonging to a project directory that still exists. A deleted worktree's entry is
 * skipped rather than repaired — nothing will ever start there again. Several entries
 * usually share one directory (every main checkout at the same version), hence distinct.
 */
function liveInstallPaths(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!e.installPath || !fs.existsSync(e.installPath)) {
      continue;
    }
    if (e.scope !== 'user' && e.projectPath && !fs.existsSync(e.projectPath)) {
      continue;
    }
    const key = path.resolve(e.installPath).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(e.installPath);
  }
  return out;
}

function behindCount() {
  try {
    const n = git(['rev-list', '--count', 'HEAD..origin/master']);
    return /^\d+$/.test(n) ? Number(n) : null;
  } catch {
    return null;
  }
}

/** Installed dir vs clone — differ means the clone has content sessions never see. */
function cacheBehindClone(installPath, cloneDigest = treeHash(clonePath)) {
  const a = treeHash(installPath);
  return !!a && !!cloneDigest && a !== cloneDigest;
}

/** The version string the clone would install as. */
function cloneVersion() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(clonePath, '.claude-plugin', 'plugin.json'),
        'utf8'
      )
    ).version;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- worker mode

function acquireLock() {
  try {
    fs.mkdirSync(hooksDir, { recursive: true });
    if (fs.existsSync(lockPath)) {
      const held = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (Date.now() - (held.ts ?? 0) < LOCK_STALE_MS) {
        return false; // another repair in flight
      }
      log(`breaking stale lock from pid ${held.pid}`);
    }
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, ts: Date.now() })
    );
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
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) {
    return process.env.CLAUDE_BIN;
  }
  if (fs.existsSync(local)) {
    return local;
  }
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

/** Steps 1 and 2 of the repair: the CLI's own update path, run only where it can do anything. */
function runCliUpdates(bin, behind, entry) {
  // Marketplace FIRST. The clone is what goes stale; updating the plugin alone no-ops.
  if (behind) {
    try {
      runCli(bin, ['plugin', 'marketplace', 'update', MARKETPLACE]);
      log('ran: claude plugin marketplace update');
    } catch (err) {
      log(
        `marketplace update FAILED: ${String(err?.message ?? err).slice(
          0,
          300
        )}`
      );
    }
  }

  // `plugin update` compares version strings, so it is a guaranteed (and slow — 1-2 min)
  // no-op unless the clone's version moved. Skip it when it cannot act; step 3 covers
  // the content either way.
  const target = cloneVersion();
  if (target && entry && target !== entry.version) {
    try {
      runCli(bin, ['plugin', 'update', `${PLUGIN}@${MARKETPLACE}`]);
      log(`ran: claude plugin update (${entry.version} -> ${target})`);
    } catch (err) {
      log(`plugin update FAILED: ${String(err?.message ?? err).slice(0, 300)}`);
    }
  }
}

/**
 * Step 3: copy the clone over every live install that still differs from it. Hashing a tree
 * costs a read of every file, so `known` (already hashed by the caller) is trusted and only
 * directories the caller never saw — one `plugin update` just extracted — are hashed here.
 */
function syncStaleInstalls(dirs, known) {
  const digest = treeHash(clonePath);
  const synced = [];
  for (const dir of dirs) {
    const stale = known.has(dir)
      ? known.get(dir)
      : cacheBehindClone(dir, digest);
    if (!stale) {
      continue;
    }
    const r = syncTree(clonePath, dir);
    log(
      `synced clone -> ${dir}: ${r.written} written, ${r.removed} removed, ${r.failed.length} failed`
    );
    for (const f of r.failed.slice(0, 5)) {
      log(`  could not sync ${f.rel}: ${f.error}`);
    }
    synced.push(dir);
  }
  return synced;
}

function repair() {
  if (!acquireLock()) {
    log('repair skipped — another repair holds the lock');
    return;
  }

  try {
    const entries = installedEntries();
    const entry = installedEntry(entries);
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
    const digestBefore = treeHash(clonePath);

    // dir -> stale?  One content hash per directory; reused by step 3 below.
    const verdicts = new Map(
      liveInstallPaths(entries).map(dir => [
        dir,
        cacheBehindClone(dir, digestBefore),
      ])
    );
    const staleBefore = [...verdicts]
      .filter(([, stale]) => stale)
      .map(([d]) => d);
    const versionBefore = entry.version;

    if (!behindBefore && staleBefore.length === 0) {
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
    log(
      `drift detected (behind=${behindBefore ?? 'n/a'}, stale installs=${
        staleBefore.length
      }) — repairing with ${bin}`
    );

    runCliUpdates(bin, behindBefore, entry);

    // Re-read: `plugin update` may have added a new version directory to the manifest.
    // The marketplace update may also have moved the clone, so verdicts taken against the
    // old clone are only trusted while its content is unchanged.
    const entriesAfter = installedEntries();
    const dirsAfter = liveInstallPaths(entriesAfter);
    const cloneMoved = treeHash(clonePath) !== digestBefore;
    const synced = syncStaleInstalls(
      dirsAfter,
      cloneMoved ? new Map() : verdicts
    );

    // VERIFY AGAINST THE FILESYSTEM. The CLI reports success while no-oping — trusting
    // its exit code is the exact mistake that let this drift for ten days. Only directories
    // this run touched or never hashed need re-reading; the rest were verified equal above.
    const entryAfter = installedEntry(entriesAfter);
    const behindAfter = behindCount();
    const digestAfter = treeHash(clonePath);
    const staleAfter = dirsAfter.filter(dir =>
      !cloneMoved && verdicts.has(dir) && !synced.includes(dir)
        ? false
        : cacheBehindClone(dir, digestAfter)
    );
    const versionAfter = entryAfter?.version ?? 'unknown';
    const healthy =
      !behindAfter &&
      staleAfter.length === 0 &&
      !!entryAfter &&
      fs.existsSync(entryAfter.installPath);

    const state = readState();
    const failures = healthy ? 0 : (state.consecutiveFailures ?? 0) + 1;

    const how =
      versionBefore !== versionAfter
        ? `updated forge ${versionBefore} -> ${versionAfter}`
        : `refreshed forge ${versionAfter} in place`;
    const where =
      synced.length > 0
        ? ` (${synced.length} install dir(s) synced from the clone)`
        : '';

    writeState({
      consecutiveFailures: failures,
      lastRepair: {
        ts: Date.now(),
        ok: healthy,
        from: versionBefore,
        to: versionAfter,
        behindBefore,
        behindAfter,
        synced: synced.length,
        detail: healthy
          ? `${how}${where}`
          : `repair ran but drift remains (behind=${behindAfter ?? 'n/a'}, ` +
            `stale installs=${staleAfter.length}) — see ${logPath}`,
      },
    });

    log(
      healthy
        ? `repair OK: ${how}${where}`
        : `repair INCOMPLETE (failure #${failures}): behind=${
            behindAfter ?? 'n/a'
          } stale=${staleAfter.join(', ') || 'none'}`
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
    if (process.stdin.isTTY) {
      return null;
    }
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw).session_id ?? null;
  } catch {
    return null;
  }
}

/** Has this session already been told about this specific repair? */
function shouldReportRepair(state, last, sessionId) {
  const reported = state.reported ?? {};
  if (reported.repairTs !== last.ts) {
    return true;
  } // a newer repair — nobody has heard yet
  if (!sessionId) {
    return false;
  } // no identity available; fall back to once-only
  return !(reported.sessions ?? []).includes(sessionId);
}

function recordRepairReported(state, last, sessionId) {
  const reported = state.reported ?? {};
  const sessions =
    reported.repairTs === last.ts ? [...(reported.sessions ?? [])] : [];
  if (sessionId && !sessions.includes(sessionId)) {
    sessions.push(sessionId);
  }
  writeState({
    reported: { repairTs: last.ts, sessions: sessions.slice(-50) }, // cap growth
  });
}

function hook() {
  const problems = [];
  const notes = [];
  const entry = installedEntry();
  if (!entry) {
    return { problems, notes };
  } // forge not installed, or manifest unreadable — stay silent

  // Is anything actually wrong RIGHT NOW? Decided before replaying any repair history, so
  // a resolved-but-still-recorded failure is never announced to a healthy session.
  const installMissing =
    !entry.installPath || !fs.existsSync(entry.installPath);
  const cloneExists = fs.existsSync(clonePath);
  const cacheStale =
    !installMissing && cloneExists && cacheBehindClone(entry.installPath);
  const behind = !installMissing && cloneExists ? behindCount() : null;
  const liveProblem = installMissing || cacheStale || !!behind;

  // Report what the last background repair did — once per session, not once globally.
  // A record written by the version that refused "version-pinned" drift is superseded:
  // its advice (reinstall by hand) was wrong, and the next worker run replaces it.
  const state = readState();
  const last = state.lastRepair;
  const sessionId = readSessionId();
  if (
    last?.ts &&
    !last.versionPinned &&
    (last.ok || liveProblem) &&
    shouldReportRepair(state, last, sessionId)
  ) {
    recordRepairReported(state, last, sessionId);
    if (last.ok) {
      notes.push(
        `a background repair ${last.detail}. ` +
          `This session is still running the previously loaded copy — restart to pick it up.`
      );
    } else {
      problems.push(
        `an automatic forge repair ran and did NOT resolve the drift (${last.detail}).`
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

  if (!cloneExists) {
    return { problems, notes };
  }

  // Whether a repair is even worth spawning is decided BEFORE describing the drift, so the
  // description can say what will actually happen. Announcing "a repair has been queued"
  // and then not queueing one is how a user ends up waiting on a fix that is never coming.
  const failures = state.consecutiveFailures ?? 0;
  const backedOff = failures >= MAX_FAILURES_BEFORE_BACKOFF;

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
      `the forge copy this session loaded (v${entry.version} at ${entry.installPath}) differs ` +
        `from the marketplace clone on disk — the clone has changes that were never extracted.${queued}`
    );
  }

  if (behind) {
    problems.push(
      `the ${MARKETPLACE} clone is ${behind} commit(s) behind origin/master.${queued}`
    );
  }

  if (backedOff && spawned) {
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
  const lines = [...problems, ...notes].map(p => `- ${p}`).join('\n');
  const stale = problems.length > 0;
  await emit({
    systemMessage: `forge plugin: ${
      stale ? 'stale' : 'updated in background'
    }\n${lines}`,
    context: stale
      ? `The forge plugin providing this session's standards and skills may be out of date. ` +
        `Findings:\n${lines}\n` +
        `An automatic repair runs in the background but CANNOT fix this session — the plugin ` +
        `is already loaded. Treat forge standards read this session as possibly superseded, ` +
        `and tell the user before relying on them for a merge, branch, or review decision.`
      : `A background repair updated the forge plugin. This session still holds the older ` +
        `copy loaded at startup:\n${lines}`,
  });
}

process.exit(0);
