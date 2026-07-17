#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const sdk = require('../lib/index');

// Validate project against best practices standards
module.exports = async function validateProject(options) {
  console.log(chalk.blue('\n🔍 Running Best Practices validation...\n'));

  try {
    // Load configuration from project
    const config = await loadProjectConfig(options.path);
    
    // Run validation using SDK
    const validationOptions = {
      path: options.path,
      standards: options.standards || ['code', 'security', 'performance', 'maintenance'],
      autoFix: options.fix || false
    };

    console.log(chalk.gray(`Validating: ${path.resolve(options.path)}`));
    console.log(chalk.gray(`Standards: ${validationOptions.standards.join(', ')}`));
    if (validationOptions.autoFix) {
      console.log(chalk.yellow('🔧 Auto-fix enabled - issues will be automatically resolved where possible'));
    }
    console.log('');

    const result = await sdk.validate(validationOptions);

    // Display results
    await displayValidationResults(result, options);

    // Generate report if requested
    if (options.report) {
      await generateValidationReport(result, options);
    }

    // Exit with appropriate code
    process.exit(result.passed ? 0 : 1);

  } catch (error) {
    console.error(chalk.red('💥 Validation failed:'), error.message);
    process.exit(1);
  }
};

// Load project configuration from .bp-config.yml or package.json
async function loadProjectConfig(projectPath) {
  const configPaths = [
    path.join(projectPath, '.bp-config.yml'),
    path.join(projectPath, '.bp-config.yaml'),
    path.join(projectPath, '.bp-config.json'),
    path.join(projectPath, 'package.json')
  ];

  for (const configPath of configPaths) {
    if (await fs.pathExists(configPath)) {
      try {
        if (configPath.endsWith('.json')) {
          const content = await fs.readJson(configPath);
          // Extract BP config from package.json if it exists
          return content.bestPractices || content.bp || {};
        } else if (configPath.includes('.yml') || configPath.includes('.yaml')) {
          const yaml = require('yaml');
          const content = await fs.readFile(configPath, 'utf8');
          return yaml.parse(content) || {};
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Could not parse config file: ${configPath}`));
      }
    }
  }

  // Return default configuration
  return {
    code: { enforceComments: true, maxFunctionLines: 50, testCoverage: 80 },
    security: { scanSecrets: true, vulnerabilityScan: true },
    performance: { bundleSize: '500KB', loadTime: '2s' },
    maintenance: { dependencies: { required: true }, sdkMap: { required: true } }
  };
}

// Display validation results in a user-friendly format
async function displayValidationResults(result, options) {
  // Overall status
  if (result.passed) {
    console.log(chalk.green('✅ All validations passed!'));
  } else {
    console.log(chalk.red('❌ Validation issues found'));
  }

  // Display scores
  if (result.scores) {
    console.log(chalk.blue('\n📊 Scores:'));
    for (const [standard, score] of Object.entries(result.scores)) {
      const color = score >= 90 ? 'green' : score >= 70 ? 'yellow' : 'red';
      console.log(`  ${standard.charAt(0).toUpperCase() + standard.slice(1)}: ${chalk[color](score + '/100')}`);
    }
    
    if (result.overallScore !== undefined) {
      const overallColor = result.overallScore >= 90 ? 'green' : result.overallScore >= 70 ? 'yellow' : 'red';
      console.log(`  ${chalk.bold('Overall')}: ${chalk[overallColor](Math.round(result.overallScore) + '/100')}`);
    }
  }

  // Display fixed issues
  if (result.fixed && result.fixed.length > 0) {
    console.log(chalk.green(`\n🔧 Auto-fixed ${result.fixed.length} issue(s):`));
    for (const fix of result.fixed) {
      console.log(`  ✓ ${fix.file}:${fix.line} - ${fix.fix}`);
    }
  }

  // Display issues by severity
  if (result.issues && result.issues.length > 0) {
    const issuesBySeverity = groupIssuesBySeverity(result.issues);
    
    for (const [severity, issues] of Object.entries(issuesBySeverity)) {
      if (issues.length === 0) continue;
      
      const severityColor = getSeverityColor(severity);
      const icon = getSeverityIcon(severity);
      
      console.log(chalk[severityColor](`\n${icon} ${severity.toUpperCase()} (${issues.length})`));
      
      for (const issue of issues.slice(0, 10)) { // Show first 10 issues
        const location = issue.file && issue.line ? `${issue.file}:${issue.line}` : issue.file || '';
        console.log(`  ${chalk.gray(location)} - ${issue.message}`);
      }
      
      if (issues.length > 10) {
        console.log(chalk.gray(`  ... and ${issues.length - 10} more ${severity} issues`));
      }
    }
  }

  // Display metrics if available
  if (result.metrics) {
    console.log(chalk.blue('\n📈 Metrics:'));
    displayMetrics(result.metrics);
  }

  // Display summary
  console.log(chalk.blue('\n📋 Summary:'));
  console.log(`  Files scanned: ${result.metrics?.totalFiles || result.metrics?.filesScanned || 'N/A'}`);
  console.log(`  Issues found: ${result.issues?.length || 0}`);
  console.log(`  Issues fixed: ${result.fixed?.length || 0}`);
  
  if (!result.passed) {
    console.log(chalk.yellow('\n💡 Tips:'));
    console.log('  • Run with --fix to automatically resolve some issues');
    console.log('  • Use --report to generate a detailed validation report');
    console.log('  • Check the documentation for coding standards');
  }
}

// Group issues by severity level
function groupIssuesBySeverity(issues) {
  return issues.reduce((groups, issue) => {
    const severity = issue.severity || 'info';
    if (!groups[severity]) groups[severity] = [];
    groups[severity].push(issue);
    return groups;
  }, {});
}

// Get color for severity level
function getSeverityColor(severity) {
  const colors = {
    critical: 'red',
    high: 'red',
    medium: 'yellow',
    warning: 'yellow',
    low: 'blue',
    info: 'blue'
  };
  return colors[severity] || 'gray';
}

// Get icon for severity level
function getSeverityIcon(severity) {
  const icons = {
    critical: '🚨',
    high: '❌',
    medium: '⚠️',
    warning: '⚠️',
    low: '💡',
    info: 'ℹ️'
  };
  return icons[severity] || '•';
}

// Display metrics in a formatted way
function displayMetrics(metrics) {
  if (metrics.totalFunctions !== undefined) {
    const commentRatio = metrics.totalFunctions > 0 
      ? Math.round((metrics.commentedFunctions / metrics.totalFunctions) * 100)
      : 100;
    console.log(`  Functions with comments: ${metrics.commentedFunctions}/${metrics.totalFunctions} (${commentRatio}%)`);
  }
  
  if (metrics.bundleSize !== undefined) {
    const bundleSizeKB = Math.round(metrics.bundleSize / 1024);
    console.log(`  Bundle size: ${bundleSizeKB}KB`);
  }
  
  if (metrics.secretsFound !== undefined) {
    console.log(`  Secrets detected: ${metrics.secretsFound}`);
  }
  
  if (metrics.vulnerabilities !== undefined) {
    console.log(`  Vulnerabilities: ${metrics.vulnerabilities}`);
  }
  
  if (metrics.largeFiles && metrics.largeFiles.length > 0) {
    console.log(`  Large files: ${metrics.largeFiles.length}`);
  }
}

// Generate detailed validation report
async function generateValidationReport(result, options) {
  const reportPath = options.output || 'validation-report.json';
  
  const report = {
    timestamp: new Date().toISOString(),
    projectPath: path.resolve(options.path),
    standards: options.standards || ['code', 'security', 'performance'],
    passed: result.passed,
    overallScore: result.overallScore,
    scores: result.scores,
    metrics: result.metrics,
    issues: result.issues,
    fixed: result.fixed,
    summary: {
      totalIssues: result.issues?.length || 0,
      totalFixed: result.fixed?.length || 0,
      issuesBySeverity: groupIssuesBySeverity(result.issues || [])
    }
  };

  try {
    await fs.writeJson(reportPath, report, { spaces: 2 });
    console.log(chalk.green(`\n📄 Validation report saved: ${reportPath}`));
  } catch (error) {
    console.error(chalk.red('Failed to save validation report:'), error.message);
  }
}