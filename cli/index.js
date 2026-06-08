#!/usr/bin/env node

// Code Standards CLI Entry Point
const { Command } = require('commander');
const chalk = require('chalk');

// Import + instantiate the SDK (lib/index exports the class)
const SDK = require('../lib/index');
const sdk = new SDK();

const program = new Command();

// CLI version and description
program
  .name('bp')
  .description('Code Standards - AI-powered development framework')
  .version(require('../package.json').version);

// Initialize new project command
program
  .command('init <project-name>')
  .description('Initialize a new project with code standards')
  .option(
    '-t, --template <type>',
    'Project type (react-native, node-service, web, api, library)',
    'web'
  )
  .option('--no-ci', 'Skip CI/CD setup', false)
  .option('-p, --path <path>', 'Custom project path')
  .action(async (projectName, options) => {
    console.log(chalk.blue('🚀 Initializing Code Standards project...'));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Template: ${options.template}`));

    try {
      const result = await sdk.init({
        projectName,
        template: options.template,
        autoSetupCI: !options.noCi,
        path: options.path,
      });

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        console.log(chalk.gray(`Path: ${result.path}`));
        if (result.files) {
          console.log(chalk.gray(`Files created: ${result.files.length}`));
        }
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red(`❌ Failed to initialize project: ${error.message}`)
      );
      process.exit(1);
    }
  });

// Inspect project command
program
  .command('inspect')
  .description(
    'Inspect code: secrets, vulnerable deps, performance, code + a11y standards'
  )
  .option('-p, --path <path>', 'Project path to inspect', './')
  .option('--fix', 'Automatically fix issues where possible', false)
  .option(
    '-s, --standards <standards>',
    'Comma-separated standards to check',
    'code,security,performance'
  )
  .option('--report', 'Generate inspection report', false)
  .option(
    '-o, --output <file>',
    'Report output file',
    './inspection-report.json'
  )
  .action(async options => {
    console.log(chalk.blue('🔍 Running code inspection...'));

    try {
      const standards = options.standards.split(',').map(s => s.trim());
      const result = await sdk.validate({
        path: options.path,
        standards,
        autoFix: options.fix,
        report: options.report,
        outputPath: options.report ? options.output : null,
      });

      console.log(chalk.yellow('\n📊 Inspection Results:'));
      console.log(`Overall Score: ${result.score}/100`);
      console.log(
        `Status: ${
          result.passed ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')
        }`
      );
      console.log(`Issues Found: ${result.issues.length}`);
      console.log(`Issues Fixed: ${result.fixed.length}`);

      if (result.issues.length > 0) {
        console.log(chalk.red('\n🔴 Issues:'));
        result.issues.slice(0, 5).forEach(issue => {
          console.log(`  ${issue.file}:${issue.line} - ${issue.message}`);
        });
        if (result.issues.length > 5) {
          console.log(`  ... and ${result.issues.length - 5} more`);
        }
      }

      if (options.report) {
        console.log(chalk.gray(`\n📄 Report saved to: ${options.output}`));
      }

      process.exit(result.passed ? 0 : 1);
    } catch (error) {
      console.error(chalk.red(`❌ Inspection failed: ${error.message}`));
      process.exit(1);
    }
  });

// Audit project command
program
  .command('audit')
  .description('Generate comprehensive compliance audit report')
  .option('-p, --path <path>', 'Project path to audit', './')
  .option(
    '-o, --output <file>',
    'Output file for audit report',
    './audit-report.json'
  )
  .option(
    '-f, --format <format>',
    'Report format (json, html, markdown)',
    'json'
  )
  .action(async options => {
    console.log(chalk.blue('📊 Generating audit report...'));

    try {
      const result = await sdk.audit({
        path: options.path,
        output: options.output,
        format: options.format,
      });

      console.log(chalk.yellow('\n📈 Audit Results:'));
      console.log(`Overall Score: ${result.score}/100`);
      console.log(
        `Status: ${
          result.passed ? chalk.green('✅ PASSED') : chalk.red('❌ FAILED')
        }`
      );
      console.log(`Total Issues: ${result.issues.length}`);

      if (result.recommendations.length > 0) {
        console.log(chalk.blue('\n💡 Recommendations:'));
        result.recommendations.forEach(rec => console.log(`  • ${rec}`));
      }

      console.log(chalk.gray(`\n📄 Audit report saved to: ${options.output}`));
    } catch (error) {
      console.error(chalk.red(`❌ Audit failed: ${error.message}`));
      process.exit(1);
    }
  });

// Generate documentation command
program
  .command('docs')
  .description('Generate documentation with diagrams')
  .option('-s, --source <path>', 'Source directory to document', './src')
  .option('-o, --output <path>', 'Output directory for documentation', './docs')
  .option('--diagrams', 'Include Mermaid diagrams', false)
  .option('-f, --format <format>', 'Output format (markdown, html)', 'markdown')
  .action(async options => {
    console.log(chalk.blue('📚 Generating documentation...'));

    try {
      const result = await sdk.generateDocs({
        source: options.source,
        output: options.output,
        includeDiagrams: options.diagrams,
        format: options.format,
      });

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        if (result.files) {
          console.log(chalk.gray(`Files generated: ${result.files.length}`));
        }
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red(`❌ Documentation generation failed: ${error.message}`)
      );
      process.exit(1);
    }
  });

// Error handling for unknown commands
program.on('command:*', () => {
  console.error(
    chalk.red(
      'Invalid command: %s\nSee --help for a list of available commands.'
    ),
    program.args.join(' ')
  );
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
