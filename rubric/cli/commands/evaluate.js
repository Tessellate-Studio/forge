// CLI command for evaluating individual tasks
const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const { RubricEngine } = require('../../lib');

const evaluateCommand = new Command('evaluate')
  .description('Evaluate a single task or feature using the rubric scoring system')
  .argument('[task]', 'Task description to evaluate')
  .option('-i, --interactive', 'Use interactive mode for scoring')
  .option('-w, --weights <weights>', 'Custom weights (e.g., impact=0.4,complexity=0.3)')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-s, --save', 'Save evaluation to local history')
  .option('-o, --output <format>', 'Output format (json|markdown|table)', 'table')
  .option('--evaluator <name>', 'Name of the person doing the evaluation')
  .option('--notes <notes>', 'Additional notes about the evaluation')
  .action(async (task, options) => {
    try {
      let taskDescription = task;
      let scores = {};
      
      // Get task description if not provided
      if (!taskDescription) {
        if (options.interactive) {
          const taskPrompt = await inquirer.prompt([
            {
              type: 'input',
              name: 'description',
              message: 'Enter the task or feature description:',
              validate: input => input.trim().length > 0 || 'Task description is required'
            }
          ]);
          taskDescription = taskPrompt.description;
        } else {
          console.error(chalk.red('✖ Error: Task description is required'));
          console.log(chalk.yellow('Use --interactive flag or provide task as argument'));
          process.exit(1);
        }
      }
      
      // Handle interactive scoring
      if (options.interactive) {
        console.log(chalk.blue('\n📊 Interactive Rubric Evaluation'));
        console.log(chalk.gray('Score each dimension from 0-5 (0=none, 5=maximum)\n'));
        
        const scoringQuestions = [
          {
            type: 'number',
            name: 'impact',
            message: 'Impact - How much value does this add to users/business?',
            default: 3,
            validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
          },
          {
            type: 'number',
            name: 'complexity',
            message: 'Complexity - How much effort/resources are needed?',
            default: 3,
            validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
          },
          {
            type: 'number',
            name: 'reusability',
            message: 'Reusability - Can this be used across multiple projects?',
            default: 3,
            validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
          },
          {
            type: 'number',
            name: 'strategic',
            message: 'Strategic Fit - How well does this align with vision/roadmap?',
            default: 3,
            validate: value => (value >= 0 && value <= 5) || 'Score must be between 0 and 5'
          }
        ];
        
        scores = await inquirer.prompt(scoringQuestions);
      } else {
        // Non-interactive mode - require all scores as input
        console.error(chalk.red('✖ Error: Interactive mode is required for scoring'));
        console.log(chalk.yellow('Use --interactive flag to enter scores interactively'));
        console.log(chalk.gray('Future versions will support batch scoring from files'));
        process.exit(1);
      }
      
      // Parse custom weights if provided
      let customWeights = {};
      if (options.weights) {
        try {
          const weightPairs = options.weights.split(',');
          for (const pair of weightPairs) {
            const [key, value] = pair.split('=');
            customWeights[key.trim()] = parseFloat(value);
          }
        } catch (error) {
          console.error(chalk.red('✖ Error: Invalid weights format'));
          console.log(chalk.yellow('Use format: impact=0.4,complexity=0.3,reusability=0.2,strategic=0.1'));
          process.exit(1);
        }
      }
      
      // Create rubric engine with options
      const engineOptions = {
        configPath: options.config,
        weights: customWeights
      };
      
      const engine = new RubricEngine(engineOptions);
      
      // Perform evaluation
      console.log(chalk.blue('\n🔄 Processing evaluation...'));
      
      const evaluation = await engine.evaluate(taskDescription, scores, {
        save: options.save,
        evaluator: options.evaluator,
        notes: options.notes
      });
      
      // Display results based on output format
      await displayResults(evaluation, options.output);
      
      // Show success message
      console.log(chalk.green(`\n✅ Evaluation completed successfully!`));
      
      if (options.save) {
        console.log(chalk.gray('💾 Evaluation saved to local history'));
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// Display evaluation results in different formats
async function displayResults(evaluation, format) {
  console.log(chalk.blue('\n📋 Evaluation Results\n'));
  
  switch (format) {
    case 'json':
      console.log(JSON.stringify(evaluation, null, 2));
      break;
      
    case 'markdown':
      console.log(await generateMarkdownOutput(evaluation));
      break;
      
    case 'table':
    default:
      displayTableOutput(evaluation);
      break;
  }
}

// Display results in table format (default)
function displayTableOutput(evaluation) {
  const priorityColors = {
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue,
    backlog: chalk.gray
  };
  
  const priorityColor = priorityColors[evaluation.priority] || chalk.white;
  
  console.log(chalk.bold('Task:'), evaluation.task);
  console.log(chalk.bold('Priority:'), priorityColor(evaluation.priority.toUpperCase()));
  console.log(chalk.bold('Overall Score:'), chalk.cyan(evaluation.weightedScore));
  
  console.log(chalk.bold('\nDimension Scores:'));
  console.log(`  Impact:        ${getScoreBar(evaluation.scores.impact)} ${evaluation.scores.impact}/5`);
  console.log(`  Complexity:    ${getScoreBar(evaluation.scores.complexity)} ${evaluation.scores.complexity}/5`);
  console.log(`  Reusability:   ${getScoreBar(evaluation.scores.reusability)} ${evaluation.scores.reusability}/5`);
  console.log(`  Strategic Fit: ${getScoreBar(evaluation.scores.strategic)} ${evaluation.scores.strategic}/5`);
  
  if (evaluation.recommendations && evaluation.recommendations.length > 0) {
    console.log(chalk.bold('\nRecommendations:'));
    evaluation.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
  }
  
  if (evaluation.metadata) {
    console.log(chalk.bold('\nMetadata:'));
    if (evaluation.metadata.evaluator) {
      console.log(`  Evaluator: ${evaluation.metadata.evaluator}`);
    }
    if (evaluation.metadata.notes) {
      console.log(`  Notes: ${evaluation.metadata.notes}`);
    }
  }
}

// Generate visual score bar
function getScoreBar(score) {
  const totalBars = 5;
  const filledBars = Math.round(score);
  const emptyBars = totalBars - filledBars;
  
  const filled = chalk.green('█'.repeat(filledBars));
  const empty = chalk.gray('░'.repeat(emptyBars));
  
  return `[${filled}${empty}]`;
}

// Generate markdown output
async function generateMarkdownOutput(evaluation) {
  let markdown = `## ${evaluation.task}\n\n`;
  markdown += `**Priority:** ${evaluation.priority.toUpperCase()} (Score: ${evaluation.weightedScore})\n\n`;
  
  markdown += `**Scores:**\n`;
  markdown += `- Impact: ${evaluation.scores.impact}/5\n`;
  markdown += `- Complexity: ${evaluation.scores.complexity}/5\n`;
  markdown += `- Reusability: ${evaluation.scores.reusability}/5\n`;
  markdown += `- Strategic Fit: ${evaluation.scores.strategic}/5\n\n`;
  
  if (evaluation.recommendations && evaluation.recommendations.length > 0) {
    markdown += `**Recommendations:**\n`;
    evaluation.recommendations.forEach(rec => {
      markdown += `- ${rec}\n`;
    });
    markdown += `\n`;
  }
  
  return markdown;
}

module.exports = evaluateCommand;