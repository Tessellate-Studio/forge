const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');

class PerformanceValidator {
  constructor(config = {}) {
    this.config = {
      bundleSize: '500KB',
      loadTime: '2s',
      apiResponseTime: '500ms',
      ...config
    };

    // Convert config values to bytes/milliseconds
    this.limits = {
      bundleSize: this._parseSize(this.config.bundleSize),
      loadTime: this._parseTime(this.config.loadTime),
      apiResponseTime: this._parseTime(this.config.apiResponseTime)
    };
  }

  // Main validation method
  async validate(projectPath, options = {}) {
    const results = {
      score: 100,
      issues: [],
      fixed: [],
      metrics: {
        bundleSize: 0,
        totalFiles: 0,
        largeFiles: [],
        unusedDependencies: [],
        performanceIssues: 0
      }
    };

    try {
      // Check bundle size
      const bundleResults = await this._checkBundleSize(projectPath);
      results.issues.push(...bundleResults.issues);
      results.metrics.bundleSize = bundleResults.bundleSize;
      results.metrics.totalFiles = bundleResults.totalFiles;
      results.metrics.largeFiles = bundleResults.largeFiles;

      // Check for unused dependencies
      const depResults = await this._checkUnusedDependencies(projectPath);
      results.issues.push(...depResults.issues);
      results.metrics.unusedDependencies = depResults.unused;

      // Check for performance anti-patterns in code
      const codeResults = await this._checkCodePerformance(projectPath);
      results.issues.push(...codeResults.issues);
      results.metrics.performanceIssues = codeResults.issues.length;

      // Calculate performance score
      results.score = this._calculatePerformanceScore(results.metrics);

      return results;
    } catch (error) {
      return {
        score: 0,
        issues: [`Performance validation failed: ${error.message}`],
        fixed: [],
        error
      };
    }
  }

  // Check bundle size and individual file sizes
  async _checkBundleSize(projectPath) {
    const results = {
      issues: [],
      bundleSize: 0,
      totalFiles: 0,
      largeFiles: []
    };

    // Find all JavaScript/TypeScript files
    const files = await this._findBundleFiles(projectPath);
    results.totalFiles = files.length;

    let totalSize = 0;

    for (const file of files) {
      const stats = await fs.stat(file);
      const fileSize = stats.size;
      totalSize += fileSize;

      // Check individual file size (warn if > 100KB)
      if (fileSize > 100000) {
        const fileSizeKB = Math.round(fileSize / 1024);
        results.largeFiles.push({
          file: path.relative(projectPath, file),
          size: fileSizeKB
        });

        results.issues.push({
          file: path.relative(projectPath, file),
          line: 1,
          type: 'large-file',
          severity: 'warning',
          message: `Large file detected: ${fileSizeKB}KB (consider splitting or optimizing)`,
          rule: 'max-file-size'
        });
      }
    }

    results.bundleSize = totalSize;

    // Check total bundle size
    if (totalSize > this.limits.bundleSize) {
      const bundleSizeKB = Math.round(totalSize / 1024);
      const limitKB = Math.round(this.limits.bundleSize / 1024);

      results.issues.push({
        file: 'package.json',
        line: 1,
        type: 'bundle-size',
        severity: 'high',
        message: `Bundle size ${bundleSizeKB}KB exceeds limit of ${limitKB}KB`,
        rule: 'max-bundle-size'
      });
    }

    return results;
  }

  // Check for unused dependencies
  async _checkUnusedDependencies(projectPath) {
    const results = {
      issues: [],
      unused: []
    };

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!(await fs.pathExists(packageJsonPath))) {
      return results;
    }

    try {
      const packageJson = await fs.readJson(packageJsonPath);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Find all code files to check for imports
      const files = await this._findBundleFiles(projectPath);
      const usedDependencies = new Set();

      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        
        // Find require/import statements
        const importMatches = content.match(/(?:require\(['"`]([^'"`]+)['"`]\)|import.*?from\s+['"`]([^'"`]+)['"`])/g);
        
        if (importMatches) {
          for (const match of importMatches) {
            const depMatch = match.match(/['"`]([^'"`]+)['"`]/);
            if (depMatch) {
              const depName = depMatch[1];
              // Handle scoped packages and relative imports
              if (!depName.startsWith('.') && !depName.startsWith('/')) {
                const rootDep = depName.split('/')[0];
                if (rootDep.startsWith('@')) {
                  usedDependencies.add(`${rootDep}/${depName.split('/')[1]}`);
                } else {
                  usedDependencies.add(rootDep);
                }
              }
            }
          }
        }
      }

      // Find unused dependencies
      for (const [depName] of Object.entries(dependencies)) {
        if (!usedDependencies.has(depName)) {
          results.unused.push(depName);
          results.issues.push({
            file: 'package.json',
            line: 1,
            type: 'unused-dependency',
            severity: 'warning',
            message: `Unused dependency detected: ${depName}`,
            rule: 'no-unused-dependencies'
          });
        }
      }

    } catch (error) {
      // Ignore errors in dependency checking
    }

    return results;
  }

  // Check for performance anti-patterns in code
  async _checkCodePerformance(projectPath) {
    const results = {
      issues: []
    };

    const files = await this._findBundleFiles(projectPath);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // Check for performance anti-patterns
        const issues = this._checkLineForPerformanceIssues(line, file, lineNumber);
        results.issues.push(...issues);
        
        // Check for nested loops by looking ahead
        if (line.includes('for (')) {
          const nestedLoopIssue = this._checkNestedLoop(lines, i, file);
          if (nestedLoopIssue) {
            results.issues.push(nestedLoopIssue);
          }
        }
      }
    }

    return results;
  }

  // Check individual line for performance issues
  _checkLineForPerformanceIssues(line, filePath, lineNumber) {
    const issues = [];

    // Performance anti-patterns to detect
    const patterns = [
      {
        pattern: /console\.log\(/,
        message: 'console.log() statements can impact performance in production',
        severity: 'warning',
        type: 'console-log'
      },
      {
        pattern: /document\.getElementById\(.+\).*\.getElementById/,
        message: 'Multiple DOM queries should be cached',
        severity: 'warning',
        type: 'dom-query'
      },
      {
        pattern: /\.forEach\(.+\.forEach/,
        message: 'Nested forEach can be performance-intensive',
        severity: 'info',
        type: 'nested-foreach'
      },
      {
        pattern: /JSON\.parse\(JSON\.stringify\(/,
        message: 'Deep cloning with JSON is inefficient for large objects',
        severity: 'warning',
        type: 'inefficient-clone'
      }
    ];

    for (const antiPattern of patterns) {
      if (antiPattern.pattern.test(line)) {
        issues.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNumber,
          type: antiPattern.type,
          severity: antiPattern.severity,
          message: antiPattern.message,
          rule: 'performance-optimization'
        });
      }
    }

    return issues;
  }

  // Check for nested loops by looking ahead in the code
  _checkNestedLoop(lines, startLineIndex, filePath) {
    let braceCount = 0;
    let foundOpenBrace = false;
    
    // Look for the opening brace of the first for loop
    for (let i = startLineIndex; i < Math.min(lines.length, startLineIndex + 10); i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            // End of first loop, stop checking
            return null;
          }
        }
      }
      
      // If we're inside the first loop and find another for loop
      if (foundOpenBrace && braceCount > 0 && line.trim().includes('for (')) {
        return {
          file: path.relative(process.cwd(), filePath),
          line: i + 1,
          type: 'nested-loop',
          severity: 'info',
          message: 'Nested loops can cause performance issues with large datasets',
          rule: 'performance-optimization'
        };
      }
    }
    
    return null;
  }

  // Find files that contribute to bundle size
  async _findBundleFiles(projectPath) {
    const patterns = [
      '**/*.js',
      '**/*.jsx',
      '**/*.ts',
      '**/*.tsx',
      '**/*.css',
      '**/*.scss',
      '**/*.sass'
    ];

    const ignore = [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.git/**'
      // Don't ignore test files here - we want to scan all files for bundle size
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

  // Parse size string (e.g., "500KB") to bytes
  _parseSize(sizeStr) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match) return 500000; // Default 500KB

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    return Math.round(value * (units[unit] || 1));
  }

  // Parse time string (e.g., "2s") to milliseconds
  _parseTime(timeStr) {
    const units = {
      'ms': 1,
      's': 1000,
      'm': 60000
    };

    const match = timeStr.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)$/i);
    if (!match) return 2000; // Default 2 seconds

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    return Math.round(value * (units[unit] || 1));
  }

  // Calculate performance score
  _calculatePerformanceScore(metrics) {
    let score = 100;

    // Deduct points for bundle size issues
    if (metrics.bundleSize > this.limits.bundleSize) {
      const overageRatio = metrics.bundleSize / this.limits.bundleSize;
      score -= Math.min(30, (overageRatio - 1) * 20);
    }

    // Deduct points for large files
    score -= Math.min(20, metrics.largeFiles.length * 5);

    // Deduct points for unused dependencies
    score -= Math.min(15, metrics.unusedDependencies.length * 2);

    // Deduct points for performance issues
    score -= Math.min(25, metrics.performanceIssues * 2);

    return Math.max(0, Math.round(score));
  }
}

module.exports = PerformanceValidator;