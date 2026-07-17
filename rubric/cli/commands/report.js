// CLI command for generating reports from evaluation history
const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { ReportGenerator } = require('../../lib/report-generator');

const reportCommand = new Command('report')
  .description('Generate reports from evaluation history')
  .option('-f, --format <type>', 'Report format (json|markdown|csv|html)', 'markdown')
  .option('-o, --output <path>', 'Output file path')
  .option('-p, --period <period>', 'Time period (last-day, last-week, last-month, all)', 'all')
  .option('--priority <level>', 'Filter by priority level (high, medium, low, backlog)')
  .option('--evaluator <name>', 'Filter by evaluator name')
  .option('--input <path>', 'Use specific evaluation file instead of history')
  .action(async (options) => {
    try {
      let evaluations = [];
      
      if (options.input) {
        // Load specific input file
        if (!(await fs.pathExists(options.input))) {
          console.error(chalk.red('✖ Error: Input file not found'));
          process.exit(1);
        }
        
        const inputData = await fs.readJson(options.input);
        evaluations = Array.isArray(inputData) ? inputData : 
                     inputData.evaluations ? inputData.evaluations : [inputData];
        
        console.log(chalk.blue(`📂 Loaded ${evaluations.length} evaluations from ${options.input}`));
      } else {
        // Load from evaluation history
        evaluations = await loadEvaluationHistory(options.period);
        
        if (evaluations.length === 0) {
          console.log(chalk.yellow('⚠️  No evaluations found in history'));
          console.log(chalk.gray('Run some evaluations with --save flag to build history'));
          process.exit(0);
        }
        
        console.log(chalk.blue(`📊 Found ${evaluations.length} evaluations in history`));
      }
      
      // Apply filters
      let filteredEvaluations = [...evaluations];
      
      if (options.priority) {
        filteredEvaluations = filteredEvaluations.filter(e => e.priority === options.priority);
        console.log(chalk.gray(`🔍 Filtered to ${filteredEvaluations.length} ${options.priority} priority tasks`));
      }
      
      if (options.evaluator) {
        filteredEvaluations = filteredEvaluations.filter(e => 
          e.metadata?.evaluator === options.evaluator
        );
        console.log(chalk.gray(`🔍 Filtered to ${filteredEvaluations.length} evaluations by ${options.evaluator}`));
      }
      
      if (filteredEvaluations.length === 0) {
        console.log(chalk.yellow('⚠️  No evaluations match the specified filters'));
        process.exit(0);
      }
      
      // Generate report
      console.log(chalk.blue('📝 Generating report...'));
      
      const reportGenerator = new ReportGenerator();
      const reportOptions = {
        outputPath: options.output
      };
      
      const report = await reportGenerator.generate(filteredEvaluations, options.format, reportOptions);
      
      if (options.output) {
        console.log(chalk.green(`✅ Report saved to ${options.output}`));
        
        // Show file size
        const stats = await fs.stat(options.output);
        console.log(chalk.gray(`📄 File size: ${(stats.size / 1024).toFixed(2)} KB`));
      } else {
        // Output to console
        console.log(chalk.blue('\n📋 Generated Report:\n'));
        console.log(report);
      }
      
      // Show summary statistics
      await showSummaryStats(filteredEvaluations);
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// Load evaluation history based on time period
async function loadEvaluationHistory(period) {
  const historyDir = path.join(process.cwd(), '.rubric', 'evaluations');
  
  if (!(await fs.pathExists(historyDir))) {
    return [];
  }
  
  // Get all evaluation files
  const pattern = path.join(historyDir, '*.json');
  const files = glob.sync(pattern);
  
  if (files.length === 0) {
    return [];
  }
  
  // Load and filter by time period
  const evaluations = [];
  const now = new Date();
  
  for (const file of files) {
    try {
      const evaluation = await fs.readJson(file);
      
      if (evaluation.timestamp) {
        const evaluationDate = new Date(evaluation.timestamp);
        
        // Filter by period
        let include = true;
        switch (period) {
          case 'last-day':
            include = (now - evaluationDate) <= 24 * 60 * 60 * 1000;
            break;
          case 'last-week':
            include = (now - evaluationDate) <= 7 * 24 * 60 * 60 * 1000;
            break;
          case 'last-month':
            include = (now - evaluationDate) <= 30 * 24 * 60 * 60 * 1000;
            break;
          case 'all':
          default:
            include = true;
            break;
        }
        
        if (include) {
          evaluations.push(evaluation);
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load ${file}: ${error.message}`));
    }
  }
  
  // Sort by timestamp (newest first)
  evaluations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return evaluations;
}

// Show summary statistics
async function showSummaryStats(evaluations) {
  console.log(chalk.blue('\n📈 Summary Statistics:'));
  
  // Priority distribution
  const priorities = {
    high: evaluations.filter(e => e.priority === 'high').length,
    medium: evaluations.filter(e => e.priority === 'medium').length,
    low: evaluations.filter(e => e.priority === 'low').length,
    backlog: evaluations.filter(e => e.priority === 'backlog').length
  };
  
  console.log(chalk.gray(`High Priority: ${priorities.high} (${((priorities.high / evaluations.length) * 100).toFixed(1)}%)`));
  console.log(chalk.gray(`Medium Priority: ${priorities.medium} (${((priorities.medium / evaluations.length) * 100).toFixed(1)}%)`));
  console.log(chalk.gray(`Low Priority: ${priorities.low} (${((priorities.low / evaluations.length) * 100).toFixed(1)}%)`));
  console.log(chalk.gray(`Backlog: ${priorities.backlog} (${((priorities.backlog / evaluations.length) * 100).toFixed(1)}%)`));
  
  // Score statistics
  const scores = evaluations.map(e => e.weightedScore);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  console.log(chalk.gray(`\nScore Range: ${minScore.toFixed(2)} - ${maxScore.toFixed(2)}`));
  console.log(chalk.gray(`Average Score: ${avgScore.toFixed(2)}`));
  
  // Evaluator statistics
  const evaluators = {};
  evaluations.forEach(e => {
    const evaluator = e.metadata?.evaluator || 'unknown';
    evaluators[evaluator] = (evaluators[evaluator] || 0) + 1;
  });
  
  if (Object.keys(evaluators).length > 1) {
    console.log(chalk.gray('\nEvaluations by Person:'));
    Object.entries(evaluators).forEach(([evaluator, count]) => {
      console.log(chalk.gray(`  ${evaluator}: ${count}`));
    });
  }
  
  // Top recommendations
  const recommendations = {};
  evaluations.forEach(e => {
    if (e.recommendations) {
      e.recommendations.forEach(rec => {
        recommendations[rec] = (recommendations[rec] || 0) + 1;
      });
    }
  });
  
  if (Object.keys(recommendations).length > 0) {
    const sortedRecs = Object.entries(recommendations)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    console.log(chalk.gray('\nTop Recommendations:'));
    sortedRecs.forEach(([rec, count]) => {
      console.log(chalk.gray(`  ${rec} (${count}x)`));
    });
  }
}

module.exports = reportCommand;