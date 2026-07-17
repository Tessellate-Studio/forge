// evaluate-from-context.js
//
// Autonomous-scoring path for the Rubric SDK.
//
// The original `RubricEngine.evaluate(taskDescription, scores)` method
// requires the caller to PROVIDE the 4-axis scores. That's correct for
// scenarios where a human is filling out a rubric manually, but doesn't
// work for autonomous consumers (e.g. the `roadmap-pulse` skill) that
// need the SDK to decide scores from a task's title + description +
// surrounding context.
//
// This module adds an autonomous path that uses transparent, rule-based
// heuristics — keyword matching on the task content + structural signals
// from the provided context. No LLM call. The heuristics are
// deliberately simple and inspectable so the resulting scores are
// auditable.
//
// CONTRACT (input + output) — match this verbatim:
//
//   Input:
//   {
//     title:       string,                  required
//     description: string,                  required, can be 1-500 chars
//     context: {
//       goals:        string[],             optional — current-period urgencies
//       dependencies: {
//         this_task_depends_on: string[],   optional
//         this_task_unblocks:   string[]    optional
//       }
//     }
//   }
//
//   Output:
//   {
//     impact:       0-3 integer,
//     complexity:   0-3 integer (inverse — higher = simpler/cheaper),
//     reusability:  0-3 integer,
//     strategic:    0-3 integer,
//     total:        0-12 integer (= sum of 4 axes),
//     band:         "Must" | "Nice" | "Low" | "Reject",
//     reasoning: {
//       impact:      string,
//       complexity:  string,
//       reusability: string,
//       strategic:   string
//     }
//   }
//
// CALIBRATION:
//   The heuristics in this module are v1 and intentionally conservative.
//   When the consuming skill (roadmap-pulse) starts producing weekly
//   digests with real outcomes, those outcomes become training signal for
//   tightening the heuristics OR for swapping in an LLM-backed scorer.

const HIGH_IMPACT_KEYWORDS = [
  'launch', 'compliance', 'security', 'critical', 'blocking', 'gating',
  'production', 'must', 'p0', 'urgent', 'gate', 'legal', 'privacy',
  'auth', 'authentication', 'authorization', 'data loss',
];

const MEDIUM_IMPACT_KEYWORDS = [
  'user-facing', 'visible', 'metric', 'analytics', 'retention',
  'acquisition', 'conversion', 'support', 'friction', 'p1',
];

const HIGH_COMPLEXITY_KEYWORDS = [
  'rewrite', 'migration', 'multi-week', 'multi-month', 'rearchitect',
  'overhaul', 'partnership', 'external', 'third-party integration',
  'distributed', 'consensus', 'eventual consistency',
];

const LOW_COMPLEXITY_KEYWORDS = [
  'one-liner', 'rename', 'doc', 'comment', 'env var', 'config', 'flag',
  'feature flag', 'css', 'styling', 'copy', 'typo', 'small fix',
];

const REUSABILITY_HIGH_KEYWORDS = [
  'infrastructure', 'library', 'sdk', 'pattern', 'framework', 'shared',
  'reusable', 'generic', 'abstraction', 'middleware', 'plugin',
];

const REUSABILITY_LOW_KEYWORDS = [
  'one-shot', 'one-off', 'specific to', 'bespoke', 'this brand', 'this user',
  'specific case',
];

function normaliseText(...parts) {
  return parts
    .filter((p) => typeof p === 'string' && p.length > 0)
    .join(' ')
    .toLowerCase();
}

function countMatches(haystack, keywords) {
  let count = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) count += 1;
  }
  return count;
}

/**
 * Score the IMPACT axis (0-3).
 *
 * Signals:
 *  - keyword density in the task text
 *  - goal-alignment: task mentioned or implied by any of the provided
 *    `context.goals` strings
 *  - dependency-unblock potential: number of OTHER tasks this one unblocks
 */
function scoreImpact(text, context) {
  const goals = context.goals || [];
  const unblocks = (context.dependencies && context.dependencies.this_task_unblocks) || [];

  const highHits = countMatches(text, HIGH_IMPACT_KEYWORDS);
  const mediumHits = countMatches(text, MEDIUM_IMPACT_KEYWORDS);

  // Goal-alignment signal: how many of the goal strings overlap with the task text
  let goalAlignment = 0;
  for (const goal of goals) {
    const goalWords = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    for (const word of goalWords) {
      if (text.includes(word)) {
        goalAlignment += 1;
        break;
      }
    }
  }

  let score = 1;
  if (highHits >= 2 || goalAlignment >= 2 || unblocks.length >= 2) score = 3;
  else if (highHits >= 1 || mediumHits >= 2 || goalAlignment >= 1 || unblocks.length >= 1) score = 2;
  else if (mediumHits >= 1) score = 1;
  else score = 0;

  const reasoning =
    `${highHits} high-impact + ${mediumHits} medium-impact keyword matches; ` +
    `${goalAlignment} goal-string overlap; ` +
    `unblocks ${unblocks.length} other task${unblocks.length === 1 ? '' : 's'}.`;

  return { score, reasoning };
}

/**
 * Score COMPLEXITY (0-3) — INVERSE scoring (higher = simpler / cheaper).
 *
 * Signals:
 *  - keyword density in the task text
 *  - description length (longer descriptions tend to indicate more complex work)
 *  - dependency count (this_task_depends_on)
 */
function scoreComplexity(text, description, context) {
  const dependsOn = (context.dependencies && context.dependencies.this_task_depends_on) || [];

  const highHits = countMatches(text, HIGH_COMPLEXITY_KEYWORDS);
  const lowHits = countMatches(text, LOW_COMPLEXITY_KEYWORDS);
  const descLen = (description || '').length;

  let score = 2; // default: moderate complexity → moderate score
  if (lowHits >= 1 && highHits === 0 && descLen < 200) score = 3;
  else if (highHits >= 1 || descLen > 800 || dependsOn.length >= 2) score = 0;
  else if (descLen > 400 || dependsOn.length >= 1) score = 1;
  else score = 2;

  const reasoning =
    `${highHits} high-complexity + ${lowHits} low-complexity keyword matches; ` +
    `description length ${descLen}; ` +
    `depends on ${dependsOn.length} other task${dependsOn.length === 1 ? '' : 's'}. ` +
    `Score is inverse: higher = simpler/cheaper.`;

  return { score, reasoning };
}

/**
 * Score REUSABILITY (0-3).
 *
 * Signals: keyword density only. Reusability is hard to infer from
 * structural context — keywords like "infrastructure" or "library"
 * vs. "one-off" / "specific to" are the cheapest tell.
 */
function scoreReusability(text) {
  const highHits = countMatches(text, REUSABILITY_HIGH_KEYWORDS);
  const lowHits = countMatches(text, REUSABILITY_LOW_KEYWORDS);

  let score = 1; // default: some reuse, but not infrastructure-grade
  if (highHits >= 2) score = 3;
  else if (highHits >= 1 && lowHits === 0) score = 2;
  else if (lowHits >= 1) score = 0;
  else score = 1;

  const reasoning =
    `${highHits} reusability-high + ${lowHits} reusability-low keyword matches.`;

  return { score, reasoning };
}

/**
 * Score STRATEGIC FIT (0-3).
 *
 * Signals: pure goal-alignment overlap from context.goals. If no goals
 * are provided, default to 1 (tangential).
 */
function scoreStrategic(text, context) {
  const goals = context.goals || [];

  if (goals.length === 0) {
    return {
      score: 1,
      reasoning: 'No goals provided in context; defaulting to tangential (1).',
    };
  }

  let alignment = 0;
  for (const goal of goals) {
    const goalWords = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    let goalMatched = false;
    for (const word of goalWords) {
      if (text.includes(word)) {
        goalMatched = true;
        break;
      }
    }
    if (goalMatched) alignment += 1;
  }

  let score = 0;
  if (alignment >= 2) score = 3;
  else if (alignment === 1) score = 2;
  else score = 0;

  const reasoning =
    `Task overlaps with ${alignment} of ${goals.length} provided goal${goals.length === 1 ? '' : 's'}.`;

  return { score, reasoning };
}

/**
 * Map a 0-12 total to a band label.
 * 9-12 = Must, 6-8 = Nice, 3-5 = Low, 0-2 = Reject.
 */
function bandForTotal(total) {
  if (total >= 9) return 'Must';
  if (total >= 6) return 'Nice';
  if (total >= 3) return 'Low';
  return 'Reject';
}

/**
 * Validate input shape. Throws with a clear message if anything's wrong.
 */
function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('evaluateFromContext: input must be an object');
  }
  if (!input.title || typeof input.title !== 'string') {
    throw new Error('evaluateFromContext: input.title is required (string)');
  }
  if (typeof input.description !== 'string') {
    throw new Error('evaluateFromContext: input.description is required (string)');
  }
  if (input.context && typeof input.context !== 'object') {
    throw new Error('evaluateFromContext: input.context must be an object if provided');
  }
}

/**
 * Autonomous scoring path for the Rubric SDK.
 *
 * See module docblock for the full contract. Inputs and outputs match
 * the schema documented in:
 *   roadmap-pulse skill → references/scoring-contract.md
 */
function evaluateFromContext(input) {
  validateInput(input);

  const context = input.context || {};
  const text = normaliseText(input.title, input.description);

  const impact = scoreImpact(text, context);
  const complexity = scoreComplexity(text, input.description, context);
  const reusability = scoreReusability(text);
  const strategic = scoreStrategic(text, context);

  const total = impact.score + complexity.score + reusability.score + strategic.score;

  return {
    impact: impact.score,
    complexity: complexity.score,
    reusability: reusability.score,
    strategic: strategic.score,
    total,
    band: bandForTotal(total),
    reasoning: {
      impact: impact.reasoning,
      complexity: complexity.reasoning,
      reusability: reusability.reasoning,
      strategic: strategic.reasoning,
    },
  };
}

module.exports = {
  evaluateFromContext,
  bandForTotal,
  // Exposed for testing / inspection — callers should generally just use evaluateFromContext.
  _internals: {
    scoreImpact,
    scoreComplexity,
    scoreReusability,
    scoreStrategic,
    HIGH_IMPACT_KEYWORDS,
    MEDIUM_IMPACT_KEYWORDS,
    HIGH_COMPLEXITY_KEYWORDS,
    LOW_COMPLEXITY_KEYWORDS,
    REUSABILITY_HIGH_KEYWORDS,
    REUSABILITY_LOW_KEYWORDS,
  },
};
