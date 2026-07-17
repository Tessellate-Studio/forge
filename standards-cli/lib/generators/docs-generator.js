const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

class DocsGenerator {
  async generate(options) {
    const { source, output, includeDiagrams, format, config } = options;
    
    await fs.ensureDir(output);
    
    const files = [];
    
    // Find all code files in source directory
    const sourceFiles = this._findSourceFiles(source);
    
    // Generate main API documentation
    const apiDocsPath = path.join(output, 'API.md');
    const apiDocs = await this._generateApiDocs(sourceFiles, source);
    await fs.writeFile(apiDocsPath, apiDocs);
    files.push('API.md');
    
    // Generate index documentation
    const indexPath = path.join(output, 'index.md');
    const indexDocs = this._generateIndexDocs();
    await fs.writeFile(indexPath, indexDocs);
    files.push('index.md');
    
    // Generate architecture documentation if requested
    if (includeDiagrams) {
      const archPath = path.join(output, 'Architecture.md');
      const archDocs = await this._generateArchitectureDocs(sourceFiles, source);
      await fs.writeFile(archPath, archDocs);
      files.push('Architecture.md');
    }
    
    return { files };
  }
  
  _findSourceFiles(sourceDir) {
    const patterns = [
      '**/*.js',
      '**/*.jsx',
      '**/*.ts',
      '**/*.tsx'
    ];
    
    const ignore = [
      'node_modules/**',
      'dist/**',
      'build/**',
      '**/*.test.*',
      '**/*.spec.*'
    ];
    
    let files = [];
    for (const pattern of patterns) {
      const found = glob.sync(path.join(sourceDir, pattern), { ignore });
      files.push(...found);
    }
    
    return files;
  }
  
  async _generateApiDocs(sourceFiles, sourceDir) {
    let docs = `# API Documentation

This documentation was automatically generated from source code.

## Functions

`;
    
    for (const file of sourceFiles) {
      const content = await fs.readFile(file, 'utf8');
      const functions = this._extractFunctions(content);
      const relativePath = path.relative(sourceDir, file);
      
      if (functions.length > 0) {
        docs += `### ${relativePath}\n\n`;
        
        for (const func of functions) {
          docs += `#### ${func.name}\n\n`;
          if (func.comment) {
            docs += `${func.comment}\n\n`;
          }
          docs += `\`\`\`javascript\n${func.signature}\n\`\`\`\n\n`;
        }
      }
    }
    
    return docs;
  }
  
  _extractFunctions(content) {
    const functions = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for function declarations
      const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/);
      if (funcMatch) {
        const functionName = funcMatch[1];
        
        // Look for comment above function
        let comment = '';
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (prevLine.startsWith('//')) {
            comment = prevLine.replace('//', '').trim();
          }
        }
        
        functions.push({
          name: functionName,
          signature: line,
          comment: comment
        });
      }
    }
    
    return functions;
  }
  
  _generateIndexDocs() {
    return `# Documentation Index

Welcome to the project documentation.

## Available Documentation

- [API Documentation](./API.md) - Detailed API reference
- [Architecture](./Architecture.md) - System architecture overview

## Getting Started

This documentation is automatically generated and kept in sync with the codebase.

## Contributing

When adding new functions or modules, ensure they have proper comments for automatic documentation generation.
`;
  }
  
  async _generateArchitectureDocs(sourceFiles, sourceDir) {
    let docs = `# Architecture Documentation

## Project Structure

`;
    
    // Analyze directory structure
    const directories = new Set();
    for (const file of sourceFiles) {
      const relativePath = path.relative(sourceDir, file);
      const dir = path.dirname(relativePath);
      if (dir !== '.') {
        directories.add(dir);
      }
    }
    
    docs += `### Directory Structure\n\n`;
    docs += `\`\`\`\n`;
    docs += `${path.basename(sourceDir)}/\n`;
    for (const dir of Array.from(directories).sort()) {
      docs += `├── ${dir}/\n`;
    }
    docs += `\`\`\`\n\n`;
    
    docs += `### Module Overview\n\n`;
    docs += `The project consists of ${sourceFiles.length} source files organized into ${directories.size} modules.\n\n`;
    
    return docs;
  }
}

module.exports = new DocsGenerator();