const fs = require('fs-extra');

class AuditGenerator {
  async generate(auditResult, outputPath, format = 'json') {
    if (format === 'json') {
      await this._generateJsonReport(auditResult, outputPath);
    } else if (format === 'html') {
      await this._generateHtmlReport(auditResult, outputPath);
    } else if (format === 'markdown') {
      await this._generateMarkdownReport(auditResult, outputPath);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  async _generateJsonReport(auditResult, outputPath) {
    await fs.writeFile(outputPath, JSON.stringify(auditResult, null, 2));
  }
  
  async _generateHtmlReport(auditResult, outputPath) {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Code Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .score { font-size: 24px; font-weight: bold; color: ${auditResult.score >= 80 ? 'green' : auditResult.score >= 60 ? 'orange' : 'red'}; }
        .issues { margin-top: 20px; }
        .issue { margin: 10px 0; padding: 10px; border-left: 4px solid #ccc; background: #f9f9f9; }
        .high { border-color: #ff4444; }
        .warning { border-color: #ffaa00; }
        .info { border-color: #4444ff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Code Audit Report</h1>
        <p>Generated: ${auditResult.timestamp}</p>
        <p>Overall Score: <span class="score">${auditResult.score}/100</span></p>
        <p>Status: ${auditResult.passed ? 'PASSED' : 'FAILED'}</p>
    </div>
    
    <div class="issues">
        <h2>Issues Found (${auditResult.issues.length})</h2>
        ${auditResult.issues.map(issue => `
            <div class="issue ${issue.severity}">
                <strong>${issue.type}</strong> - ${issue.file}:${issue.line}<br>
                ${issue.message}
            </div>
        `).join('')}
    </div>
    
    ${auditResult.recommendations ? `
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
            ${auditResult.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
</body>
</html>`;
    
    await fs.writeFile(outputPath, html);
  }
  
  async _generateMarkdownReport(auditResult, outputPath) {
    const markdown = `# Code Audit Report

**Generated:** ${auditResult.timestamp}
**Overall Score:** ${auditResult.score}/100
**Status:** ${auditResult.passed ? 'PASSED' : 'FAILED'}

## Issues Found (${auditResult.issues.length})

${auditResult.issues.map(issue => `
### ${issue.type} - ${issue.file}:${issue.line}

**Severity:** ${issue.severity}
**Message:** ${issue.message}
**Rule:** ${issue.rule}

`).join('')}

${auditResult.recommendations ? `
## Recommendations

${auditResult.recommendations.map(rec => `- ${rec}`).join('\n')}
` : ''}

## Metrics

${Object.entries(auditResult.metrics || {}).map(([key, value]) => {
  if (typeof value === 'object') {
    return `### ${key}\n${Object.entries(value).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
  }
  return `- ${key}: ${value}`;
}).join('\n')}
`;
    
    await fs.writeFile(outputPath, markdown);
  }
}

module.exports = new AuditGenerator();