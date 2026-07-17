// Unit tests for RubricEngine
const RubricEngine = require('../../lib/rubric-engine');
const fs = require('fs-extra');
const path = require('path');

describe('RubricEngine', () => {
  let engine;
  
  beforeEach(() => {
    engine = new RubricEngine();
  });
  
  describe('constructor', () => {
    test('should initialize with default weights', () => {
      expect(engine.weights.impact).toBe(0.35);
      expect(engine.weights.complexity).toBe(0.25);
      expect(engine.weights.reusability).toBe(0.20);
      expect(engine.weights.strategic).toBe(0.20);
    });
    
    test('should accept custom weights', () => {
      const customEngine = new RubricEngine({
        weights: { impact: 0.5, complexity: 0.3, reusability: 0.1, strategic: 0.1 }
      });
      
      expect(customEngine.weights.impact).toBe(0.5);
      expect(customEngine.weights.complexity).toBe(0.3);
    });
    
    test('should initialize with default thresholds', () => {
      expect(engine.thresholds.high_priority).toBe(3.5);
      expect(engine.thresholds.medium_priority).toBe(2.5);
      expect(engine.thresholds.low_priority).toBe(1.5);
    });
  });
  
  describe('validateScores', () => {
    test('should validate correct scores', () => {
      const scores = { impact: 4, complexity: 3, reusability: 5, strategic: 2 };
      expect(() => engine.validateScores(scores)).not.toThrow();
    });
    
    test('should throw error for missing dimensions', () => {
      const scores = { impact: 4, complexity: 3 }; // missing reusability and strategic
      expect(() => engine.validateScores(scores)).toThrow('Missing required scoring dimensions');
    });
    
    test('should throw error for invalid score range', () => {
      const scores = { impact: 6, complexity: 3, reusability: 2, strategic: 4 };
      expect(() => engine.validateScores(scores)).toThrow('Invalid score for impact');
    });
    
    test('should throw error for negative scores', () => {
      const scores = { impact: -1, complexity: 3, reusability: 2, strategic: 4 };
      expect(() => engine.validateScores(scores)).toThrow('Invalid score for impact');
    });
  });
  
  describe('calculateWeightedScore', () => {
    test('should calculate weighted score correctly', () => {
      const scores = { impact: 5, complexity: 2, reusability: 4, strategic: 3 };
      const weightedScore = engine.calculateWeightedScore(scores);
      
      // Expected calculation:
      // impact: 5 * 0.35 = 1.75
      // complexity: (5-2) * 0.25 = 0.75 (inverted)
      // reusability: 4 * 0.20 = 0.80
      // strategic: 3 * 0.20 = 0.60
      // Total: 3.90
      expect(weightedScore).toBeCloseTo(3.9, 1);
    });
    
    test('should invert complexity score', () => {
      const scores = { impact: 0, complexity: 5, reusability: 0, strategic: 0 };
      const weightedScore = engine.calculateWeightedScore(scores);
      
      // Complexity 5 should become 0 (5-5), so total should be 0
      expect(weightedScore).toBe(0);
    });
    
    test('should handle zero weights', () => {
      const customEngine = new RubricEngine({
        weights: { impact: 1.0, complexity: 0, reusability: 0, strategic: 0 }
      });
      
      const scores = { impact: 4, complexity: 5, reusability: 3, strategic: 2 };
      const weightedScore = customEngine.calculateWeightedScore(scores);
      
      expect(weightedScore).toBe(4);
    });
  });
  
  describe('getPriorityLevel', () => {
    test('should return correct priority levels', () => {
      expect(engine.getPriorityLevel(4.0)).toBe('high');
      expect(engine.getPriorityLevel(3.0)).toBe('medium');
      expect(engine.getPriorityLevel(2.0)).toBe('low');
      expect(engine.getPriorityLevel(1.0)).toBe('backlog');
    });
    
    test('should handle boundary conditions', () => {
      expect(engine.getPriorityLevel(3.5)).toBe('high');
      expect(engine.getPriorityLevel(3.4)).toBe('medium');
      expect(engine.getPriorityLevel(2.5)).toBe('medium');
      expect(engine.getPriorityLevel(2.4)).toBe('low');
    });
  });
  
  describe('generateRecommendation', () => {
    test('should identify quick wins', () => {
      const scores = { impact: 5, complexity: 1, reusability: 3, strategic: 3 };
      const weightedScore = engine.calculateWeightedScore(scores);
      const recommendation = engine.generateRecommendation(scores, weightedScore);
      
      expect(recommendation.recommendations).toContain('Quick win - high impact, low complexity');
    });
    
    test('should recommend reusable components', () => {
      const scores = { impact: 3, complexity: 3, reusability: 5, strategic: 3 };
      const weightedScore = engine.calculateWeightedScore(scores);
      const recommendation = engine.generateRecommendation(scores, weightedScore);
      
      expect(recommendation.recommendations).toContain('Consider creating reusable component/library');
    });
    
    test('should recommend breaking down complex tasks', () => {
      const scores = { impact: 3, complexity: 5, reusability: 3, strategic: 3 };
      const weightedScore = engine.calculateWeightedScore(scores);
      const recommendation = engine.generateRecommendation(scores, weightedScore);
      
      expect(recommendation.recommendations).toContain('Consider breaking into smaller tasks');
    });
  });
  
  describe('evaluate', () => {
    test('should evaluate a task successfully', async () => {
      const taskDescription = 'Implement user authentication';
      const scores = { impact: 4, complexity: 3, reusability: 3, strategic: 4 };
      
      const result = await engine.evaluate(taskDescription, scores);
      
      expect(result.task).toBe(taskDescription);
      expect(result.scores).toEqual(scores);
      expect(result.weightedScore).toBeGreaterThan(0);
      expect(result.priority).toMatch(/high|medium|low|backlog/);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.timestamp).toBeDefined();
    });
    
    test('should throw error for invalid task description', async () => {
      const scores = { impact: 4, complexity: 3, reusability: 3, strategic: 4 };
      
      await expect(engine.evaluate('', scores)).rejects.toThrow('Task description must be a non-empty string');
      await expect(engine.evaluate(null, scores)).rejects.toThrow('Task description must be a non-empty string');
    });
    
    test('should throw error for missing scores', async () => {
      const taskDescription = 'Test task';
      
      await expect(engine.evaluate(taskDescription, null)).rejects.toThrow('Scores must be provided as an object');
      await expect(engine.evaluate(taskDescription, undefined)).rejects.toThrow('Scores must be provided as an object');
    });
    
    test('should include metadata when provided', async () => {
      const taskDescription = 'Test task';
      const scores = { impact: 4, complexity: 3, reusability: 3, strategic: 4 };
      const options = { evaluator: 'John Doe', notes: 'Test evaluation' };
      
      const result = await engine.evaluate(taskDescription, scores, options);
      
      expect(result.metadata.evaluator).toBe('John Doe');
      expect(result.metadata.notes).toBe('Test evaluation');
    });
  });
  
  describe('compareMultiple', () => {
    test('should compare multiple tasks successfully', async () => {
      const tasks = [
        {
          description: 'Task A',
          scores: { impact: 5, complexity: 2, reusability: 3, strategic: 4 }
        },
        {
          description: 'Task B',
          scores: { impact: 3, complexity: 4, reusability: 2, strategic: 3 }
        },
        {
          description: 'Task C',
          scores: { impact: 4, complexity: 1, reusability: 5, strategic: 2 }
        }
      ];
      
      const result = await engine.compareMultiple(tasks);
      
      expect(result.comparison.taskCount).toBe(3);
      expect(result.evaluations).toHaveLength(3);
      
      // Should be sorted by weighted score (descending)
      expect(result.evaluations[0].rank).toBe(1);
      expect(result.evaluations[1].rank).toBe(2);
      expect(result.evaluations[2].rank).toBe(3);
      
      // Verify sorting order
      expect(result.evaluations[0].weightedScore).toBeGreaterThanOrEqual(result.evaluations[1].weightedScore);
      expect(result.evaluations[1].weightedScore).toBeGreaterThanOrEqual(result.evaluations[2].weightedScore);
    });
    
    test('should throw error for empty task array', async () => {
      await expect(engine.compareMultiple([])).rejects.toThrow('Tasks must be provided as a non-empty array');
    });
    
    test('should throw error for invalid task structure', async () => {
      const invalidTasks = [
        { description: 'Task A' } // missing scores
      ];
      
      await expect(engine.compareMultiple(invalidTasks)).rejects.toThrow('Each task must have description and scores properties');
    });
    
    test('should count priority distribution correctly', async () => {
      const tasks = [
        { description: 'High priority task', scores: { impact: 5, complexity: 1, reusability: 5, strategic: 5 } },
        { description: 'Medium priority task', scores: { impact: 3, complexity: 3, reusability: 3, strategic: 3 } },
        { description: 'Low priority task', scores: { impact: 2, complexity: 4, reusability: 2, strategic: 2 } }
      ];
      
      const result = await engine.compareMultiple(tasks);
      
      expect(result.comparison.highPriority).toBeGreaterThanOrEqual(0);
      expect(result.comparison.mediumPriority).toBeGreaterThanOrEqual(0);
      expect(result.comparison.lowPriority).toBeGreaterThanOrEqual(0);
      
      const totalPriorities = result.comparison.highPriority + 
                             result.comparison.mediumPriority + 
                             result.comparison.lowPriority;
      expect(totalPriorities).toBe(3);
    });
  });
});