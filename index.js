// Root entry: the rubric scoring API is the only programmatic consumer
// (roadmap-pulse's invoke_rubric.sh needs RubricEngine/evaluateFromContext).
// The standards SDK stays reachable via require('@tessellate-studio/forge/standards').
module.exports = require('./rubric/lib/index.js');
