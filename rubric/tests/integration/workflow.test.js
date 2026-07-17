// Integration tests for complete rubric workflow
const { RubricEngine, ReportGenerator, ConfigManager } = require('../../lib');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Rubric SDK Integration', () => {
  let tempDir;
  let originalCwd;
  let engine;
  let reportGenerator;
  let configManager;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `rubric-integration-${Date.now()}`);
    fs.ensureDirSync(tempDir);

    // Change working directory to temp dir for tests
    originalCwd = process.cwd();
    process.chdir(tempDir);

    engine = new RubricEngine();
    reportGenerator = new ReportGenerator();
    configManager = new ConfigManager();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  describe('Complete Evaluation Workflow', () => {
    test('should complete full evaluation and reporting workflow', async () => {
      // Step 1: Initialize configuration
      const configResult = await configManager.initializeConfig(tempDir);
      expect(configResult.success).toBe(true);

      // Step 2: Evaluate multiple tasks (scores on the 0-3 scale)
      const tasks = [
        {
          description: 'Implement user authentication system',
          scores: { impact: 3, complexity: 2, reusability: 3, strategic: 3 },
        },
        {
          description: 'Add dark mode toggle',
          scores: { impact: 1, complexity: 1, reusability: 2, strategic: 1 },
        },
        {
          description: 'Optimize database queries',
          scores: { impact: 2, complexity: 2, reusability: 2, strategic: 2 },
        },
      ];

      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(
          task.description,
          task.scores,
          {
            save: true,
            evaluator: 'Integration Test',
          }
        );
        evaluations.push(evaluation);
      }

      expect(evaluations).toHaveLength(3);

      // Step 3: Compare tasks
      const comparison = await engine.compareMultiple(tasks, {
        evaluator: 'Integration Test',
      });

      expect(comparison.evaluations).toHaveLength(3);
      expect(comparison.evaluations[0].rank).toBe(1);

      // Step 4: Generate reports in different formats
      const jsonReport = await reportGenerator.generate(
        comparison.evaluations,
        'json'
      );
      const markdownReport = await reportGenerator.generate(
        comparison.evaluations,
        'markdown'
      );
      const csvReport = await reportGenerator.generate(
        comparison.evaluations,
        'csv'
      );
      const htmlReport = await reportGenerator.generate(
        comparison.evaluations,
        'html'
      );

      expect(typeof jsonReport).toBe('string');
      expect(typeof markdownReport).toBe('string');
      expect(typeof csvReport).toBe('string');
      expect(typeof htmlReport).toBe('string');

      // Verify content exists in reports
      expect(jsonReport).toContain('user authentication');
      expect(markdownReport).toContain('# Rubric Evaluation Report');
      expect(csvReport).toContain('"task","priority","weightedScore"');
      expect(htmlReport).toContain('<html');

      // Step 5: Verify saved evaluations exist
      const evaluationsDir = path.join(tempDir, '.rubric', 'evaluations');
      expect(await fs.pathExists(evaluationsDir)).toBe(true);

      const evaluationFiles = await fs.readdir(evaluationsDir);
      expect(evaluationFiles.length).toBeGreaterThan(0);
    });

    test('should apply custom weights from a config file', async () => {
      // Initialize with impact-heavy custom weights
      await configManager.initializeConfig(tempDir, {
        weights: {
          impact: 0.5,
          complexity: 0.3,
          reusability: 0.1,
          strategic: 0.1,
        },
      });

      const impactEngine = new RubricEngine({
        configPath: path.join(tempDir, 'rubric-config.yml'),
      });

      // Custom config should prioritize impact more heavily
      expect(impactEngine.weights.impact).toBe(0.5);

      const task = {
        description: 'High impact, high complexity task',
        scores: { impact: 3, complexity: 3, reusability: 1, strategic: 1 },
      };

      const impactEvaluation = await impactEngine.evaluate(
        task.description,
        task.scores
      );

      // Now test with reuse-heavy weights
      await configManager.initializeConfig(tempDir, {
        weights: {
          impact: 0.25,
          complexity: 0.2,
          reusability: 0.3,
          strategic: 0.25,
        },
        force: true,
      });

      const reuseEngine = new RubricEngine({
        configPath: path.join(tempDir, 'rubric-config.yml'),
      });
      const reuseEvaluation = await reuseEngine.evaluate(
        task.description,
        task.scores
      );

      // Impact-heavy weighting should rate this task higher
      expect(impactEvaluation.weightedScore).toBeGreaterThan(
        reuseEvaluation.weightedScore
      );
    });

    test('should maintain evaluation history correctly', async () => {
      // Perform multiple evaluations over time
      const tasks = [
        {
          description: 'Task 1',
          scores: { impact: 2, complexity: 1, reusability: 2, strategic: 3 },
        },
        {
          description: 'Task 2',
          scores: { impact: 3, complexity: 2, reusability: 1, strategic: 2 },
        },
        {
          description: 'Task 3',
          scores: { impact: 1, complexity: 0, reusability: 3, strategic: 1 },
        },
      ];

      const evaluations = [];
      for (const [index, task] of tasks.entries()) {
        const evaluation = await engine.evaluate(
          task.description,
          task.scores,
          {
            save: true,
            evaluator: `User${index + 1}`,
            notes: `Test evaluation ${index + 1}`,
          }
        );
        evaluations.push(evaluation);

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify all evaluations were saved
      const evaluationsDir = path.join(tempDir, '.rubric', 'evaluations');
      const files = await fs.readdir(evaluationsDir);
      expect(files.length).toBe(3);

      // Verify evaluation data integrity
      for (const file of files) {
        const savedEvaluation = await fs.readJson(
          path.join(evaluationsDir, file)
        );
        expect(savedEvaluation.task).toBeDefined();
        expect(savedEvaluation.scores).toBeDefined();
        expect(savedEvaluation.weightedScore).toBeDefined();
        expect(savedEvaluation.metadata.evaluator).toMatch(/User\d/);
      }
    });

    test('should handle error conditions gracefully', async () => {
      // Test invalid task evaluation
      await expect(
        engine.evaluate('', {
          impact: 2,
          complexity: 1,
          reusability: 2,
          strategic: 3,
        })
      ).rejects.toThrow('Task description must be a non-empty string');

      // Test invalid scores (above the 0-3 scale)
      await expect(
        engine.evaluate('Valid task', {
          impact: 4,
          complexity: 1,
          reusability: 2,
          strategic: 3,
        })
      ).rejects.toThrow('Invalid score for impact');

      // Test missing scores
      await expect(
        engine.evaluate('Valid task', { impact: 2, complexity: 1 })
      ).rejects.toThrow('Missing required scoring dimensions');

      // Test empty comparison
      await expect(engine.compareMultiple([])).rejects.toThrow(
        'Tasks must be provided as a non-empty array'
      );

      // Test invalid report format
      await expect(reportGenerator.generate([], 'invalid')).rejects.toThrow(
        'Unsupported format: invalid'
      );
    });
  });

  describe('Configuration Management Integration', () => {
    test('should validate custom configurations correctly', async () => {
      // Test valid custom configuration
      const validCustomWeights = {
        impact: 0.4,
        complexity: 0.3,
        reusability: 0.2,
        strategic: 0.1,
      };

      await configManager.initializeConfig(tempDir, {
        weights: validCustomWeights,
      });

      const config = await configManager.loadConfig(
        path.join(tempDir, 'rubric-config.yml')
      );
      const validation = configManager.validateConfig(config);

      expect(validation.valid).toBe(true);
      expect(config.weights.impact).toBe(0.4);

      // Test that engine uses custom weights
      const customEngine = new RubricEngine({
        configPath: path.join(tempDir, 'rubric-config.yml'),
      });
      expect(customEngine.weights.impact).toBe(0.4);
    });

    test('should handle configuration updates', async () => {
      // Initialize default config
      await configManager.initializeConfig(tempDir);
      const configPath = path.join(tempDir, 'rubric-config.yml');

      // Update specific values (weights must still sum to 1.0 after merge,
      // thresholds must stay on the 0-3 scale in descending order)
      const updates = {
        weights: { impact: 0.45, complexity: 0.15 },
        thresholds: { high_priority: 2.5 },
      };

      const result = await configManager.updateConfig(configPath, updates);
      expect(result.success).toBe(true);

      // Verify the update
      const updatedConfig = await configManager.loadConfig(configPath);
      expect(updatedConfig.weights.impact).toBe(0.45);
      expect(updatedConfig.thresholds.high_priority).toBe(2.5);

      // Verify other values remain at defaults
      expect(updatedConfig.weights.reusability).toBe(0.2);
      expect(updatedConfig.thresholds.medium_priority).toBe(2);
    });
  });

  describe('Report Generation Integration', () => {
    test('should generate comprehensive reports with statistics', async () => {
      // Create a diverse set of evaluations covering every priority band
      const tasks = [
        // 3*0.35 + (3-0)*0.25 + 3*0.20 + 3*0.20 = 3.0 -> high
        {
          description: 'High priority task',
          scores: { impact: 3, complexity: 0, reusability: 3, strategic: 3 },
        },

        // 2*0.35 + (3-1)*0.25 + 2*0.20 + 2*0.20 = 2.0 -> medium
        {
          description: 'Medium priority task',
          scores: { impact: 2, complexity: 1, reusability: 2, strategic: 2 },
        },

        // 1*0.35 + (3-2)*0.25 + 1*0.20 + 1*0.20 = 1.0 -> low
        {
          description: 'Low priority task',
          scores: { impact: 1, complexity: 2, reusability: 1, strategic: 1 },
        },

        // 0*0.35 + (3-3)*0.25 + 0*0.20 + 0*0.20 = 0.0 -> backlog
        {
          description: 'Backlog task',
          scores: { impact: 0, complexity: 3, reusability: 0, strategic: 0 },
        },
      ];

      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(task.description, task.scores);
        evaluations.push(evaluation);
      }

      // Generate markdown report
      const markdownReport = await reportGenerator.generate(
        evaluations,
        'markdown'
      );

      // Verify report contains expected sections
      expect(markdownReport).toContain('# Rubric Evaluation Report');
      expect(markdownReport).toContain('## Summary');
      expect(markdownReport).toContain('## Detailed Evaluations');
      expect(markdownReport).toContain('Priority | Count');

      // Verify all tasks are included
      tasks.forEach(task => {
        expect(markdownReport).toContain(task.description);
      });

      // Generate HTML report with file output
      const htmlOutputPath = path.join(tempDir, 'report.html');
      const htmlResult = await reportGenerator.generate(evaluations, 'html', {
        outputPath: htmlOutputPath,
      });

      expect(htmlResult.success).toBe(true);
      expect(await fs.pathExists(htmlOutputPath)).toBe(true);

      const htmlContent = await fs.readFile(htmlOutputPath, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html');
      expect(htmlContent).toContain('Rubric Evaluation Report');
    });
  });
});
