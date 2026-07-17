// Integration tests for complete rubric workflow
const { RubricEngine, ReportGenerator, ConfigManager } = require('../../lib');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Rubric SDK Integration', () => {
  let tempDir;
  let engine;
  let reportGenerator;
  let configManager;
  
  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), 'rubric-integration-' + Date.now());
    fs.ensureDirSync(tempDir);
    
    // Change working directory to temp dir for tests
    process.chdir(tempDir);
    
    engine = new RubricEngine();
    reportGenerator = new ReportGenerator();
    configManager = new ConfigManager();
  });
  
  afterEach(async () => {
    await fs.remove(tempDir);
  });
  
  describe('Complete Evaluation Workflow', () => {
    test('should complete full evaluation and reporting workflow', async () => {
      // Step 1: Initialize configuration
      const configResult = await configManager.initializeConfig(tempDir);
      expect(configResult.success).toBe(true);
      
      // Step 2: Evaluate multiple tasks
      const tasks = [
        {
          description: 'Implement user authentication system',
          scores: { impact: 5, complexity: 4, reusability: 4, strategic: 5 }
        },
        {
          description: 'Add dark mode toggle',
          scores: { impact: 2, complexity: 2, reusability: 3, strategic: 2 }
        },
        {
          description: 'Optimize database queries',
          scores: { impact: 4, complexity: 3, reusability: 3, strategic: 3 }
        }
      ];
      
      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(task.description, task.scores, {
          save: true,
          evaluator: 'Integration Test'
        });
        evaluations.push(evaluation);
      }
      
      expect(evaluations).toHaveLength(3);
      
      // Step 3: Compare tasks
      const comparison = await engine.compareMultiple(tasks, {
        evaluator: 'Integration Test'
      });
      
      expect(comparison.evaluations).toHaveLength(3);
      expect(comparison.evaluations[0].rank).toBe(1);
      
      // Step 4: Generate reports in different formats
      const jsonReport = await reportGenerator.generate(comparison.evaluations, 'json');
      const markdownReport = await reportGenerator.generate(comparison.evaluations, 'markdown');
      const csvReport = await reportGenerator.generate(comparison.evaluations, 'csv');
      const htmlReport = await reportGenerator.generate(comparison.evaluations, 'html');
      
      expect(typeof jsonReport).toBe('string');
      expect(typeof markdownReport).toBe('string');
      expect(typeof csvReport).toBe('string');
      expect(typeof htmlReport).toBe('string');
      
      // Verify content exists in reports
      expect(jsonReport).toContain('user authentication');
      expect(markdownReport).toContain('# Task Comparison Results');
      expect(csvReport).toContain('task,priority,weightedScore');
      expect(htmlReport).toContain('<html');
      
      // Step 5: Verify saved evaluations exist
      const evaluationsDir = path.join(tempDir, '.rubric', 'evaluations');
      expect(await fs.pathExists(evaluationsDir)).toBe(true);
      
      const evaluationFiles = await fs.readdir(evaluationsDir);
      expect(evaluationFiles.length).toBeGreaterThan(0);
    });
    
    test('should handle configuration profiles correctly', async () => {
      // Initialize with startup profile
      await configManager.initializeConfig(tempDir, { profile: 'startup' });
      
      const startupEngine = new RubricEngine({ configPath: path.join(tempDir, 'rubric-config.yml') });
      
      // Startup profile should prioritize impact more heavily
      expect(startupEngine.weights.impact).toBe(0.5);
      
      const task = {
        description: 'High impact, high complexity task',
        scores: { impact: 5, complexity: 5, reusability: 2, strategic: 2 }
      };
      
      const startupEvaluation = await startupEngine.evaluate(task.description, task.scores);
      
      // Now test with enterprise profile
      await configManager.initializeConfig(tempDir, { profile: 'enterprise', force: true });
      
      const enterpriseEngine = new RubricEngine({ configPath: path.join(tempDir, 'rubric-config.yml') });
      const enterpriseEvaluation = await enterpriseEngine.evaluate(task.description, task.scores);
      
      // Startup should rate this task higher due to impact weighting
      expect(startupEvaluation.weightedScore).toBeGreaterThan(enterpriseEvaluation.weightedScore);
    });
    
    test('should maintain evaluation history correctly', async () => {
      // Perform multiple evaluations over time
      const tasks = [
        { description: 'Task 1', scores: { impact: 3, complexity: 2, reusability: 3, strategic: 4 } },
        { description: 'Task 2', scores: { impact: 4, complexity: 3, reusability: 2, strategic: 3 } },
        { description: 'Task 3', scores: { impact: 2, complexity: 1, reusability: 5, strategic: 2 } }
      ];
      
      const evaluations = [];
      for (const [index, task] of tasks.entries()) {
        const evaluation = await engine.evaluate(task.description, task.scores, {
          save: true,
          evaluator: `User${index + 1}`,
          notes: `Test evaluation ${index + 1}`
        });
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
        const savedEvaluation = await fs.readJson(path.join(evaluationsDir, file));
        expect(savedEvaluation.task).toBeDefined();
        expect(savedEvaluation.scores).toBeDefined();
        expect(savedEvaluation.weightedScore).toBeDefined();
        expect(savedEvaluation.metadata.evaluator).toMatch(/User\d/);
      }
    });
    
    test('should handle error conditions gracefully', async () => {
      // Test invalid task evaluation
      await expect(engine.evaluate('', { impact: 3, complexity: 2, reusability: 3, strategic: 4 }))
        .rejects.toThrow('Task description must be a non-empty string');
      
      // Test invalid scores
      await expect(engine.evaluate('Valid task', { impact: 6, complexity: 2, reusability: 3, strategic: 4 }))
        .rejects.toThrow('Invalid score for impact');
      
      // Test missing scores
      await expect(engine.evaluate('Valid task', { impact: 3, complexity: 2 }))
        .rejects.toThrow('Missing required scoring dimensions');
      
      // Test empty comparison
      await expect(engine.compareMultiple([]))
        .rejects.toThrow('Tasks must be provided as a non-empty array');
      
      // Test invalid report format
      await expect(reportGenerator.generate([], 'invalid'))
        .rejects.toThrow('Unsupported format: invalid');
    });
  });
  
  describe('Configuration Management Integration', () => {
    test('should validate custom configurations correctly', async () => {
      // Test valid custom configuration
      const validCustomWeights = {
        impact: 0.4,
        complexity: 0.3,
        reusability: 0.2,
        strategic: 0.1
      };
      
      await configManager.initializeConfig(tempDir, { weights: validCustomWeights });
      
      const config = await configManager.loadConfig(path.join(tempDir, 'rubric-config.yml'));
      const validation = configManager.validateConfig(config);
      
      expect(validation.valid).toBe(true);
      expect(config.weights.impact).toBe(0.4);
      
      // Test that engine uses custom weights
      const customEngine = new RubricEngine({ 
        configPath: path.join(tempDir, 'rubric-config.yml') 
      });
      expect(customEngine.weights.impact).toBe(0.4);
    });
    
    test('should handle configuration updates', async () => {
      // Initialize default config
      await configManager.initializeConfig(tempDir);
      const configPath = path.join(tempDir, 'rubric-config.yml');
      
      // Update a specific value
      const updates = {
        weights: { impact: 0.45 },
        thresholds: { high_priority: 4.0 }
      };
      
      const result = await configManager.updateConfig(configPath, updates);
      expect(result.success).toBe(true);
      
      // Verify the update
      const updatedConfig = await configManager.loadConfig(configPath);
      expect(updatedConfig.weights.impact).toBe(0.45);
      expect(updatedConfig.thresholds.high_priority).toBe(4.0);
      
      // Verify other values remain unchanged
      expect(updatedConfig.weights.complexity).toBe(0.25);
    });
  });
  
  describe('Report Generation Integration', () => {
    test('should generate comprehensive reports with statistics', async () => {
      // Create a diverse set of evaluations
      const tasks = [
        { description: 'High priority task', scores: { impact: 5, complexity: 2, reusability: 4, strategic: 5 } },
        { description: 'Medium priority task', scores: { impact: 3, complexity: 3, reusability: 3, strategic: 3 } },
        { description: 'Low priority task', scores: { impact: 2, complexity: 4, reusability: 2, strategic: 2 } },
        { description: 'Backlog task', scores: { impact: 1, complexity: 5, reusability: 1, strategic: 1 } }
      ];
      
      const evaluations = [];
      for (const task of tasks) {
        const evaluation = await engine.evaluate(task.description, task.scores);
        evaluations.push(evaluation);
      }
      
      // Generate markdown report
      const markdownReport = await reportGenerator.generate(evaluations, 'markdown');
      
      // Verify report contains expected sections
      expect(markdownReport).toContain('# Task Comparison Results');
      expect(markdownReport).toContain('## Summary');
      expect(markdownReport).toContain('## Ranked Tasks');
      expect(markdownReport).toContain('Priority | Count');
      
      // Verify all tasks are included
      tasks.forEach(task => {
        expect(markdownReport).toContain(task.description);
      });
      
      // Generate HTML report with file output
      const htmlOutputPath = path.join(tempDir, 'report.html');
      const htmlResult = await reportGenerator.generate(evaluations, 'html', { 
        outputPath: htmlOutputPath 
      });
      
      expect(htmlResult.success).toBe(true);
      expect(await fs.pathExists(htmlOutputPath)).toBe(true);
      
      const htmlContent = await fs.readFile(htmlOutputPath, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html');
      expect(htmlContent).toContain('Task Comparison Results');
    });
  });
});