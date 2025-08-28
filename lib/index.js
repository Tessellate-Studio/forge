// Main entry point for Rubric SDK
const RubricEngine = require('./rubric-engine');
const ReportGenerator = require('./report-generator');
const ConfigManager = require('./config-manager');

module.exports = {
  RubricEngine,
  ReportGenerator,
  ConfigManager,
  
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