// Core rubric scoring engine implementation
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

class RubricEngine {
  constructor(options = {}) {
    // Default scoring weights based on best practices
    this.defaultWeights = {
      impact: 0.35,      // How much value it adds
      complexity: 0.25,  // Effort required (inverted for scoring)
      reusability: 0.20, // Cross-project potential  
      strategic: 0.20    // Vision alignment
    };
    
    // Default scoring thresholds for decision making
    this.defaultThresholds = {
      high_priority: 3,
      medium_priority: 2,
      low_priority: 1
    };
    
    this.config = this.loadConfig(options.configPath);
    this.weights = options.weights || this.config.weights || this.defaultWeights;
    this.thresholds = options.thresholds || this.config.thresholds || this.defaultThresholds;
  }

  // Load configuration from file or use defaults
  loadConfig(configPath) {
    try {
      if (configPath && fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        return yaml.parse(configContent);
      }
      
      // Try to find config in current directory
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

  // Validate scoring input to ensure all dimensions are provided
  validateScores(scores) {
    const requiredDimensions = ['impact', 'complexity', 'reusability', 'strategic'];
    const missing = requiredDimensions.filter(dim => !(dim in scores));
    
    if (missing.length > 0) {
      throw new Error(`Missing required scoring dimensions: ${missing.join(', ')}`);
    }
    
    // Ensure all scores are within valid range (0-3)
    for (const [dimension, score] of Object.entries(scores)) {
      if (typeof score !== 'number' || score < 0 || score > 3) {
        throw new Error(`Invalid score for ${dimension}: must be a number between 0 and 3`);
      }
    }
  }

  // Calculate weighted score from individual dimension scores
  calculateWeightedScore(scores) {
    this.validateScores(scores);
    
    let totalScore = 0;
    let totalWeight = 0;
    
    // Calculate weighted average, inverting complexity (higher complexity = lower priority)
    for (const [dimension, weight] of Object.entries(this.weights)) {
      if (scores[dimension] !== undefined) {
        let adjustedScore = scores[dimension];
        
        // Invert complexity score (high complexity = low priority)
        if (dimension === 'complexity') {
          adjustedScore = 3 - adjustedScore;
        }
        
        totalScore += adjustedScore * weight;
        totalWeight += weight;
      }
    }
    
    // Return normalized score
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  // Determine priority level based on calculated score
  getPriorityLevel(score) {
    if (score >= this.thresholds.high_priority) {
      return 'high';
    } else if (score >= this.thresholds.medium_priority) {
      return 'medium';
    } else if (score >= this.thresholds.low_priority) {
      return 'low';
    } else {
      return 'backlog';
    }
  }

  // Generate detailed recommendation based on scores
  generateRecommendation(scores, weightedScore) {
    const priority = this.getPriorityLevel(weightedScore);
    const recommendations = [];
    
    // Analyze individual dimension scores for specific recommendations
    if (scores.impact >= 3 && scores.complexity <= 1) {
      recommendations.push('Quick win - high impact, low complexity');
    }
    
    if (scores.reusability >= 3) {
      recommendations.push('Consider creating reusable component/library');
    }
    
    if (scores.strategic >= 3) {
      recommendations.push('Aligns well with strategic objectives');
    }
    
    if (scores.complexity >= 3) {
      recommendations.push('Consider breaking into smaller tasks');
    }
    
    if (scores.impact <= 1 && scores.complexity >= 2) {
      recommendations.push('Low value for effort - consider alternatives');
    }
    
    return {
      priority,
      recommendations: recommendations.length > 0 ? recommendations : ['Standard implementation approach']
    };
  }

  // Main evaluation method for single task
  async evaluate(taskDescription, scores, options = {}) {
    try {
      if (!taskDescription || typeof taskDescription !== 'string') {
        throw new Error('Task description must be a non-empty string');
      }
      
      if (!scores || typeof scores !== 'object') {
        throw new Error('Scores must be provided as an object');
      }
      
      // Calculate weighted score and priority
      const weightedScore = this.calculateWeightedScore(scores);
      const recommendation = this.generateRecommendation(scores, weightedScore);
      
      // Create comprehensive evaluation result
      const evaluation = {
        task: taskDescription,
        timestamp: new Date().toISOString(),
        scores: { ...scores },
        weights: { ...this.weights },
        weightedScore: Math.round(weightedScore * 100) / 100, // Round to 2 decimal places
        priority: recommendation.priority,
        recommendations: recommendation.recommendations,
        metadata: {
          evaluator: options.evaluator || 'system',
          version: '1.0.0',
          notes: options.notes || null
        }
      };
      
      // Save evaluation if requested
      if (options.save) {
        await this.saveEvaluation(evaluation);
      }
      
      return evaluation;
    } catch (error) {
      throw new Error(`Evaluation failed: ${error.message}`);
    }
  }

  // Compare multiple tasks and rank them by priority
  async compareMultiple(tasks, options = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Tasks must be provided as a non-empty array');
    }
    
    const evaluations = [];
    
    // Evaluate each task individually
    for (const task of tasks) {
      if (!task.description || !task.scores) {
        throw new Error('Each task must have description and scores properties');
      }
      
      const evaluation = await this.evaluate(task.description, task.scores, {
        ...options,
        evaluator: task.evaluator || options.evaluator,
        notes: task.notes
      });
      
      evaluations.push(evaluation);
    }
    
    // Sort by weighted score (descending)
    evaluations.sort((a, b) => b.weightedScore - a.weightedScore);
    
    // Add ranking information
    evaluations.forEach((evaluation, index) => {
      evaluation.rank = index + 1;
    });
    
    return {
      comparison: {
        timestamp: new Date().toISOString(),
        taskCount: evaluations.length,
        highPriority: evaluations.filter(e => e.priority === 'high').length,
        mediumPriority: evaluations.filter(e => e.priority === 'medium').length,
        lowPriority: evaluations.filter(e => e.priority === 'low').length
      },
      evaluations
    };
  }

  // Save evaluation to file system for tracking
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