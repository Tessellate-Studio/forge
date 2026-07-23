// Core rubric scoring engine — RICE framework.
//
// RICE = (Reach × Impact × Confidence) / Effort
// Adopted from Intercom's prioritisation framework.
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

class RubricEngine {
  constructor(options = {}) {
    this.config = this.loadConfig(options.configPath);
  }

  loadConfig(configPath) {
    try {
      if (configPath && fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        return yaml.parse(configContent);
      }

      const defaultConfigPath = path.join(process.cwd(), 'rubric-config.yml');
      if (fs.existsSync(defaultConfigPath)) {
        const configContent = fs.readFileSync(defaultConfigPath, 'utf8');
        return yaml.parse(configContent);
      }

      return {};
    } catch (error) {
      console.warn(`Warning: Could not load config file: ${error.message}`);
      return {};
    }
  }

  validateScores(scores) {
    if (typeof scores.reach !== 'number' || scores.reach <= 0) {
      throw new Error('Invalid score for reach: must be a positive number');
    }
    if (typeof scores.impact !== 'number' || scores.impact <= 0) {
      throw new Error('Invalid score for impact: must be a positive number');
    }
    if (
      typeof scores.confidence !== 'number' ||
      scores.confidence <= 0 ||
      scores.confidence > 1
    ) {
      throw new Error(
        'Invalid score for confidence: must be between 0 (exclusive) and 1 (inclusive)'
      );
    }
    if (typeof scores.effort !== 'number' || scores.effort <= 0) {
      throw new Error('Invalid score for effort: must be a positive number');
    }
  }

  calculateRiceScore(scores) {
    this.validateScores(scores);
    return (
      Math.round(
        ((scores.reach * scores.impact * scores.confidence) / scores.effort) *
          100
      ) / 100
    );
  }

  getPriorityLevel(riceScore) {
    if (riceScore >= 100) {
      return 'high';
    }
    if (riceScore >= 10) {
      return 'medium';
    }
    if (riceScore >= 1) {
      return 'low';
    }
    return 'backlog';
  }

  generateRecommendation(scores, riceScore) {
    const priority = this.getPriorityLevel(riceScore);
    const recommendations = [];

    if (scores.impact >= 2 && scores.effort <= 1) {
      recommendations.push('Quick win - high impact, low effort');
    }
    if (scores.reach >= 1000) {
      recommendations.push('High reach - affects many users');
    }
    if (scores.confidence <= 0.5) {
      recommendations.push(
        'Low confidence - validate assumptions before investing'
      );
    }
    if (scores.effort >= 10) {
      recommendations.push('Consider breaking into smaller tasks');
    }
    if (scores.impact <= 0.5 && scores.effort >= 5) {
      recommendations.push('Low value for effort - consider alternatives');
    }

    return {
      priority,
      recommendations:
        recommendations.length > 0
          ? recommendations
          : ['Standard implementation approach'],
    };
  }

  async evaluate(taskDescription, scores, options = {}) {
    try {
      if (!taskDescription || typeof taskDescription !== 'string') {
        throw new Error('Task description must be a non-empty string');
      }

      if (!scores || typeof scores !== 'object') {
        throw new Error('Scores must be provided as an object');
      }

      const riceScore = this.calculateRiceScore(scores);
      const recommendation = this.generateRecommendation(scores, riceScore);

      const evaluation = {
        task: taskDescription,
        timestamp: new Date().toISOString(),
        scores: { ...scores },
        riceScore,
        priority: recommendation.priority,
        recommendations: recommendation.recommendations,
        metadata: {
          evaluator: options.evaluator || 'system',
          version: '2.0.0',
          notes: options.notes || null,
        },
      };

      if (options.save) {
        await this.saveEvaluation(evaluation);
      }

      return evaluation;
    } catch (error) {
      throw new Error(`Evaluation failed: ${error.message}`);
    }
  }

  async compareMultiple(tasks, options = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Tasks must be provided as a non-empty array');
    }

    const evaluations = [];

    for (const task of tasks) {
      if (!task.description || !task.scores) {
        throw new Error(
          'Each task must have description and scores properties'
        );
      }

      const evaluation = await this.evaluate(task.description, task.scores, {
        ...options,
        evaluator: task.evaluator || options.evaluator,
        notes: task.notes,
      });

      evaluations.push(evaluation);
    }

    evaluations.sort((left, right) => right.riceScore - left.riceScore);

    evaluations.forEach((evaluation, index) => {
      evaluation.rank = index + 1;
    });

    return {
      comparison: {
        timestamp: new Date().toISOString(),
        taskCount: evaluations.length,
        highPriority: evaluations.filter(ev => ev.priority === 'high').length,
        mediumPriority: evaluations.filter(ev => ev.priority === 'medium')
          .length,
        lowPriority: evaluations.filter(ev => ev.priority === 'low').length,
      },
      evaluations,
    };
  }

  async saveEvaluation(evaluation) {
    try {
      const evaluationsDir = path.join(process.cwd(), '.rubric', 'evaluations');
      await fs.ensureDir(evaluationsDir);

      const filename = `evaluation-${Date.now()}.json`;
      const filepath = path.join(evaluationsDir, filename);

      await fs.writeJson(filepath, evaluation, { spaces: 2 });
      return filepath;
    } catch (error) {
      console.warn(`Warning: Could not save evaluation: ${error.message}`);
    }
  }
}

module.exports = RubricEngine;
