// Main entry point for Rubric SDK
const RubricEngine = require('./rubric-engine');
const ReportGenerator = require('./report-generator');
const ConfigManager = require('./config-manager');
const { evaluateFromContext, bandForTotal } = require('./evaluate-from-context');

module.exports = {
  RubricEngine,
  ReportGenerator,
  ConfigManager,

  // Autonomous-scoring path (added 2026-05-23). Takes a structured input
  // with task + context (goals + dependencies) and returns the full 4-axis
  // 0-3 score + total + band + reasoning, deciding the scores via
  // transparent rule-based heuristics. Use when no human is available to
  // fill out the rubric and the consumer has structured context.
  //
  // See lib/evaluate-from-context.js for the contract documentation.
  evaluateFromContext,
  bandForTotal,

  // Convenience methods for common operations
  evaluate: async (task, options = {}) => {
    const engine = new RubricEngine(options);
    return await engine.evaluate(task, options);
  },

  compare: async (tasks, options = {}) => {
    const engine = new RubricEngine(options);
    return await engine.compareMultiple(tasks, options);
  },

  generateReport: async (evaluations, format = 'json') => {
    const generator = new ReportGenerator();
    return await generator.generate(evaluations, format);
  }
};