// Unit tests for RubricEngine — RICE framework
const RubricEngine = require('../../lib/rubric-engine');

describe('RubricEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new RubricEngine();
  });

  describe('validateScores', () => {
    test('should validate correct RICE scores', () => {
      const scores = { reach: 100, impact: 2, confidence: 0.8, effort: 3 };
      expect(() => engine.validateScores(scores)).not.toThrow();
    });

    test('should throw error for zero reach', () => {
      const scores = { reach: 0, impact: 2, confidence: 0.8, effort: 3 };
      expect(() => engine.validateScores(scores)).toThrow(
        'Invalid score for reach'
      );
    });

    test('should throw error for negative effort', () => {
      const scores = { reach: 100, impact: 2, confidence: 0.8, effort: -1 };
      expect(() => engine.validateScores(scores)).toThrow(
        'Invalid score for effort'
      );
    });

    test('should throw error for confidence above 1', () => {
      const scores = { reach: 100, impact: 2, confidence: 1.5, effort: 3 };
      expect(() => engine.validateScores(scores)).toThrow(
        'Invalid score for confidence'
      );
    });

    test('should throw error for zero confidence', () => {
      const scores = { reach: 100, impact: 2, confidence: 0, effort: 3 };
      expect(() => engine.validateScores(scores)).toThrow(
        'Invalid score for confidence'
      );
    });
  });

  describe('calculateRiceScore', () => {
    test('should calculate RICE score correctly', () => {
      const scores = { reach: 100, impact: 2, confidence: 0.8, effort: 5 };
      const riceScore = engine.calculateRiceScore(scores);

      // (100 * 2 * 0.8) / 5 = 32
      expect(riceScore).toBe(32);
    });

    test('should handle small values', () => {
      const scores = { reach: 1, impact: 0.25, confidence: 0.5, effort: 20 };
      const riceScore = engine.calculateRiceScore(scores);

      // (1 * 0.25 * 0.5) / 20 = 0.00625 → 0.01
      expect(riceScore).toBeCloseTo(0.01, 2);
    });

    test('should handle high values', () => {
      const scores = { reach: 1000, impact: 3, confidence: 1.0, effort: 0.5 };
      const riceScore = engine.calculateRiceScore(scores);

      // (1000 * 3 * 1.0) / 0.5 = 6000
      expect(riceScore).toBe(6000);
    });
  });

  describe('getPriorityLevel', () => {
    test('should return correct priority levels', () => {
      expect(engine.getPriorityLevel(100)).toBe('high');
      expect(engine.getPriorityLevel(50)).toBe('medium');
      expect(engine.getPriorityLevel(5)).toBe('low');
      expect(engine.getPriorityLevel(0.5)).toBe('backlog');
    });

    test('should handle boundary conditions', () => {
      expect(engine.getPriorityLevel(100)).toBe('high');
      expect(engine.getPriorityLevel(99)).toBe('medium');
      expect(engine.getPriorityLevel(10)).toBe('medium');
      expect(engine.getPriorityLevel(9)).toBe('low');
      expect(engine.getPriorityLevel(1)).toBe('low');
      expect(engine.getPriorityLevel(0.9)).toBe('backlog');
    });
  });

  describe('generateRecommendation', () => {
    test('should identify quick wins', () => {
      const scores = { reach: 100, impact: 3, confidence: 0.8, effort: 0.5 };
      const riceScore = engine.calculateRiceScore(scores);
      const recommendation = engine.generateRecommendation(scores, riceScore);
      expect(recommendation.recommendations).toContain(
        'Quick win - high impact, low effort'
      );
    });

    test('should flag low confidence', () => {
      const scores = { reach: 100, impact: 2, confidence: 0.5, effort: 3 };
      const riceScore = engine.calculateRiceScore(scores);
      const recommendation = engine.generateRecommendation(scores, riceScore);
      expect(recommendation.recommendations).toContain(
        'Low confidence - validate assumptions before investing'
      );
    });

    test('should recommend breaking down high-effort tasks', () => {
      const scores = { reach: 100, impact: 2, confidence: 0.8, effort: 10 };
      const riceScore = engine.calculateRiceScore(scores);
      const recommendation = engine.generateRecommendation(scores, riceScore);
      expect(recommendation.recommendations).toContain(
        'Consider breaking into smaller tasks'
      );
    });
  });

  describe('evaluate', () => {
    test('should evaluate a task successfully', async () => {
      const taskDescription = 'Implement user authentication';
      const scores = { reach: 100, impact: 3, confidence: 0.8, effort: 5 };

      const result = await engine.evaluate(taskDescription, scores);

      expect(result.task).toBe(taskDescription);
      expect(result.scores).toEqual(scores);
      expect(result.riceScore).toBeGreaterThan(0);
      expect(result.priority).toMatch(/high|medium|low|backlog/);
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.timestamp).toBeDefined();
    });

    test('should throw error for invalid task description', async () => {
      const scores = { reach: 100, impact: 3, confidence: 0.8, effort: 5 };
      await expect(engine.evaluate('', scores)).rejects.toThrow(
        'Task description must be a non-empty string'
      );
      await expect(engine.evaluate(null, scores)).rejects.toThrow(
        'Task description must be a non-empty string'
      );
    });

    test('should throw error for missing scores', async () => {
      await expect(engine.evaluate('Test task', null)).rejects.toThrow(
        'Scores must be provided as an object'
      );
    });

    test('should include metadata when provided', async () => {
      const scores = { reach: 100, impact: 3, confidence: 0.8, effort: 5 };
      const result = await engine.evaluate('Test task', scores, {
        evaluator: 'Jane',
        notes: 'Test evaluation',
      });
      expect(result.metadata.evaluator).toBe('Jane');
      expect(result.metadata.notes).toBe('Test evaluation');
    });
  });

  describe('compareMultiple', () => {
    test('should compare and rank tasks by RICE score', async () => {
      const tasks = [
        {
          description: 'Low priority',
          scores: { reach: 1, impact: 0.5, confidence: 0.5, effort: 10 },
        },
        {
          description: 'High priority',
          scores: { reach: 1000, impact: 3, confidence: 1.0, effort: 1 },
        },
        {
          description: 'Medium priority',
          scores: { reach: 100, impact: 2, confidence: 0.8, effort: 5 },
        },
      ];

      const result = await engine.compareMultiple(tasks);

      expect(result.comparison.taskCount).toBe(3);
      expect(result.evaluations).toHaveLength(3);
      expect(result.evaluations[0].rank).toBe(1);
      expect(result.evaluations[0].task).toBe('High priority');
      expect(result.evaluations[0].riceScore).toBeGreaterThan(
        result.evaluations[1].riceScore
      );
      expect(result.evaluations[1].riceScore).toBeGreaterThan(
        result.evaluations[2].riceScore
      );
    });

    test('should throw error for empty task array', async () => {
      await expect(engine.compareMultiple([])).rejects.toThrow(
        'Tasks must be provided as a non-empty array'
      );
    });

    test('should throw error for invalid task structure', async () => {
      await expect(
        engine.compareMultiple([{ description: 'A' }])
      ).rejects.toThrow(
        'Each task must have description and scores properties'
      );
    });
  });
});
