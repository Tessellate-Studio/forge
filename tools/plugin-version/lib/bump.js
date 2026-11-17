// Every forge PR must move `.claude-plugin/plugin.json` `version` strictly
// ABOVE the base branch's version — the base branch as it is NOW, not as it
// was when the PR's CI last ran.
//
// WHY. `claude plugin update` compares version strings only. A change that
// lands without a new version string is unreachable by any CLI command
// (README → "Freshness check"). The rule "bump the version in the same PR"
// was prose, and prose is not enough when two PRs are open at once:
// forge#183 and forge#184 both bumped 0.21.9 → 0.21.10. #183 merged first;
// #184's squash then carried NO version change, and its rules would never have
// been delivered. forge#186 bumped by hand (contained fix). This module is
// the rule the code enforces, compared against the CURRENT base tip, so the
// second PR goes red the moment the first one merges.
//
// Pure: callers supply readManifest(ref) — git in a checkout, the contents API
// from GitHub Actions, `gh api` from checks-gate — so one rule decides all
// three places and every case is tested without a network.

'use strict';

const MANIFEST_PATH = '.claude-plugin/plugin.json';

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-.]+)?$/;

/** A semver string to its parts, or null when it is not semver. */
function parseVersion(version) {
  const match = SEMVER.exec(String(version ?? '').trim());
  if (!match) {
    return null;
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

const compareIdentifier = (a, b) => {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) {
    return Math.sign(Number(a) - Number(b));
  }
  if (aNum !== bNum) {
    return aNum ? -1 : 1; // numeric identifiers sort below alphanumeric ones
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Semver precedence: -1, 0 or 1. Build metadata is ignored, a release sorts
 * above its own prereleases. Throws on a non-semver input — callers check
 * with parseVersion first.
 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    throw new Error(`not semver: ${!left ? a : b}`);
  }
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) {
      return Math.sign(left.core[i] - right.core[i]);
    }
  }
  if (!left.pre.length || !right.pre.length) {
    return Math.sign(right.pre.length - left.pre.length);
  }
  const length = Math.max(left.pre.length, right.pre.length);
  for (let i = 0; i < length; i += 1) {
    if (left.pre[i] === undefined) {
      return -1;
    }
    if (right.pre[i] === undefined) {
      return 1;
    }
    const order = compareIdentifier(left.pre[i], right.pre[i]);
    if (order) {
      return order;
    }
  }
  return 0;
}

/** `version` from a manifest's text, or null when it has none / is not JSON. */
function versionOf(text) {
  try {
    const version = JSON.parse(text).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

const STATE = {
  /** Head version is strictly above the base version. */
  OK: 'ok',

  /** Head version is equal to or below the base version, or unreadable. */
  FAIL: 'fail',

  /** The base branch carries no plugin manifest: the rule does not apply. */
  SKIP: 'skip',
};

/**
 * Judge two manifests' text. `null` text means the file is absent at that ref.
 *
 * @param {{head: string|null, base: string|null, baseRef?: string}} manifests
 * @returns {{state: string, detail: string, head?: string, base?: string}}
 */
function judge({ head, base, baseRef = 'the base branch' }) {
  if (base === null || base === undefined) {
    return {
      state: STATE.SKIP,
      detail: `no ${MANIFEST_PATH} on ${baseRef} — nothing to bump`,
    };
  }
  const baseVersion = versionOf(base);
  if (!parseVersion(baseVersion)) {
    return {
      state: STATE.FAIL,
      detail: `${baseRef}'s ${MANIFEST_PATH} has no semver "version" (${baseVersion}) — fix the base first`,
    };
  }
  if (head === null || head === undefined) {
    return {
      state: STATE.FAIL,
      base: baseVersion,
      detail: `the PR deletes ${MANIFEST_PATH}`,
    };
  }
  const headVersion = versionOf(head);
  if (!parseVersion(headVersion)) {
    return {
      state: STATE.FAIL,
      base: baseVersion,
      detail: `the PR's ${MANIFEST_PATH} has no semver "version" (${headVersion})`,
    };
  }
  const order = compareVersions(headVersion, baseVersion);
  if (order > 0) {
    return {
      state: STATE.OK,
      head: headVersion,
      base: baseVersion,
      detail: `plugin version ${headVersion} > ${baseRef}'s ${baseVersion}`,
    };
  }
  return {
    state: STATE.FAIL,
    head: headVersion,
    base: baseVersion,
    detail:
      order === 0
        ? `plugin version ${headVersion} equals ${baseRef}'s — bump ${MANIFEST_PATH} above ${baseVersion} (if this PR did bump, another PR took that version first)`
        : `plugin version ${headVersion} is below ${baseRef}'s ${baseVersion} — bump ${MANIFEST_PATH} above ${baseVersion}`,
  };
}

/**
 * Read both manifests and judge them.
 *
 * @param {{readManifest: (ref: string) => Promise<string|null>,
 *          headRef: string, baseRef: string, baseLabel?: string}} options
 *   readManifest resolves to the file's text, or null when the file does not
 *   exist at that ref. Any other failure must throw — it is never "absent".
 */
async function checkBump({ readManifest, headRef, baseRef, baseLabel }) {
  const [head, base] = await Promise.all([
    readManifest(headRef),
    readManifest(baseRef),
  ]);
  return judge({ head, base, baseRef: baseLabel || baseRef });
}

module.exports = {
  MANIFEST_PATH,
  STATE,
  checkBump,
  compareVersions,
  judge,
  parseVersion,
  versionOf,
};
