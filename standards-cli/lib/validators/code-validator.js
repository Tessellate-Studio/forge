const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

class CodeValidator {
  constructor(config = {}) {
    this.config = {
      enforceComments: true,
      maxFunctionLines: 50,
      testCoverage: 80,
      ...config
    };
  }

  // Main validation method
  async validate(projectPath, options = {}) {
    const { autoFix = false } = options;
    const results = {
      score: 0,
      issues: [],
      fixed: [],
      metrics: {
        totalFiles: 0,
        commentedFunctions: 0,
        totalFunctions: 0,
        longFunctions: 0,
        testCoverage: 0
      }
    };

    try {
      // Find all JavaScript/TypeScript files
      const files = await this._findCodeFiles(projectPath);
      results.metrics.totalFiles = files.length;

      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const fileResults = await this._validateFile(file, content, autoFix);
        
        // Merge results
        results.issues.push(...fileResults.issues);
        results.fixed.push(...fileResults.fixed);
        results.metrics.totalFunctions += fileResults.metrics.totalFunctions;
        results.metrics.commentedFunctions += fileResults.metrics.commentedFunctions;
        results.metrics.longFunctions += fileResults.metrics.longFunctions;
      }

      // Calculate score based on metrics
      results.score = this._calculateScore(results.metrics);

      return results;
    } catch (error) {
      return {
        score: 0,
        issues: [`Code validation failed: ${error.message}`],
        fixed: [],
        error
      };
    }
  }

  // Find all code files in the project
  async _findCodeFiles(projectPath) {
    const patterns = [
      '**/*.js',
      '**/*.jsx', 
      '**/*.ts',
      '**/*.tsx'
    ];

    // Exclude common directories
    const ignore = [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.git/**'
    ];

    let files = [];
    for (const pattern of patterns) {
      // Use forward slashes for cross-platform compatibility
      const searchPattern = path.join(projectPath, pattern).replace(/\\/g, '/');
      const found = glob.sync(searchPattern, { ignore });
      files.push(...found);
    }

    return files;
  }

  // Validate individual file
  async _validateFile(filePath, content, autoFix) {
    const results = {
      issues: [],
      fixed: [],
      metrics: {
        totalFunctions: 0,
        commentedFunctions: 0,
        longFunctions: 0
      }
    };

    const lines = content.split('\n');
    
    // Find function definitions and their comments
    const functions = this._extractFunctions(content, lines);
    results.metrics.totalFunctions = functions.length;

    for (const func of functions) {
      // Check if function has comment
      const hasComment = this._hasInlineComment(lines, func.startLine);
      if (hasComment) {
        results.metrics.commentedFunctions++;
      } else if (this.config.enforceComments) {
        const issue = {
          file: filePath,
          line: func.startLine + 1,
          type: 'missing-comment',
          severity: 'warning',
          message: `Function '${func.name}' missing in-line comment`,
          rule: 'enforce-comments'
        };

        if (autoFix) {
          // Add comment above function
          const comment = `// ${func.name} - Add description here`;
          lines.splice(func.startLine, 0, comment);
          results.fixed.push({
            ...issue,
            fix: 'Added placeholder comment'
          });
        } else {
          results.issues.push(issue);
        }
      }

      // Check function length
      if (func.lineCount > this.config.maxFunctionLines) {
        results.metrics.longFunctions++;
        results.issues.push({
          file: filePath,
          line: func.startLine + 1,
          type: 'long-function',
          severity: 'warning',
          message: `Function '${func.name}' has ${func.lineCount} lines (max: ${this.config.maxFunctionLines})`,
          rule: 'max-function-lines'
        });
      }
    }

    // Write fixed content back to file if changes were made
    if (autoFix && results.fixed.length > 0) {
      await fs.writeFile(filePath, lines.join('\n'));
    }

    return results;
  }

  // Extract function definitions from code
  _extractFunctions(content, lines) {
    const functions = [];
    
    // Regex patterns for different function types - simpler and more reliable
    const patterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,  // function declarations
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,  // arrow functions
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/,  // function expressions
      /(\w+)\s*:\s*(?:async\s+)?function/,  // object methods
      /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/  // method definitions
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const functionName = match[1];
          const startLine = i;
          const endLine = this._findFunctionEnd(lines, i);
          
          functions.push({
            name: functionName,
            startLine,
            endLine,
            lineCount: endLine - startLine + 1
          });
          break;
        }
      }
    }

    return functions;
  }

  // Find the end of a function by counting braces
  _findFunctionEnd(lines, startLine) {
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            return i;
          }
        }
      }
    }

    return lines.length - 1;
  }

  // Check if function has in-line comment above it
  _hasInlineComment(lines, functionLine) {
    // Check the line above the function
    if (functionLine > 0) {
      const prevLine = lines[functionLine - 1].trim();
      // Look for single-line or multi-line comments
      if (prevLine.startsWith('//') || 
          prevLine.startsWith('/*') || 
          prevLine.endsWith('*/')) {
        return true;
      }
    }

    // Check 2 lines above for multi-line comments
    if (functionLine > 1) {
      const prevLine2 = lines[functionLine - 2].trim();
      if (prevLine2.startsWith('/*') || prevLine2.includes('/**')) {
        return true;
      }
    }

    return false;
  }

  // Calculate overall score based on metrics
  _calculateScore(metrics) {
    if (metrics.totalFunctions === 0) return 100;

    // Score components
    const commentRatio = metrics.commentedFunctions / metrics.totalFunctions;
    const longFunctionPenalty = (metrics.longFunctions / metrics.totalFunctions) * 20;
    
    // Calculate score (0-100)
    let score = (commentRatio * 80) + 20; // Base score from comments
    score -= longFunctionPenalty; // Penalty for long functions
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

module.exports = CodeValidator;