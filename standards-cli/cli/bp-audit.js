#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');
const CodeValidator = require('../lib/validators/code-validator');
const SecurityValidator = require('../lib/validators/security-validator');
const PerformanceValidator = require('../lib/validators/performance-validator');

const program = new Command();

program
  .version('1.0.0')
  .description('Generate comprehensive compliance audit report')
  .option('-o, --output <path>', 'Output file path', './audit-report.json')
  .option('-f, --format <format>', 'Report format (json, html, markdown)', 'json')
  .option('-p, --path <path>', 'Project path to audit', process.cwd())
  .option('--standards <standards>', 'Comma-separated standards to check', 'code,security,performance')
  .parse(process.argv);

const options = program.opts();

// Main audit function
async function runAudit() {
    console.log(chalk.blue('🔍 Starting compliance audit...'));
    
    const auditResults = {
        timestamp: new Date().toISOString(),
        projectPath: path.resolve(options.path),
        standards: options.standards.split(','),
        overallScore: 0,
        results: {},
        summary: {
            totalIssues: 0,
            criticalIssues: 0,
            warnings: 0,
            passed: false
        }
    };

    try {
        const standards = options.standards.split(',');
        let totalScore = 0;
        let totalIssues = 0;
        let criticalIssues = 0;
        let warnings = 0;

        // Run code quality audit
        if (standards.includes('code')) {
            console.log(chalk.yellow('  📝 Auditing code quality...'));
            const codeValidator = new CodeValidator();
            const codeResults = await codeValidator.validate(options.path);
            
            auditResults.results.code = {
                score: codeResults.score,
                issues: codeResults.issues || [],
                metrics: codeResults.metrics || {},
                status: codeResults.score >= 80 ? 'PASS' : 'FAIL'
            };
            
            totalScore += codeResults.score;
            totalIssues += (codeResults.issues || []).length;
            criticalIssues += (codeResults.issues || []).filter(i => i.severity === 'error').length;
            warnings += (codeResults.issues || []).filter(i => i.severity === 'warning').length;
        }

        // Run security audit
        if (standards.includes('security')) {
            console.log(chalk.yellow('  🔒 Auditing security...'));
            const securityValidator = new SecurityValidator();
            const securityResults = await securityValidator.validate(options.path);
            
            auditResults.results.security = {
                score: securityResults.score,
                issues: securityResults.issues || [],
                vulnerabilities: securityResults.vulnerabilities || [],
                status: securityResults.score >= 90 ? 'PASS' : 'FAIL'
            };
            
            totalScore += securityResults.score;
            totalIssues += (securityResults.issues || []).length;
            criticalIssues += (securityResults.issues || []).filter(i => i.severity === 'error').length;
            warnings += (securityResults.issues || []).filter(i => i.severity === 'warning').length;
        }

        // Run performance audit
        if (standards.includes('performance')) {
            console.log(chalk.yellow('  ⚡ Auditing performance...'));
            const performanceValidator = new PerformanceValidator();
            const performanceResults = await performanceValidator.validate(options.path);
            
            auditResults.results.performance = {
                score: performanceResults.score,
                issues: performanceResults.issues || [],
                metrics: performanceResults.metrics || {},
                status: performanceResults.score >= 75 ? 'PASS' : 'FAIL'
            };
            
            totalScore += performanceResults.score;
            totalIssues += (performanceResults.issues || []).length;
            criticalIssues += (performanceResults.issues || []).filter(i => i.severity === 'error').length;
            warnings += (performanceResults.issues || []).filter(i => i.severity === 'warning').length;
        }

        // Calculate overall results
        auditResults.overallScore = Math.round(totalScore / standards.length);
        auditResults.summary = {
            totalIssues,
            criticalIssues,
            warnings,
            passed: auditResults.overallScore >= 80 && criticalIssues === 0
        };

        // Generate report
        await generateReport(auditResults);

        // Display summary
        displaySummary(auditResults);

    } catch (error) {
        console.error(chalk.red('❌ Audit failed:'), error.message);
        process.exit(1);
    }
}

// Generate audit report in specified format
async function generateReport(results) {
    const outputPath = path.resolve(options.output);
    
    switch (options.format.toLowerCase()) {
        case 'json':
            await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
            break;
            
        case 'html':
            const htmlReport = generateHtmlReport(results);
            await fs.writeFile(outputPath.replace(/\.json$/, '.html'), htmlReport);
            break;
            
        case 'markdown':
            const markdownReport = generateMarkdownReport(results);
            await fs.writeFile(outputPath.replace(/\.json$/, '.md'), markdownReport);
            break;
            
        default:
            throw new Error(`Unsupported format: ${options.format}`);
    }
    
    console.log(chalk.green(`📄 Audit report saved to: ${outputPath}`));
}

// Generate HTML report
function generateHtmlReport(results) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Compliance Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .score { font-size: 2em; font-weight: bold; }
        .pass { color: green; }
        .fail { color: red; }
        .section { margin: 20px 0; padding: 15px; border-left: 4px solid #007cba; }
        .issue { background: #fff3cd; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .critical { border-left: 4px solid #dc3545; }
        .warning { border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Compliance Audit Report</h1>
        <p><strong>Project:</strong> ${results.projectPath}</p>
        <p><strong>Generated:</strong> ${results.timestamp}</p>
        <p class="score ${results.summary.passed ? 'pass' : 'fail'}">
            Overall Score: ${results.overallScore}/100
        </p>
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <ul>
            <li>Total Issues: ${results.summary.totalIssues}</li>
            <li>Critical Issues: ${results.summary.criticalIssues}</li>
            <li>Warnings: ${results.summary.warnings}</li>
            <li>Status: ${results.summary.passed ? 'PASSED' : 'FAILED'}</li>
        </ul>
    </div>
    
    ${Object.entries(results.results).map(([standard, result]) => `
    <div class="section">
        <h2>${standard.charAt(0).toUpperCase() + standard.slice(1)} (${result.score}/100)</h2>
        ${result.issues.map(issue => `
        <div class="issue ${issue.severity}">
            <strong>${issue.type}:</strong> ${issue.message}<br>
            <small>File: ${issue.file}, Line: ${issue.line}</small>
        </div>
        `).join('')}
    </div>
    `).join('')}
</body>
</html>`;
}

// Generate Markdown report
function generateMarkdownReport(results) {
    return `# Compliance Audit Report

**Project:** ${results.projectPath}  
**Generated:** ${results.timestamp}  
**Overall Score:** ${results.overallScore}/100  
**Status:** ${results.summary.passed ? '✅ PASSED' : '❌ FAILED'}

## Summary

- **Total Issues:** ${results.summary.totalIssues}
- **Critical Issues:** ${results.summary.criticalIssues}
- **Warnings:** ${results.summary.warnings}

${Object.entries(results.results).map(([standard, result]) => `
## ${standard.charAt(0).toUpperCase() + standard.slice(1)} (${result.score}/100)

${result.issues.length === 0 ? '✅ No issues found' : result.issues.map(issue => `
### ${issue.severity === 'error' ? '🔴' : '🟡'} ${issue.type}

**Message:** ${issue.message}  
**File:** ${issue.file}  
**Line:** ${issue.line}  
**Rule:** ${issue.rule}
`).join('\n')}
`).join('\n')}

---
*Report generated by Best Practices SDK*`;
}

// Display summary in console
function displaySummary(results) {
    console.log('\n' + chalk.bold('📊 Audit Summary'));
    console.log('─'.repeat(50));
    
    // Overall score
    const scoreColor = results.overallScore >= 80 ? 'green' : 'red';
    console.log(chalk[scoreColor](`Overall Score: ${results.overallScore}/100`));
    
    // Status
    const statusColor = results.summary.passed ? 'green' : 'red';
    const statusText = results.summary.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(chalk[statusColor](statusText));
    
    console.log(`\nTotal Issues: ${results.summary.totalIssues}`);
    console.log(chalk.red(`Critical Issues: ${results.summary.criticalIssues}`));
    console.log(chalk.yellow(`Warnings: ${results.summary.warnings}`));
    
    // Individual standard scores
    console.log('\n' + chalk.bold('Standard Scores:'));
    Object.entries(results.results).forEach(([standard, result]) => {
        const color = result.score >= 80 ? 'green' : result.score >= 60 ? 'yellow' : 'red';
        console.log(chalk[color](`  ${standard}: ${result.score}/100`));
    });
    
    console.log('\n' + chalk.gray(`Report saved to: ${options.output}`));
}

// Run the audit
runAudit().catch(error => {
    console.error(chalk.red('Failed to run audit:'), error);
    process.exit(1);
});