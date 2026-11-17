#!/usr/bin/env node
/**
 * Tap a control by WHAT IT SAYS, not by where it was (forge, 2026-11-17).
 *
 * WHY: on the Pixel, a "Profile changed since this check · Re-check" banner appeared above the action
 * row and pushed every button down. A tap at the Re-check button's old coordinates landed on "Bought it"
 * and recorded a purchase on the owner's account. A pixel tap is a claim about a layout that may have
 * moved since the last screenshot; a label tap reads the layout NOW.
 *
 *   node tap-label.js "Re-check"                  # tap the control whose text or content-desc is exactly this
 *   node tap-label.js "Bought" --contains         # substring match (opt in: it can match the wrong control)
 *   node tap-label.js "Done" --index 1            # when two controls say the same thing, say which
 *   node tap-label.js "Bought it" --allow-destructive   # a label that changes the account needs the flag
 *   node tap-label.js "Re-check" --dry-run        # print what it would tap, tap nothing
 *   ... --device <serial>                         # adb -s <serial>; ADB=/path/to/adb overrides the binary
 *
 * It refuses, with what IS on screen, when the label is missing; it refuses two matches instead of
 * guessing. Exit 0 = tapped (or dry-run), 1 = refused, 2 = adb failed.
 */

'use strict';

const { spawnSync } = require('node:child_process');

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#10;': '\n',
};
const decode = s =>
  s.replace(/&(amp|lt|gt|quot|apos|#10);/g, m => ENTITIES[m] ?? m);

/** The controls in a `uiautomator dump`: text, content-desc, clickable and bounds. */
function parseNodes(xml) {
  const nodes = [];
  for (const m of xml.matchAll(/<node\b[^>]*?\/?>/g)) {
    const tag = m[0];
    const attr = name => {
      const a = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
      return a ? decode(a[1]) : '';
    };
    const b = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) {
      continue;
    }
    nodes.push({
      text: attr('text'),
      desc: attr('content-desc'),
      clickable: attr('clickable') === 'true',
      bounds: [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])],
    });
  }
  return nodes;
}

const centerOf = ([l, t, r, b]) => [
  Math.round((l + r) / 2),
  Math.round((t + b) / 2),
];

/** Labels whose tap changes the account or leaves the app: never tapped by accident. */
const DESTRUCTIVE =
  /^(bought it|delete|remove|sign out|log out|clear|reset|buy|pay|place order|send|submit|confirm|unlink)\b/i;
const isDestructive = label => DESTRUCTIVE.test(label.trim());

const labelOf = n => (n.text || n.desc || '').trim();

function choose(nodes, label, opts = {}) {
  const { contains = false, index, allowDestructive = false } = opts;
  const want = label.trim().toLowerCase();
  const hits = nodes.filter(n => {
    const has = [n.text, n.desc]
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    return has.some(s => (contains ? s.includes(want) : s === want));
  });
  if (hits.length === 0) {
    const seen = [...new Set(nodes.map(labelOf).filter(Boolean))].slice(0, 40);
    throw new Error(
      `"${label}" is not on screen. Labels that are: ${
        seen.join(' | ') || '(none)'
      }`
    );
  }

  // A Pressable and the Text inside it both say the same thing; only the clickable one is the control.
  if (hits.length > 1 && index === undefined) {
    const clickable = hits.filter(n => n.clickable);
    if (clickable.length === 1) {
      hits.splice(0, hits.length, clickable[0]);
    }
  }
  if (hits.length > 1 && index === undefined) {
    throw new Error(
      `${hits.length} matches for "${label}"; pass --index 0..${
        hits.length - 1
      } to say which`
    );
  }
  const hit = hits[index ?? 0];
  if (!hit) {
    throw new Error(
      `--index ${index} is out of range for ${hits.length} match(es)`
    );
  }
  if (isDestructive(labelOf(hit)) && !allowDestructive) {
    throw new Error(
      `"${labelOf(
        hit
      )}" changes the account; the step must say so and pass --allow-destructive`
    );
  }
  return hit;
}

function adb(args, device) {
  const bin = process.env.ADB || 'adb';
  const r = spawnSync(bin, device ? ['-s', device, ...args] : args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const e = new Error(
      `adb ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`
    );
    e.adb = true;
    throw e;
  }
  return r.stdout;
}

function main(argv) {
  const label = argv.find(
    (a, i) =>
      !a.startsWith('--') &&
      argv[i - 1] !== '--index' &&
      argv[i - 1] !== '--device'
  );
  if (!label) {
    console.error(
      'usage: node tap-label.js "<label>" [--contains] [--index n] [--allow-destructive] [--dry-run] [--device serial]'
    );
    return 1;
  }
  const flag = n => argv.includes(n);
  const val = n => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const device = val('--device');
  try {
    // uiautomator cannot dump while the screen is animating ("could not get idle state"): one retry.
    try {
      adb(['shell', 'uiautomator', 'dump', '/sdcard/tap-label.xml'], device);
    } catch (first) {
      adb(['shell', 'sleep', '1'], device);
      adb(['shell', 'uiautomator', 'dump', '/sdcard/tap-label.xml'], device);
    }
    const xml = adb(['exec-out', 'cat', '/sdcard/tap-label.xml'], device);
    const hit = choose(parseNodes(xml), label, {
      contains: flag('--contains'),
      index: val('--index') === undefined ? undefined : Number(val('--index')),
      allowDestructive: flag('--allow-destructive'),
    });
    const [x, y] = centerOf(hit.bounds);
    console.log(
      `${flag('--dry-run') ? 'would tap' : 'tap'} "${labelOf(
        hit
      )}" at ${x},${y}`
    );
    if (!flag('--dry-run')) {
      adb(['shell', 'input', 'tap', String(x), String(y)], device);
    }
    return 0;
  } catch (e) {
    console.error(e.message);
    return e.adb ? 2 : 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { parseNodes, choose, centerOf, isDestructive, DESTRUCTIVE };
