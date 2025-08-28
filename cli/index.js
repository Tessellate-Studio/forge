#!/usr/bin/env node

// Main CLI entry point for Rubric SDK
const { program } = require('commander');
const chalk = require('chalk');
const packageInfo = require('../package.json');

// Import CLI command modules
const evaluateCommand = require('./commands/evaluate');
const compareCommand = require('./commands/compare');
const reportCommand = require('./commands/report');
const initCommand = require('./commands/init');
const configCommand = require('./commands/config');

// Set up the main program
program
  .name('rubric')
  .description('SDK for scoring, comparing, and prioritizing tasks before implementation')
  .version(packageInfo.version, '-v, --version', 'display version number');

// Add commands
program
  .addCommand(evaluateCommand)
  .addCommand(compareCommand)
  .addCommand(reportCommand)
  .addCommand(initCommand)
  .addCommand(configCommand);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(chalk.red('✖ Fatal Error:'), error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('✖ Unhandled Promise Rejection:'), reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}