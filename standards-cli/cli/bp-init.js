#!/usr/bin/env node

const chalk = require('chalk');
const inquirer = require('inquirer');
const sdk = require('../lib/index');

// Initialize new project with best practices
module.exports = async function initProject(projectName, options) {
  console.log(chalk.blue('\n🚀 Initializing Best Practices SDK project...\n'));

  try {
    // If no project name provided, prompt for it
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'What is your project name?',
          validate: (input) => {
            if (!input.trim()) return 'Project name is required';
            if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Project name can only contain letters, numbers, hyphens, and underscores';
            return true;
          }
        }
      ]);
      projectName = answers.projectName;
    }

    // Interactive prompts for configuration
    const config = await promptForConfiguration(options);
    
    // Create project using SDK
    console.log(chalk.gray(`Creating project: ${projectName}`));
    console.log(chalk.gray(`Template: ${config.template}`));
    console.log(chalk.gray(`Location: ./${projectName}\n`));
    
    const result = await sdk.init({
      projectName,
      template: config.template,
      autoSetupCI: config.setupCI
    });

    if (result.success) {
      console.log(chalk.green('✅ Project initialized successfully!\n'));
      
      // Display next steps
      displayNextSteps(projectName, config);
      
    } else {
      console.error(chalk.red('❌ Failed to initialize project:'), result.message);
      process.exit(1);
    }

  } catch (error) {
    console.error(chalk.red('💥 Error during initialization:'), error.message);
    process.exit(1);
  }
};

// Prompt user for project configuration
async function promptForConfiguration(options) {
  const questions = [];

  // Template selection
  if (!options.template) {
    questions.push({
      type: 'list',
      name: 'template',
      message: 'Which project template would you like to use?',
      choices: [
        { name: '🌐 Web Application (Express + Frontend)', value: 'web-app' },
        { name: '🔌 REST API (Express)', value: 'api' },
        { name: '📦 NPM Library/Package', value: 'library' },
        { name: '⚡ Basic Node.js', value: 'basic' }
      ],
      default: 'web-app'
    });
  }

  // GitHub setup
  if (options.github !== false) {
    questions.push({
      type: 'confirm',
      name: 'setupGitHub',
      message: 'Set up GitHub repository?',
      default: true
    });
  }

  // CI/CD setup
  if (options.ci !== false) {
    questions.push({
      type: 'confirm',
      name: 'setupCI',
      message: 'Set up automated CI/CD pipeline?',
      default: true
    });
  }

  // Standards configuration
  questions.push({
    type: 'checkbox',
    name: 'standards',
    message: 'Which standards would you like to enforce?',
    choices: [
      { name: 'In-line comments for all functions', value: 'comments', checked: true },
      { name: 'Maximum function length (50 lines)', value: 'function-length', checked: true },
      { name: 'Security scanning (secrets, vulnerabilities)', value: 'security', checked: true },
      { name: 'Performance monitoring (bundle size, speed)', value: 'performance', checked: true },
      { name: '80% test coverage requirement', value: 'test-coverage', checked: true }
    ]
  });

  // Get answers from user
  const answers = await inquirer.prompt(questions);

  // Merge with provided options
  return {
    template: options.template || answers.template,
    setupGitHub: options.github !== false && (answers.setupGitHub !== false),
    setupCI: options.ci !== false && (answers.setupCI !== false),
    standards: answers.standards || [],
    
    // Convert standards array to config object
    code: {
      enforceComments: answers.standards?.includes('comments') !== false,
      maxFunctionLines: answers.standards?.includes('function-length') !== false ? 50 : null,
      testCoverage: answers.standards?.includes('test-coverage') !== false ? 80 : null
    },
    security: {
      scanSecrets: answers.standards?.includes('security') !== false,
      vulnerabilityScan: answers.standards?.includes('security') !== false
    },
    performance: {
      bundleSize: answers.standards?.includes('performance') !== false ? '500KB' : null,
      loadTime: answers.standards?.includes('performance') !== false ? '2s' : null
    }
  };
}

// Display next steps after successful initialization
function displayNextSteps(projectName, config) {
  console.log(chalk.blue('📋 Next Steps:\n'));
  
  console.log(chalk.white('1. Navigate to your project:'));
  console.log(chalk.gray(`   cd ${projectName}\n`));
  
  console.log(chalk.white('2. Install dependencies:'));
  console.log(chalk.gray('   npm install\n'));
  
  if (config.template === 'web-app' || config.template === 'api') {
    console.log(chalk.white('3. Set up environment variables:'));
    console.log(chalk.gray('   cp .env.example .env'));
    console.log(chalk.gray('   # Edit .env with your actual values\n'));
    
    console.log(chalk.white('4. Start development server:'));
    console.log(chalk.gray('   npm run dev\n'));
  } else if (config.template === 'library') {
    console.log(chalk.white('3. Build your library:'));
    console.log(chalk.gray('   npm run build\n'));
    
    console.log(chalk.white('4. Run tests:'));
    console.log(chalk.gray('   npm test\n'));
  }
  
  console.log(chalk.white('5. Validate your code:'));
  console.log(chalk.gray('   npx bp validate\n'));
  
  if (config.setupGitHub) {
    console.log(chalk.white('6. Your GitHub repository is ready!'));
    console.log(chalk.gray('   - Automated PR creation enabled'));
    console.log(chalk.gray('   - Claude code reviews configured'));
    console.log(chalk.gray('   - Auto-merge for approved PRs\n'));
  }
  
  console.log(chalk.green('🎉 Happy coding with Best Practices SDK!'));
  console.log(chalk.blue('📚 Documentation: https://github.com/ramsaptami/best-practices-sdk\n'));
}

// Handle CLI errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('💥 Unhandled error during initialization:'));
  console.error(reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('💥 Fatal error:'));
  console.error(error.message);
  process.exit(1);
});