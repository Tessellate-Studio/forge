const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

class ClaudeIntegration {
  constructor(config = {}) {
    this.config = {
      autoReview: true,
      reviewComments: true,
      ...config.claude
    };
  }

  // Setup Claude integration for GitHub repository
  async setupIntegration(projectPath) {
    try {
      // Create .claude.json configuration
      const claudeConfig = {
        "name": path.basename(projectPath),
        "description": "Best Practices SDK managed project",
        "auto_review": this.config.autoReview,
        "review_triggers": [
          "pull_request",
          "push"
        ],
        "standards": {
          "enforce_comments": true,
          "max_function_lines": 50,
          "security_scan": true,
          "performance_check": true
        }
      };

      const configPath = path.join(projectPath, '.claude.json');
      await fs.writeJson(configPath, claudeConfig, { spaces: 2 });

      console.log('✅ Claude configuration created');
      return {
        success: true,
        message: 'Claude integration configured successfully',
        configPath
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to setup Claude integration: ${error.message}`,
        error
      };
    }
  }

  // Request Claude code review via GitHub API
  async requestReview(prNumber, repositoryPath) {
    try {
      const cwd = repositoryPath || process.cwd();
      
      // Use GitHub CLI to request Claude review
      const reviewMessage = `@claude-code Please review this PR for:

🔍 **Code Quality Checks:**
- In-line comments for all functions
- Function length (max 50 lines)
- Error handling patterns
- Code readability and maintainability

🔒 **Security Review:**
- No hardcoded secrets or API keys
- Secure dependency usage
- Input validation and sanitization

⚡ **Performance Analysis:**
- Bundle size impact
- Potential performance bottlenecks
- Efficient algorithms and patterns

📋 **Best Practices Compliance:**
- Follows established coding standards
- Proper testing coverage
- Documentation quality

Please provide feedback and approve if all standards are met.`;

      // Comment on the PR with review request
      execSync(`gh pr comment ${prNumber} --body "${reviewMessage}"`, {
        cwd,
        encoding: 'utf8'
      });

      console.log(`✅ Claude review requested for PR #${prNumber}`);
      
      return {
        success: true,
        message: `Review requested for PR #${prNumber}`,
        prNumber
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to request Claude review: ${error.message}`,
        error
      };
    }
  }

  // Generate automated code suggestions
  async generateSuggestions(filePath, issues) {
    const suggestions = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'missing-comment':
          suggestions.push({
            line: issue.line,
            suggestion: `// Add descriptive comment for ${issue.functionName || 'this function'}`,
            type: 'add-comment',
            priority: 'medium'
          });
          break;

        case 'long-function':
          suggestions.push({
            line: issue.line,
            suggestion: 'Consider breaking this function into smaller, more focused functions',
            type: 'refactor-function',
            priority: 'high'
          });
          break;

        case 'hardcoded-secret':
          suggestions.push({
            line: issue.line,
            suggestion: 'Move this sensitive data to environment variables or secure configuration',
            type: 'security-fix',
            priority: 'critical'
          });
          break;

        case 'performance-issue':
          suggestions.push({
            line: issue.line,
            suggestion: this._getPerformanceSuggestion(issue),
            type: 'performance-optimization',
            priority: 'medium'
          });
          break;

        default:
          suggestions.push({
            line: issue.line,
            suggestion: `Address ${issue.type}: ${issue.message}`,
            type: 'general',
            priority: 'low'
          });
      }
    }

    return suggestions;
  }

  // Create automated PR comment with suggestions
  async createReviewComment(prNumber, suggestions, repositoryPath) {
    try {
      if (suggestions.length === 0) {
        const approvalComment = `## 🤖 Claude Code Review - ✅ APPROVED

**Code Quality:** Excellent ✅  
**Security:** No issues found ✅  
**Performance:** Optimized ✅  
**Best Practices:** Compliant ✅

This code meets all Best Practices SDK standards. Ready for merge! 🚀`;

        execSync(`gh pr comment ${prNumber} --body "${approvalComment}"`, {
          cwd: repositoryPath || process.cwd(),
          encoding: 'utf8'
        });

        return { success: true, approved: true };
      }

      // Group suggestions by priority
      const critical = suggestions.filter(s => s.priority === 'critical');
      const high = suggestions.filter(s => s.priority === 'high');
      const medium = suggestions.filter(s => s.priority === 'medium');
      const low = suggestions.filter(s => s.priority === 'low');

      let comment = `## 🤖 Claude Code Review - Suggestions\n\n`;

      if (critical.length > 0) {
        comment += `### 🚨 Critical Issues (Must Fix)\n`;
        for (const issue of critical) {
          comment += `- **Line ${issue.line}:** ${issue.suggestion}\n`;
        }
        comment += `\n`;
      }

      if (high.length > 0) {
        comment += `### ⚠️ High Priority Issues\n`;
        for (const issue of high) {
          comment += `- **Line ${issue.line}:** ${issue.suggestion}\n`;
        }
        comment += `\n`;
      }

      if (medium.length > 0) {
        comment += `### 💡 Medium Priority Suggestions\n`;
        for (const issue of medium) {
          comment += `- **Line ${issue.line}:** ${issue.suggestion}\n`;
        }
        comment += `\n`;
      }

      if (low.length > 0) {
        comment += `### 📝 Low Priority Improvements\n`;
        for (const issue of low) {
          comment += `- **Line ${issue.line}:** ${issue.suggestion}\n`;
        }
        comment += `\n`;
      }

      comment += `---\n*Automated review by Best Practices SDK Claude Integration*`;

      execSync(`gh pr comment ${prNumber} --body "${comment}"`, {
        cwd: repositoryPath || process.cwd(),
        encoding: 'utf8'
      });

      return { 
        success: true, 
        approved: critical.length === 0 && high.length === 0,
        suggestions: suggestions.length 
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to create review comment: ${error.message}`,
        error
      };
    }
  }

  // Generate performance-specific suggestions
  _getPerformanceSuggestion(issue) {
    const suggestions = {
      'console-log': 'Remove console.log statements before production deployment',
      'dom-query': 'Cache DOM queries in variables to avoid repeated lookups',
      'nested-loop': 'Consider using more efficient algorithms or data structures',
      'nested-foreach': 'Use map/reduce or flatten the data structure first',
      'inefficient-clone': 'Use structured cloning or a dedicated library like lodash'
    };

    return suggestions[issue.subtype] || 'Consider optimizing this code pattern for better performance';
  }

  // Check if Claude is available and configured
  async checkIntegration() {
    try {
      // Check if GitHub CLI is available
      execSync('gh --version', { encoding: 'utf8' });
      
      // Check if user is authenticated
      const authStatus = execSync('gh auth status', { encoding: 'utf8' });
      
      return {
        available: true,
        authenticated: authStatus.includes('Logged in'),
        message: 'Claude integration ready'
      };

    } catch (error) {
      return {
        available: false,
        authenticated: false,
        message: 'GitHub CLI not available or not authenticated',
        error: error.message
      };
    }
  }
}

module.exports = ClaudeIntegration;