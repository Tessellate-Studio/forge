// CLI command for comparing multiple tasks
const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const { RubricEngine } = require('../../lib');

const compareCommand = new Command('compare')
  .description('Compare and rank multiple tasks using rubric scoring')
  .option('-f, --file <path>', 'Load tasks from JSON file')
  .option('-i, --interactive', 'Interactive mode for entering tasks')
  .option('-o, --output <format>', 'Output format (json|markdown|table)', 'table')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-s, --save', 'Save comparison results to history')
  .option('--evaluator <name>', 'Name of the person doing the evaluation')
  .action(async (options) => {
    try {
      let tasks = [];
      
      // Load tasks from file
      if (options.file) {
        if (!(await fs.pathExists(options.file))) {
          console.error(chalk.red('✖ Error: Tasks file not found'));
          process.exit(1);
        }
        
        const fileData = await fs.readJson(options.file);
        tasks = Array.isArray(fileData) ? fileData : fileData.tasks || [];
        
        if (tasks.length === 0) {
          console.error(chalk.red('✖ Error: No tasks found in file'));
          process.exit(1);
        }
        
        console.log(chalk.blue(`📂 Loaded ${tasks.length} tasks from ${options.file}`));
      }
      
      // Interactive task entry
      if (options.interactive || tasks.length === 0) {
        console.log(chalk.blue('📊 Interactive Task Comparison\n'));
        
        if (tasks.length === 0) {
          // Get number of tasks to compare
          const { taskCount } = await inquirer.prompt([
            {
              type: 'number',
              name: 'taskCount',
              message: 'How many tasks do you want to compare?',
              default: 3,
              validate: value => (value >= 2 && value <= 10) || 'Please enter between 2 and 10 tasks'
            }
          ]);
          
          // Get task descriptions and scores
          for (let i = 1; i <= taskCount; i++) {
            console.log(chalk.yellow(`\n--- Task ${i} ---`));
            
            const taskQuestions = [
              {
                type: 'input',
                name: 'description',
                message: `Enter description for task ${i}:`,
                validate: input => input.trim().length > 0 || 'Task description is required'
              }
            ];
            
            const taskInfo = await inquirer.prompt(taskQuestions);
            
            // Score each dimension
            console.log(chalk.gray('Score each dimension from 0-5:'));
            
            const scoringQuestions = [
              {
                type: 'number',
                name: 'impact',
                message: 'Impact (value to users/business):',
                default: 3,
                validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
              },
              {
                type: 'number',
                name: 'complexity',
                message: 'Complexity (effort/resources needed):',
                default: 3,
                validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
              },
              {
                type: 'number',
                name: 'reusability',
                message: 'Reusability (cross-project potential):',
                default: 3,
                validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
              },
              {
                type: 'number',
                name: 'strategic',
                message: 'Strategic Fit (vision alignment):',
                default: 3,
                validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
              }
            ];
            
            const scores = await inquirer.prompt(scoringQuestions);
            
            // Optional notes
            const { notes } = await inquirer.prompt([
              {
                type: 'input',
                name: 'notes',
                message: 'Additional notes (optional):',
              }
            ]);
            
            tasks.push({
              description: taskInfo.description,
              scores,
              notes: notes || undefined,
              evaluator: options.evaluator
            });
          }
        }
      }
      
      if (tasks.length < 2) {
        console.error(chalk.red('✖ Error: At least 2 tasks are required for comparison'));
        console.log(chalk.yellow('Use --interactive flag to enter tasks or --file to load from JSON'));
        process.exit(1);
      }
      
      // Validate task structure
      for (const [index, task] of tasks.entries()) {
        if (!task.description) {
          console.error(chalk.red(`✖ Error: Task ${index + 1} missing description`));
          process.exit(1);
        }
        if (!task.scores) {
          console.error(chalk.red(`✖ Error: Task ${index + 1} missing scores`));
          process.exit(1);
        }
      }
      
      // Create rubric engine
      const engine = new RubricEngine({
        configPath: options.config
      });
      
      console.log(chalk.blue('\n🔄 Processing comparison...'));
      
      // Perform comparison
      const comparison = await engine.compareMultiple(tasks, {
        save: options.save,
        evaluator: options.evaluator
      });
      
      // Display results
      await displayComparison(comparison, options.output);
      
      console.log(chalk.green('\n✅ Comparison completed successfully!'));
      
      if (options.save) {
        console.log(chalk.gray('💾 Comparison results saved to history'));
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// Display comparison results in different formats
async function displayComparison(comparison, format) {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(comparison, null, 2));
      break;
      
    case 'markdown':
      console.log(generateMarkdownComparison(comparison));
      break;
      
    case 'table':
    default:
      displayTableComparison(comparison);
      break;
  }
}

// Display comparison in table format (default)
function displayTableComparison(comparison) {
  console.log(chalk.blue('\n📊 Task Comparison Results\n'));
  
  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Total Tasks: ${comparison.comparison.taskCount}`);
  console.log(`  High Priority: ${chalk.red(comparison.comparison.highPriority)}`);
  console.log(`  Medium Priority: ${chalk.yellow(comparison.comparison.mediumPriority)}`);
  console.log(`  Low Priority: ${chalk.blue(comparison.comparison.lowPriority)}`);
  
  console.log(chalk.bold('\nRanked Results:'));
  
  comparison.evaluations.forEach((task, index) => {
    const rankColor = index === 0 ? chalk.green : 
                     index === 1 ? chalk.yellow : 
                     index === 2 ? chalk.red : chalk.gray;
    
    const priorityColors = {
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.blue,
      backlog: chalk.gray
    };
    
    const priorityColor = priorityColors[task.priority];
    
    console.log(`\n${rankColor(`#${task.rank}`)} ${chalk.bold(task.task)}`);
    console.log(`   Priority: ${priorityColor(task.priority.toUpperCase())} | Score: ${chalk.cyan(task.weightedScore)}`);
    console.log(`   Impact: ${task.scores.impact} | Complexity: ${task.scores.complexity} | Reusability: ${task.scores.reusability} | Strategic: ${task.scores.strategic}`);
    
    if (task.recommendations && task.recommendations.length > 0) {
      console.log(`   ${chalk.gray('→')} ${task.recommendations[0]}`);
    }
  });
  
  // Show top recommendation
  const topTask = comparison.evaluations[0];
  console.log(chalk.blue('\n🎯 Recommendation:'));
  console.log(chalk.green(`Start with "${topTask.task}" (${topTask.priority} priority, score: ${topTask.weightedScore})`));
}

// Generate markdown comparison output
function generateMarkdownComparison(comparison) {
  let markdown = `# Task Comparison Results\n\n`;
  markdown += `**Generated:** ${comparison.comparison.timestamp}\n`;
  markdown += `**Total Tasks:** ${comparison.comparison.taskCount}\n\n`;
  
  // Summary table
  markdown += `## Summary\n\n`;
  markdown += `| Priority | Count |\n`;
  markdown += `|----------|-------|\n`;
  markdown += `| High | ${comparison.comparison.highPriority} |\n`;
  markdown += `| Medium | ${comparison.comparison.mediumPriority} |\n`;
  markdown += `| Low | ${comparison.comparison.lowPriority} |\n\n`;
  
  // Ranked tasks
  markdown += `## Ranked Tasks\n\n`;
  
  comparison.evaluations.forEach((task) => {
    markdown += `### ${task.rank}. ${task.task}\n\n`;
    markdown += `- **Priority:** ${task.priority.toUpperCase()}\n`;
    markdown += `- **Score:** ${task.weightedScore}\n`;
    markdown += `- **Impact:** ${task.scores.impact}/5\n`;
    markdown += `- **Complexity:** ${task.scores.complexity}/5\n`;
    markdown += `- **Reusability:** ${task.scores.reusability}/5\n`;
    markdown += `- **Strategic Fit:** ${task.scores.strategic}/5\n\n`;
    
    if (task.recommendations && task.recommendations.length > 0) {
      markdown += `**Recommendations:**\n`;
      task.recommendations.forEach(rec => {
        markdown += `- ${rec}\n`;
      });
      markdown += `\n`;
    }
  });
  
  return markdown;
}

module.exports = compareCommand;