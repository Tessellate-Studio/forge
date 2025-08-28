// CLI command for initializing rubric configuration
const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { ConfigManager } = require('../../lib/config-manager');

const initCommand = new Command('init')
  .description('Initialize rubric configuration in current project')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-p, --profile <name>', 'Use a predefined profile (startup, enterprise, research)')
  .option('--weights <weights>', 'Custom weights (e.g., impact=0.4,complexity=0.3)')
  .option('--interactive', 'Interactive configuration setup')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      
      console.log(chalk.blue('🚀 Initializing Rubric SDK Configuration\n'));
      
      let initOptions = { force: options.force };
      
      // Interactive setup
      if (options.interactive) {
        console.log(chalk.yellow('📋 Interactive Configuration Setup\n'));
        
        // Profile selection
        const profiles = configManager.getAvailableProfiles();
        const profileChoices = profiles.map(p => ({
          name: `${p.name} - ${p.description}`,
          value: p.name
        }));
        profileChoices.push({ name: 'Custom - Configure weights manually', value: 'custom' });
        
        const setupQuestions = [
          {
            type: 'list',
            name: 'profile',
            message: 'Choose a scoring profile:',
            choices: profileChoices
          }
        ];
        
        const setup = await inquirer.prompt(setupQuestions);
        
        if (setup.profile !== 'custom') {
          initOptions.profile = setup.profile;
          
          // Show selected profile weights
          const selectedProfile = profiles.find(p => p.name === setup.profile);
          console.log(chalk.green(`\n✅ Selected profile: ${selectedProfile.description}`));
          console.log(chalk.gray('Weights:'));
          Object.entries(selectedProfile.weights).forEach(([key, value]) => {
            console.log(chalk.gray(`  ${key}: ${value}`));
          });
        } else {
          // Custom weights setup
          console.log(chalk.yellow('\n⚙️  Custom Weights Configuration'));
          console.log(chalk.gray('Weights must sum to 1.0. Default values shown in parentheses.\n'));
          
          const weightQuestions = [
            {
              type: 'number',
              name: 'impact',
              message: 'Impact weight (0.35):',
              default: 0.35,
              validate: value => (value >= 0 && value <= 1) || 'Weight must be between 0 and 1'
            },
            {
              type: 'number',
              name: 'complexity',
              message: 'Complexity weight (0.25):',
              default: 0.25,
              validate: value => (value >= 0 && value <= 1) || 'Weight must be between 0 and 1'
            },
            {
              type: 'number',
              name: 'reusability',
              message: 'Reusability weight (0.20):',
              default: 0.20,
              validate: value => (value >= 0 && value <= 1) || 'Weight must be between 0 and 1'
            },
            {
              type: 'number',
              name: 'strategic',
              message: 'Strategic Fit weight (0.20):',
              default: 0.20,
              validate: value => (value >= 0 && value <= 1) || 'Weight must be between 0 and 1'
            }
          ];
          
          const customWeights = await inquirer.prompt(weightQuestions);
          
          // Validate weights sum to 1.0
          const weightSum = Object.values(customWeights).reduce((sum, weight) => sum + weight, 0);
          if (Math.abs(weightSum - 1.0) > 0.01) {
            console.error(chalk.red(`✖ Error: Weights must sum to 1.0, current sum: ${weightSum.toFixed(2)}`));
            console.log(chalk.yellow('Please restart and adjust your weights.'));
            process.exit(1);
          }
          
          initOptions.weights = customWeights;
        }
        
        // Additional settings
        const additionalQuestions = [
          {
            type: 'confirm',
            name: 'autoSave',
            message: 'Automatically save evaluations to history?',
            default: true
          },
          {
            type: 'list',
            name: 'defaultFormat',
            message: 'Default output format for reports:',
            choices: ['json', 'markdown', 'csv', 'html'],
            default: 'json'
          }
        ];
        
        const additional = await inquirer.prompt(additionalQuestions);
        initOptions.settings = additional;
        
      } else {
        // Non-interactive setup
        if (options.profile) {
          initOptions.profile = options.profile;
        }
        
        if (options.weights) {
          try {
            const weightPairs = options.weights.split(',');
            const customWeights = {};
            for (const pair of weightPairs) {
              const [key, value] = pair.split('=');
              customWeights[key.trim()] = parseFloat(value);
            }
            initOptions.weights = customWeights;
          } catch (error) {
            console.error(chalk.red('✖ Error: Invalid weights format'));
            console.log(chalk.yellow('Use format: impact=0.4,complexity=0.3,reusability=0.2,strategic=0.1'));
            process.exit(1);
          }
        }
      }
      
      // Initialize configuration
      console.log(chalk.blue('\n📝 Creating configuration file...'));
      
      const result = await configManager.initializeConfig(process.cwd(), initOptions);
      
      if (result.success) {
        console.log(chalk.green('✅ Configuration initialized successfully!'));
        console.log(chalk.gray(`📄 Config file: ${result.configPath}`));
        
        // Show next steps
        console.log(chalk.blue('\n🎯 Next Steps:'));
        console.log(chalk.gray('1. Run `rubric evaluate --interactive` to evaluate your first task'));
        console.log(chalk.gray('2. Use `rubric compare` to compare multiple tasks'));
        console.log(chalk.gray('3. Generate reports with `rubric report`'));
        
        // Show example commands
        console.log(chalk.blue('\n📚 Example Commands:'));
        console.log(chalk.gray('  rubric evaluate "Add user authentication" --interactive'));
        console.log(chalk.gray('  rubric report --format markdown --output report.md'));
        console.log(chalk.gray('  rubric config show  # View current configuration'));
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

module.exports = initCommand;