// Report generation for Rubric SDK evaluations
const fs = require('fs-extra');
const path = require('path');
const { Parser } = require('json2csv');

class ReportGenerator {
  constructor() {
    this.supportedFormats = ['json', 'markdown', 'csv', 'html'];
  }

  // Generate report in specified format
  async generate(data, format = 'json', options = {}) {
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported format: ${format}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }
    
    const methodName = `generate${format.charAt(0).toUpperCase() + format.slice(1)}`;
    return await this[methodName](data, options);
  }

  // Generate JSON format report
  async generateJson(data, options = {}) {
    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        generator: 'Rubric SDK Report Generator',
        version: '1.0.0',
        format: 'json'
      },
      summary: this.generateSummary(data),
      data: Array.isArray(data) ? data : [data]
    };
    
    if (options.outputPath) {
      await fs.writeJson(options.outputPath, report, { spaces: 2 });
      return { success: true, path: options.outputPath };
    }
    
    return JSON.stringify(report, null, 2);
  }

  // Generate Markdown format report
  async generateMarkdown(data, options = {}) {
    const evaluations = Array.isArray(data) ? data : [data];
    const summary = this.generateSummary(evaluations);
    
    let markdown = `# Rubric Evaluation Report\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**Total Tasks:** ${summary.totalTasks}\n\n`;
    
    // Summary section
    markdown += `## Summary\n\n`;
    markdown += `| Priority | Count | Percentage |\n`;
    markdown += `|----------|-------|------------|\n`;
    markdown += `| High | ${summary.priorityDistribution.high} | ${((summary.priorityDistribution.high / summary.totalTasks) * 100).toFixed(1)}% |\n`;
    markdown += `| Medium | ${summary.priorityDistribution.medium} | ${((summary.priorityDistribution.medium / summary.totalTasks) * 100).toFixed(1)}% |\n`;
    markdown += `| Low | ${summary.priorityDistribution.low} | ${((summary.priorityDistribution.low / summary.totalTasks) * 100).toFixed(1)}% |\n`;
    markdown += `| Backlog | ${summary.priorityDistribution.backlog} | ${((summary.priorityDistribution.backlog / summary.totalTasks) * 100).toFixed(1)}% |\n\n`;
    
    // Detailed evaluations
    markdown += `## Detailed Evaluations\n\n`;
    
    evaluations.forEach((evaluation, index) => {
      markdown += `### ${index + 1}. ${evaluation.task}\n\n`;
      markdown += `**Priority:** ${evaluation.priority.toUpperCase()} (Score: ${evaluation.weightedScore})\n\n`;
      
      // Individual scores
      markdown += `**Scores:**\n`;
      markdown += `- Impact: ${evaluation.scores.impact}/5\n`;
      markdown += `- Complexity: ${evaluation.scores.complexity}/5\n`;
      markdown += `- Reusability: ${evaluation.scores.reusability}/5\n`;
      markdown += `- Strategic Fit: ${evaluation.scores.strategic}/5\n\n`;
      
      // Recommendations
      if (evaluation.recommendations && evaluation.recommendations.length > 0) {
        markdown += `**Recommendations:**\n`;
        evaluation.recommendations.forEach(rec => {
          markdown += `- ${rec}\n`;
        });
        markdown += `\n`;
      }
      
      // Metadata
      if (evaluation.metadata) {
        markdown += `**Metadata:**\n`;
        if (evaluation.metadata.evaluator) markdown += `- Evaluator: ${evaluation.metadata.evaluator}\n`;
        if (evaluation.metadata.notes) markdown += `- Notes: ${evaluation.metadata.notes}\n`;
        if (evaluation.rank) markdown += `- Rank: ${evaluation.rank}\n`;
        markdown += `\n`;
      }
      
      markdown += `---\n\n`;
    });
    
    if (options.outputPath) {
      await fs.writeFile(options.outputPath, markdown, 'utf8');
      return { success: true, path: options.outputPath };
    }
    
    return markdown;
  }

  // Generate CSV format report
  async generateCsv(data, options = {}) {
    const evaluations = Array.isArray(data) ? data : [data];
    
    // Flatten data for CSV format
    const csvData = evaluations.map(evaluation => ({
      task: evaluation.task,
      priority: evaluation.priority,
      weightedScore: evaluation.weightedScore,
      impactScore: evaluation.scores.impact,
      complexityScore: evaluation.scores.complexity,
      reusabilityScore: evaluation.scores.reusability,
      strategicScore: evaluation.scores.strategic,
      impactWeight: evaluation.weights.impact,
      complexityWeight: evaluation.weights.complexity,
      reusabilityWeight: evaluation.weights.reusability,
      strategicWeight: evaluation.weights.strategic,
      rank: evaluation.rank || null,
      evaluator: evaluation.metadata?.evaluator || null,
      notes: evaluation.metadata?.notes || null,
      timestamp: evaluation.timestamp
    }));
    
    const fields = [
      'task', 'priority', 'weightedScore', 'rank',
      'impactScore', 'complexityScore', 'reusabilityScore', 'strategicScore',
      'impactWeight', 'complexityWeight', 'reusabilityWeight', 'strategicWeight',
      'evaluator', 'notes', 'timestamp'
    ];
    
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);
    
    if (options.outputPath) {
      await fs.writeFile(options.outputPath, csv, 'utf8');
      return { success: true, path: options.outputPath };
    }
    
    return csv;
  }

  // Generate HTML format report
  async generateHtml(data, options = {}) {
    const evaluations = Array.isArray(data) ? data : [data];
    const summary = this.generateSummary(evaluations);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rubric Evaluation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        .summary { background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .task-card { border: 1px solid #ddd; border-radius: 5px; padding: 20px; margin: 20px 0; background: white; }
        .priority-high { border-left: 5px solid #f44336; }
        .priority-medium { border-left: 5px solid #ff9800; }
        .priority-low { border-left: 5px solid #2196f3; }
        .priority-backlog { border-left: 5px solid #9e9e9e; }
        .scores-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 15px 0; }
        .score-item { text-align: center; padding: 10px; background-color: #f0f0f0; border-radius: 3px; }
        .recommendations { background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .metadata { font-size: 0.9em; color: #666; margin-top: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Rubric Evaluation Report</h1>
        <div class="summary">
            <h2>Summary</h2>
            <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
            <p><strong>Total Tasks:</strong> ${summary.totalTasks}</p>
            <table>
                <tr><th>Priority</th><th>Count</th><th>Percentage</th></tr>
                <tr><td>High</td><td>${summary.priorityDistribution.high}</td><td>${((summary.priorityDistribution.high / summary.totalTasks) * 100).toFixed(1)}%</td></tr>
                <tr><td>Medium</td><td>${summary.priorityDistribution.medium}</td><td>${((summary.priorityDistribution.medium / summary.totalTasks) * 100).toFixed(1)}%</td></tr>
                <tr><td>Low</td><td>${summary.priorityDistribution.low}</td><td>${((summary.priorityDistribution.low / summary.totalTasks) * 100).toFixed(1)}%</td></tr>
                <tr><td>Backlog</td><td>${summary.priorityDistribution.backlog}</td><td>${((summary.priorityDistribution.backlog / summary.totalTasks) * 100).toFixed(1)}%</td></tr>
            </table>
        </div>
        
        <h2>Detailed Evaluations</h2>`;
    
    evaluations.forEach((evaluation, index) => {
      const priorityClass = `priority-${evaluation.priority}`;
      html += `
        <div class="task-card ${priorityClass}">
            <h3>${index + 1}. ${evaluation.task}</h3>
            <p><strong>Priority:</strong> ${evaluation.priority.toUpperCase()} (Score: ${evaluation.weightedScore})</p>
            
            <div class="scores-grid">
                <div class="score-item">
                    <strong>Impact</strong><br>${evaluation.scores.impact}/5
                </div>
                <div class="score-item">
                    <strong>Complexity</strong><br>${evaluation.scores.complexity}/5
                </div>
                <div class="score-item">
                    <strong>Reusability</strong><br>${evaluation.scores.reusability}/5
                </div>
                <div class="score-item">
                    <strong>Strategic</strong><br>${evaluation.scores.strategic}/5
                </div>
            </div>`;
      
      if (evaluation.recommendations && evaluation.recommendations.length > 0) {
        html += `
            <div class="recommendations">
                <strong>Recommendations:</strong>
                <ul>`;
        evaluation.recommendations.forEach(rec => {
          html += `<li>${rec}</li>`;
        });
        html += `</ul></div>`;
      }
      
      if (evaluation.metadata) {
        html += `<div class="metadata">`;
        if (evaluation.metadata.evaluator) html += `<strong>Evaluator:</strong> ${evaluation.metadata.evaluator} | `;
        if (evaluation.rank) html += `<strong>Rank:</strong> ${evaluation.rank} | `;
        if (evaluation.metadata.notes) html += `<strong>Notes:</strong> ${evaluation.metadata.notes}`;
        html += `</div>`;
      }
      
      html += `</div>`;
    });
    
    html += `
    </div>
</body>
</html>`;
    
    if (options.outputPath) {
      await fs.writeFile(options.outputPath, html, 'utf8');
      return { success: true, path: options.outputPath };
    }
    
    return html;
  }

  // Generate summary statistics from evaluation data
  generateSummary(evaluations) {
    const data = Array.isArray(evaluations) ? evaluations : [evaluations];
    
    const priorityDistribution = {
      high: data.filter(e => e.priority === 'high').length,
      medium: data.filter(e => e.priority === 'medium').length,
      low: data.filter(e => e.priority === 'low').length,
      backlog: data.filter(e => e.priority === 'backlog').length
    };
    
    const scores = data.map(e => e.weightedScore);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    return {
      totalTasks: data.length,
      priorityDistribution,
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores)
    };
  }

  // Save report to file
  async saveReport(content, outputPath, format) {
    try {
      await fs.ensureDir(path.dirname(outputPath));
      
      if (typeof content === 'object') {
        await fs.writeJson(outputPath, content, { spaces: 2 });
      } else {
        await fs.writeFile(outputPath, content, 'utf8');
      }
      
      return {
        success: true,
        path: outputPath,
        format,
        size: (await fs.stat(outputPath)).size
      };
    } catch (error) {
      throw new Error(`Failed to save report: ${error.message}`);
    }
  }
}

module.exports = ReportGenerator;