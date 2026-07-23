// evaluate-from-context.js
//
// Autonomous-scoring path for the Rubric SDK — RICE framework.
//
// Implements Intercom's RICE prioritisation formula:
//   Score = (Reach × Impact × Confidence) / Effort
//
// The heuristics estimate each RICE axis from a task's title +
// description + surrounding context (goals, dependencies). No LLM
// call — keyword matching + structural signals only, so scores are
// auditable and deterministic.
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
//     reach:        number (1 | 10 | 100 | 1000),
//     impact:       number (0.25 | 0.5 | 1 | 2 | 3),
//     confidence:   number (0.5 | 0.8 | 1.0),
//     effort:       number (person-days: 0.5 | 1 | 2 | 3 | 5 | 10 | 20),
//     rice_score:   number (= reach * impact * confidence / effort),
//     reasoning: {
//       reach:      string,
//       impact:     string,
//       confidence: string,
//       effort:     string
//     }
//   }
//
// CALIBRATION:
//   v1 heuristics are intentionally conservative. Weekly digest outcomes
//   become training signal for tightening or swapping in an LLM scorer.

const HIGH_IMPACT_KEYWORDS = [
  'launch',
  'compliance',
  'security',
  'critical',
  'blocking',
  'gating',
  'production',
  'must',
  'p0',
  'urgent',
  'gate',
  'legal',
  'privacy',
  'auth',
  'authentication',
  'authorization',
  'data loss',
];

const MEDIUM_IMPACT_KEYWORDS = [
  'user-facing',
  'visible',
  'metric',
  'analytics',
  'retention',
  'acquisition',
  'conversion',
  'support',
  'friction',
  'p1',
];

const HIGH_REACH_KEYWORDS = [
  'all users',
  'every user',
  'production',
  'launch',
  'public',
  'app-wide',
  'global',
  'everyone',
  'onboarding',
];

const LOW_REACH_KEYWORDS = [
  'internal',
  'testing',
  'one-off',
  'admin',
  'dev-only',
  'debugging',
  'tooling',
  'ci',
  'pipeline',
];

const HIGH_EFFORT_KEYWORDS = [
  'rewrite',
  'migration',
  'multi-week',
  'multi-month',
  'rearchitect',
  'overhaul',
  'partnership',
  'external',
  'third-party integration',
  'distributed',
  'consensus',
  'eventual consistency',
];

const LOW_EFFORT_KEYWORDS = [
  'one-liner',
  'rename',
  'doc',
  'comment',
  'env var',
  'config',
  'flag',
  'feature flag',
  'css',
  'styling',
  'copy',
  'typo',
  'small fix',
];

function normaliseText(...parts) {
  return parts
    .filter(part => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();
}

function countMatches(haystack, keywords) {
  let count = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Estimate REACH — how many users/events this touches per time period.
 *
 * Scale: 1 (just me/testing), 10 (early testers), 100 (all current
 * users), 1000 (future users at scale).
 */
function estimateReach(text, context) {
  const unblocks =
    (context.dependencies && context.dependencies.this_task_unblocks) || [];
  const highHits = countMatches(text, HIGH_REACH_KEYWORDS);
  const lowHits = countMatches(text, LOW_REACH_KEYWORDS);

  let reach = 100;
  if (highHits >= 2 || unblocks.length >= 3) {
    reach = 1000;
  } else if (highHits >= 1) {
    reach = 100;
  } else if (lowHits >= 1) {
    reach = 1;
  } else {
    reach = 10;
  }

  const reasoning =
    `${highHits} high-reach + ${lowHits} low-reach keyword matches; ` +
    `unblocks ${unblocks.length} other task${
      unblocks.length === 1 ? '' : 's'
    }.`;

  return { value: reach, reasoning };
}

function countGoalAlignment(text, goals) {
  let count = 0;
  for (const goal of goals) {
    const goalWords = goal
      .toLowerCase()
      .split(/\s+/)
      .filter(gw => gw.length > 4);
    const matched = goalWords.some(gw => text.includes(gw));
    if (matched) {
      count += 1;
    }
  }
  return count;
}

function pickImpactValue(highHits, mediumHits, goalAlignment, unblockCount) {
  if (highHits >= 2 || goalAlignment >= 2 || unblockCount >= 2) {
    return 3;
  }
  if (
    highHits >= 1 ||
    mediumHits >= 2 ||
    goalAlignment >= 1 ||
    unblockCount >= 1
  ) {
    return 2;
  }
  if (mediumHits >= 1) {
    return 1;
  }
  return 0.5;
}

function estimateImpact(text, context) {
  const goals = context.goals || [];
  const unblocks =
    (context.dependencies && context.dependencies.this_task_unblocks) || [];
  const highHits = countMatches(text, HIGH_IMPACT_KEYWORDS);
  const mediumHits = countMatches(text, MEDIUM_IMPACT_KEYWORDS);
  const goalAlignment = countGoalAlignment(text, goals);
  const value = pickImpactValue(
    highHits,
    mediumHits,
    goalAlignment,
    unblocks.length
  );

  const reasoning =
    `${highHits} high-impact + ${mediumHits} medium-impact keyword matches; ` +
    `${goalAlignment} goal-string overlap; ` +
    `unblocks ${unblocks.length} other task${
      unblocks.length === 1 ? '' : 's'
    }.`;

  return { value, reasoning };
}

/**
 * Estimate CONFIDENCE — how validated is the impact estimate?
 *
 * Scale: 0.5 (guess), 0.8 (qualitative signal), 1.0 (measured/tested).
 *
 * Heuristic: tasks with goal context and specific descriptions score higher.
 */
function estimateConfidence(text, description, context) {
  const goals = context.goals || [];
  const descLen = (description || '').length;
  const hasGoals = goals.length > 0;
  const hasSpecificDesc = descLen > 100;

  let value = 0.8;
  if (hasGoals && hasSpecificDesc) {
    value = 1.0;
  } else if (hasGoals || hasSpecificDesc) {
    value = 0.8;
  } else {
    value = 0.5;
  }

  const reasoning =
    `${hasGoals ? 'Goals provided' : 'No goals provided'}; ` +
    `description length ${descLen} (${
      hasSpecificDesc ? 'specific' : 'vague'
    }).`;

  return { value, reasoning };
}

function pickEffortValue(highHits, lowHits, descLen, depCount) {
  if (lowHits >= 1 && highHits === 0 && descLen < 200) {
    return 0.5;
  }
  if (highHits >= 2 || descLen > 800 || depCount >= 3) {
    return 20;
  }
  if (highHits >= 1 || descLen > 600 || depCount >= 2) {
    return 10;
  }
  if (descLen > 400 || depCount >= 1) {
    return 5;
  }
  if (lowHits >= 1) {
    return 1;
  }
  return 2;
}

function estimateEffort(text, description, context) {
  const dependsOn =
    (context.dependencies && context.dependencies.this_task_depends_on) || [];
  const highHits = countMatches(text, HIGH_EFFORT_KEYWORDS);
  const lowHits = countMatches(text, LOW_EFFORT_KEYWORDS);
  const descLen = (description || '').length;
  const value = pickEffortValue(highHits, lowHits, descLen, dependsOn.length);

  const reasoning =
    `${highHits} high-effort + ${lowHits} low-effort keyword matches; ` +
    `description length ${descLen}; ` +
    `depends on ${dependsOn.length} other task${
      dependsOn.length === 1 ? '' : 's'
    }.`;

  return { value, reasoning };
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
    throw new Error(
      'evaluateFromContext: input.description is required (string)'
    );
  }
  if (input.context && typeof input.context !== 'object') {
    throw new Error(
      'evaluateFromContext: input.context must be an object if provided'
    );
  }
}

/**
 * Autonomous RICE scoring path for the Rubric SDK.
 *
 * See module docblock for the full contract. Inputs and outputs match
 * the schema documented in:
 *   roadmap-pulse skill → references/scoring-contract.md
 */
function evaluateFromContext(input) {
  validateInput(input);

  const context = input.context || {};
  const text = normaliseText(input.title, input.description);

  const reach = estimateReach(text, context);
  const impact = estimateImpact(text, context);
  const confidence = estimateConfidence(text, input.description, context);
  const effort = estimateEffort(text, input.description, context);

  const rice_score =
    (reach.value * impact.value * confidence.value) / effort.value;

  return {
    reach: reach.value,
    impact: impact.value,
    confidence: confidence.value,
    effort: effort.value,
    rice_score: Math.round(rice_score * 100) / 100,
    reasoning: {
      reach: reach.reasoning,
      impact: impact.reasoning,
      confidence: confidence.reasoning,
      effort: effort.reasoning,
    },
  };
}

module.exports = {
  evaluateFromContext,
  _internals: {
    estimateReach,
    estimateImpact,
    estimateConfidence,
    estimateEffort,
    HIGH_IMPACT_KEYWORDS,
    MEDIUM_IMPACT_KEYWORDS,
    HIGH_REACH_KEYWORDS,
    LOW_REACH_KEYWORDS,
    HIGH_EFFORT_KEYWORDS,
    LOW_EFFORT_KEYWORDS,
  },
};
