// Integration tests for complete rubric workflow — RICE framework
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
      const configResult = await configManager.initializeConfig(tempDir);
      expect(configResult.success).toBe(true);

      const tasks = [
        {
          description: 'Implement user authentication system',
          scores: { reach: 1000, impact: 3, confidence: 0.8, effort: 5 },
        },
        {
          description: 'Add dark mode toggle',
          scores: { reach: 100, impact: 0.5, confidence: 0.8, effort: 2 },
        },
        {
          description: 'Optimize database queries',
          scores: { reach: 100, impact: 2, confidence: 0.8, effort: 3 },
        },
      ];

      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(
          task.description,
          task.scores,
          { save: true, evaluator: 'Integration Test' }
        );
        evaluations.push(evaluation);
      }

      expect(evaluations).toHaveLength(3);

      const comparison = await engine.compareMultiple(tasks, {
        evaluator: 'Integration Test',
      });

      expect(comparison.evaluations).toHaveLength(3);
      expect(comparison.evaluations[0].rank).toBe(1);

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

      expect(jsonReport).toContain('user authentication');
      expect(markdownReport).toContain('# Rubric Evaluation Report');
      expect(csvReport).toContain('"task","priority","riceScore"');
      expect(htmlReport).toContain('<html');

      const evaluationsDir = path.join(tempDir, '.rubric', 'evaluations');
      expect(await fs.pathExists(evaluationsDir)).toBe(true);
      const evaluationFiles = await fs.readdir(evaluationsDir);
      expect(evaluationFiles.length).toBeGreaterThan(0);
    });

    test('should maintain evaluation history correctly', async () => {
      const tasks = [
        {
          description: 'Task 1',
          scores: { reach: 100, impact: 2, confidence: 0.8, effort: 2 },
        },
        {
          description: 'Task 2',
          scores: { reach: 1000, impact: 3, confidence: 1.0, effort: 5 },
        },
        {
          description: 'Task 3',
          scores: { reach: 10, impact: 1, confidence: 0.5, effort: 1 },
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
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const evaluationsDir = path.join(tempDir, '.rubric', 'evaluations');
      const files = await fs.readdir(evaluationsDir);
      expect(files.length).toBe(3);

      for (const file of files) {
        const savedEvaluation = await fs.readJson(
          path.join(evaluationsDir, file)
        );
        expect(savedEvaluation.task).toBeDefined();
        expect(savedEvaluation.scores).toBeDefined();
        expect(savedEvaluation.riceScore).toBeDefined();
        expect(savedEvaluation.metadata.evaluator).toMatch(/User\d/);
      }
    });

    test('should handle error conditions gracefully', async () => {
      await expect(
        engine.evaluate('', {
          reach: 100,
          impact: 2,
          confidence: 0.8,
          effort: 3,
        })
      ).rejects.toThrow('Task description must be a non-empty string');

      await expect(
        engine.evaluate('Valid task', {
          reach: 0,
          impact: 2,
          confidence: 0.8,
          effort: 3,
        })
      ).rejects.toThrow('Invalid score for reach');

      await expect(
        engine.evaluate('Valid task', {
          reach: 100,
          impact: 2,
          confidence: 1.5,
          effort: 3,
        })
      ).rejects.toThrow('Invalid score for confidence');

      await expect(engine.compareMultiple([])).rejects.toThrow(
        'Tasks must be provided as a non-empty array'
      );

      await expect(reportGenerator.generate([], 'invalid')).rejects.toThrow(
        'Unsupported format: invalid'
      );
    });
  });

  describe('Configuration Management Integration', () => {
    test('should validate custom configurations correctly', async () => {
      const validCustomConfig = {
        framework: 'rice',
      };

      await configManager.initializeConfig(tempDir, validCustomConfig);

      const config = await configManager.loadConfig(
        path.join(tempDir, 'rubric-config.yml')
      );
      const validation = configManager.validateConfig(config);
      expect(validation.valid).toBe(true);
    });

    test('should handle configuration updates', async () => {
      await configManager.initializeConfig(tempDir);
      const configPath = path.join(tempDir, 'rubric-config.yml');

      const updates = {
        thresholds: { high_priority: 2.5 },
      };

      const result = await configManager.updateConfig(configPath, updates);
      expect(result.success).toBe(true);

      const updatedConfig = await configManager.loadConfig(configPath);
      expect(updatedConfig.thresholds.high_priority).toBe(2.5);
    });
  });

  describe('Report Generation Integration', () => {
    test('should generate comprehensive reports with statistics', async () => {
      const tasks = [
        {
          description: 'High priority task',
          scores: { reach: 1000, impact: 3, confidence: 1.0, effort: 1 },
        },
        {
          description: 'Medium priority task',
          scores: { reach: 100, impact: 2, confidence: 0.8, effort: 5 },
        },
        {
          description: 'Low priority task',
          scores: { reach: 10, impact: 0.5, confidence: 0.5, effort: 10 },
        },
        {
          description: 'Backlog task',
          scores: { reach: 1, impact: 0.25, confidence: 0.5, effort: 20 },
        },
      ];

      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(task.description, task.scores);
        evaluations.push(evaluation);
      }

      const markdownReport = await reportGenerator.generate(
        evaluations,
        'markdown'
      );

      expect(markdownReport).toContain('# Rubric Evaluation Report');
      expect(markdownReport).toContain('## Summary');
      expect(markdownReport).toContain('## Detailed Evaluations');
      expect(markdownReport).toContain('Priority | Count');

      tasks.forEach(task => {
        expect(markdownReport).toContain(task.description);
      });

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
