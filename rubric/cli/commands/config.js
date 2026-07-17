// CLI command for managing rubric configuration
const { Command } = require('commander');
const chalk = require('chalk');
const { ConfigManager } = require('../../lib/config-manager');

const configCommand = new Command('config')
  .description('Manage rubric configuration');

// Show current configuration
configCommand
  .command('show')
  .description('Display current configuration')
  .option('-p, --path <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig(options.path);
      
      console.log(chalk.blue('📋 Current Rubric Configuration\n'));
      
      // Display weights
      console.log(chalk.bold('Scoring Weights:'));
      Object.entries(config.weights).forEach(([key, value]) => {
        console.log(`  ${key.padEnd(12)}: ${chalk.cyan(value.toFixed(2))}`);
      });
      
      // Display thresholds
      console.log(chalk.bold('\nPriority Thresholds:'));
      Object.entries(config.thresholds).forEach(([key, value]) => {
        const color = key === 'high_priority' ? chalk.red : 
                     key === 'medium_priority' ? chalk.yellow : 
                     key === 'low_priority' ? chalk.blue : chalk.gray;
        console.log(`  ${key.replace('_', ' ').padEnd(15)}: ${color(value.toFixed(1))}`);
      });
      
      // Display settings
      if (config.settings) {
        console.log(chalk.bold('\nSettings:'));
        Object.entries(config.settings).forEach(([key, value]) => {
          console.log(`  ${key.padEnd(15)}: ${chalk.green(value)}`);
        });
      }
      
      // Show available profiles
      if (config.profiles && Object.keys(config.profiles).length > 0) {
        console.log(chalk.bold('\nAvailable Profiles:'));
        Object.entries(config.profiles).forEach(([key, profile]) => {
          console.log(`  ${chalk.cyan(key.padEnd(10))}: ${profile.name}`);
        });
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// List available profiles
configCommand
  .command('profiles')
  .description('List available scoring profiles')
  .action(() => {
    try {
      const configManager = new ConfigManager();
      const profiles = configManager.getAvailableProfiles();
      
      console.log(chalk.blue('📊 Available Scoring Profiles\n'));
      
      profiles.forEach(profile => {
        console.log(chalk.bold(`${profile.name}:`));
        console.log(chalk.gray(`  Description: ${profile.description}`));
        console.log(chalk.gray('  Weights:'));
        Object.entries(profile.weights).forEach(([key, value]) => {
          console.log(chalk.gray(`    ${key}: ${value}`));
        });
        console.log();
      });
      
      console.log(chalk.yellow('💡 Use `rubric init --profile <name>` to use a profile'));
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// Validate configuration
configCommand
  .command('validate')
  .description('Validate configuration file')
  .option('-p, --path <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig(options.path);
      const validation = configManager.validateConfig(config);
      
      if (validation.valid) {
        console.log(chalk.green('✅ Configuration is valid!'));
        
        // Show summary
        const weightSum = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
        console.log(chalk.gray(`\nWeights sum: ${weightSum.toFixed(3)}`));
        console.log(chalk.gray(`Thresholds: High(${config.thresholds.high_priority}) > Medium(${config.thresholds.medium_priority}) > Low(${config.thresholds.low_priority})`));
      } else {
        console.log(chalk.red('❌ Configuration validation failed!\n'));
        validation.errors.forEach(error => {
          console.log(chalk.red(`  ✖ ${error}`));
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

// Update configuration
configCommand
  .command('set')
  .description('Update configuration values')
  .argument('<key>', 'Configuration key (e.g., weights.impact, thresholds.high_priority)')
  .argument('<value>', 'New value')
  .option('-p, --path <path>', 'Path to configuration file')
  .action(async (key, value, options) => {
    try {
      const configManager = new ConfigManager();
      const configPath = options.path || await configManager.findConfigFile();
      
      if (!configPath) {
        console.error(chalk.red('✖ Error: No configuration file found'));
        console.log(chalk.yellow('Run `rubric init` to create a configuration file'));
        process.exit(1);
      }
      
      // Parse the key path (e.g., "weights.impact" -> ["weights", "impact"])
      const keyPath = key.split('.');
      if (keyPath.length !== 2) {
        console.error(chalk.red('✖ Error: Key must be in format section.property (e.g., weights.impact)'));
        process.exit(1);
      }
      
      // Parse the value
      let parsedValue;
      if (value === 'true' || value === 'false') {
        parsedValue = value === 'true';
      } else if (!isNaN(value)) {
        parsedValue = parseFloat(value);
      } else {
        parsedValue = value;
      }
      
      // Create update object
      const updates = {};
      if (!updates[keyPath[0]]) updates[keyPath[0]] = {};
      updates[keyPath[0]][keyPath[1]] = parsedValue;
      
      // Update configuration
      const result = await configManager.updateConfig(configPath, updates);
      
      if (result.success) {
        console.log(chalk.green('✅ Configuration updated successfully!'));
        console.log(chalk.gray(`Updated ${key} = ${parsedValue}`));
      }
      
    } catch (error) {
      console.error(chalk.red('✖ Error:'), error.message);
      process.exit(1);
    }
  });

module.exports = configCommand;