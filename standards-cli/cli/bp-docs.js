#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');
const glob = require('glob');

const program = new Command();

program
  .version('1.0.0')
  .description('Generate documentation with diagrams')
  .option('-s, --source <path>', 'Source directory to document', './src')
  .option('-o, --output <path>', 'Output directory for documentation', './docs')
  .option('-d, --diagrams', 'Include Mermaid diagrams', false)
  .option('-f, --format <format>', 'Output format (markdown, html)', 'markdown')
  .option('--include-private', 'Include private functions', false)
  .option('--template <template>', 'Documentation template', 'default')
  .option('--maintenance', 'Generate maintenance files (dependencies.md, sdk-map.md)', false)
  .parse(process.argv);

const options = program.opts();

// Main documentation generation function
async function generateDocs() {
    console.log(chalk.blue('📚 Generating documentation...'));
    
    try {
        const sourcePath = path.resolve(options.source);
        const outputPath = path.resolve(options.output);
        
        // Ensure output directory exists
        await fs.ensureDir(outputPath);
        
        // Find all source files
        const sourceFiles = await findSourceFiles(sourcePath);
        console.log(chalk.gray(`Found ${sourceFiles.length} source files`));
        
        // Parse source files for documentation
        const docData = await parseSourceFiles(sourceFiles);
        
        // Generate documentation files
        await generateDocFiles(docData, outputPath);
        
        // Generate diagrams if requested
        if (options.diagrams) {
            await generateDiagrams(docData, outputPath);
        }
        
        // Generate index file
        await generateIndex(docData, outputPath);
        
        // Generate maintenance files if requested
        if (options.maintenance) {
            await generateMaintenanceFiles();
        }
        
        console.log(chalk.green(`✅ Documentation generated in ${outputPath}`));
        
    } catch (error) {
        console.error(chalk.red('❌ Documentation generation failed:'), error.message);
        process.exit(1);
    }
}

// Find all source files to document
async function findSourceFiles(sourcePath) {
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
        'coverage/**',
        '**/*.test.js',
        '**/*.spec.js'
    ];
    
    let files = [];
    for (const pattern of patterns) {
        const found = glob.sync(path.join(sourcePath, pattern), { ignore });
        files.push(...found);
    }
    
    return files;
}

// Parse source files for documentation content
async function parseSourceFiles(files) {
    const docData = {
        modules: [],
        functions: [],
        classes: [],
        constants: []
    };
    
    for (const file of files) {
        console.log(chalk.gray(`  Parsing ${path.relative(process.cwd(), file)}`));
        
        const content = await fs.readFile(file, 'utf8');
        const relativePath = path.relative(options.source, file);
        
        const moduleDoc = await parseFile(file, content, relativePath);
        if (moduleDoc) {
            docData.modules.push(moduleDoc);
            docData.functions.push(...moduleDoc.functions);
            docData.classes.push(...moduleDoc.classes);
            docData.constants.push(...moduleDoc.constants);
        }
    }
    
    return docData;
}

// Parse individual file for documentation
async function parseFile(filePath, content, relativePath) {
    const lines = content.split('\n');
    
    const module = {
        name: path.basename(filePath, path.extname(filePath)),
        path: relativePath,
        description: extractModuleDescription(lines),
        functions: [],
        classes: [],
        constants: [],
        imports: extractImports(lines),
        exports: extractExports(lines)
    };
    
    // Extract functions
    module.functions = extractFunctions(lines, filePath);
    
    // Extract classes
    module.classes = extractClasses(lines, filePath);
    
    // Extract constants
    module.constants = extractConstants(lines, filePath);
    
    return module;
}

// Extract module description from file header
function extractModuleDescription(lines) {
    const description = [];
    let inComment = false;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('/**')) {
            inComment = true;
            continue;
        }
        
        if (trimmed.endsWith('*/')) {
            inComment = false;
            break;
        }
        
        if (inComment && trimmed.startsWith('*')) {
            const text = trimmed.substring(1).trim();
            if (text) description.push(text);
        }
        
        // Stop at first non-comment line
        if (!inComment && trimmed && !trimmed.startsWith('//')) {
            break;
        }
    }
    
    return description.join(' ') || 'No description available';
}

// Extract function documentation
function extractFunctions(lines, filePath) {
    const functions = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Match function declarations
        const functionMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
        const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?.*=>/);
        
        const match = functionMatch || arrowMatch;
        if (match) {
            const functionName = match[1];
            
            // Skip private functions if not including them
            if (!options.includePrivate && functionName.startsWith('_')) {
                continue;
            }
            
            const func = {
                name: functionName,
                file: filePath,
                line: i + 1,
                description: extractFunctionDescription(lines, i),
                parameters: extractParameters(line),
                returns: extractReturnType(lines, i),
                examples: extractExamples(lines, i),
                isAsync: line.includes('async'),
                isExported: line.includes('export')
            };
            
            functions.push(func);
        }
    }
    
    return functions;
}

// Extract function description from comments
function extractFunctionDescription(lines, functionLine) {
    const description = [];
    let i = functionLine - 1;
    
    // Look backwards for comments
    while (i >= 0) {
        const line = lines[i].trim();
        
        if (line.startsWith('//')) {
            description.unshift(line.substring(2).trim());
        } else if (line.startsWith('*')) {
            description.unshift(line.substring(1).trim());
        } else if (line === '' || line.startsWith('/**') || line.startsWith('*/')) {
            // Continue
        } else {
            break;
        }
        
        i--;
    }
    
    return description.join(' ') || 'No description available';
}

// Extract function parameters
function extractParameters(functionLine) {
    const match = functionLine.match(/\(([^)]*)\)/);
    if (!match) return [];
    
    const params = match[1].split(',').map(p => p.trim()).filter(p => p);
    return params.map(param => {
        const [name, defaultValue] = param.split('=').map(p => p.trim());
        return {
            name: name.replace(/[{}[\]]/g, ''), // Remove destructuring syntax
            defaultValue: defaultValue || null,
            optional: !!defaultValue
        };
    });
}

// Extract return type information
function extractReturnType(lines, functionLine) {
    // Look for return statements
    for (let i = functionLine; i < Math.min(lines.length, functionLine + 50); i++) {
        const line = lines[i].trim();
        if (line.startsWith('return ')) {
            return 'Mixed'; // Could analyze further
        }
    }
    return 'void';
}

// Extract usage examples
function extractExamples(lines, functionLine) {
    const examples = [];
    // Could implement example extraction from comments
    return examples;
}

// Extract classes
function extractClasses(lines, filePath) {
    const classes = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(/class\s+(\w+)/);
        
        if (match) {
            const className = match[1];
            
            const cls = {
                name: className,
                file: filePath,
                line: i + 1,
                description: extractFunctionDescription(lines, i),
                methods: extractClassMethods(lines, i),
                constructor: extractConstructor(lines, i)
            };
            
            classes.push(cls);
        }
    }
    
    return classes;
}

// Extract class methods
function extractClassMethods(lines, classLine) {
    const methods = [];
    let braceLevel = 0;
    let inClass = false;
    
    for (let i = classLine; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Track brace levels to stay within class
        if (line.includes('{')) braceLevel++;
        if (line.includes('}')) braceLevel--;
        
        if (braceLevel === 0 && inClass) break;
        if (braceLevel > 0) inClass = true;
        
        // Match method definitions
        const methodMatch = line.match(/(?:async\s+)?(\w+)\s*\(/);
        if (methodMatch && inClass && !line.includes('class')) {
            const methodName = methodMatch[1];
            
            methods.push({
                name: methodName,
                line: i + 1,
                isAsync: line.includes('async'),
                isStatic: line.includes('static'),
                description: extractFunctionDescription(lines, i)
            });
        }
    }
    
    return methods;
}

// Extract constructor
function extractConstructor(lines, classLine) {
    for (let i = classLine; i < Math.min(lines.length, classLine + 50); i++) {
        const line = lines[i].trim();
        if (line.startsWith('constructor(')) {
            return {
                line: i + 1,
                parameters: extractParameters(line),
                description: extractFunctionDescription(lines, i)
            };
        }
    }
    return null;
}

// Extract constants and variables
function extractConstants(lines, filePath) {
    const constants = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(/(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=/);
        
        if (match) {
            const constantName = match[1];
            
            constants.push({
                name: constantName,
                file: filePath,
                line: i + 1,
                description: extractFunctionDescription(lines, i),
                value: extractConstantValue(line)
            });
        }
    }
    
    return constants;
}

// Extract constant value
function extractConstantValue(line) {
    const match = line.match(/=\s*(.+);?$/);
    return match ? match[1] : 'Unknown';
}

// Extract imports
function extractImports(lines) {
    return lines
        .filter(line => line.trim().startsWith('import ') || line.trim().startsWith('const ') && line.includes('require('))
        .map(line => line.trim());
}

// Extract exports
function extractExports(lines) {
    return lines
        .filter(line => line.trim().startsWith('export ') || line.trim().startsWith('module.exports'))
        .map(line => line.trim());
}

// Generate documentation files
async function generateDocFiles(docData, outputPath) {
    console.log(chalk.yellow('  📝 Generating documentation files...'));
    
    // Generate module documentation
    for (const module of docData.modules) {
        const modulePath = path.join(outputPath, 'modules', `${module.name}.md`);
        await fs.ensureDir(path.dirname(modulePath));
        
        const content = generateModuleDoc(module);
        await fs.writeFile(modulePath, content);
    }
    
    // Generate API reference
    const apiPath = path.join(outputPath, 'api-reference.md');
    const apiContent = generateApiReference(docData);
    await fs.writeFile(apiPath, apiContent);
}

// Generate module documentation
function generateModuleDoc(module) {
    return `# ${module.name}

**File:** \`${module.path}\`

## Description

${module.description}

${module.functions.length > 0 ? `
## Functions

${module.functions.map(func => `
### ${func.name}

**Description:** ${func.description}

**Parameters:**
${func.parameters.length > 0 ? func.parameters.map(p => `- \`${p.name}\`${p.optional ? ' (optional)' : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`).join('\n') : 'None'}

**Returns:** ${func.returns}

${func.isAsync ? '**Async:** Yes' : ''}
${func.isExported ? '**Exported:** Yes' : ''}

---
`).join('')}
` : ''}

${module.classes.length > 0 ? `
## Classes

${module.classes.map(cls => `
### ${cls.name}

**Description:** ${cls.description}

${cls.constructor ? `
**Constructor:**
${cls.constructor.parameters.map(p => `- \`${p.name}\``).join('\n')}
` : ''}

**Methods:**
${cls.methods.map(method => `- \`${method.name}\`${method.isAsync ? ' (async)' : ''}${method.isStatic ? ' (static)' : ''}`).join('\n')}

---
`).join('')}
` : ''}

${module.constants.length > 0 ? `
## Constants

${module.constants.map(constant => `
### ${constant.name}

**Description:** ${constant.description}
**Value:** \`${constant.value}\`

---
`).join('')}
` : ''}
`;
}

// Generate API reference
function generateApiReference(docData) {
    return `# API Reference

## Functions

${docData.functions.map(func => `
### \`${func.name}()\`

**File:** ${func.file}:${func.line}

${func.description}

**Parameters:**
${func.parameters.length > 0 ? func.parameters.map(p => `- \`${p.name}\`${p.optional ? ' (optional)' : ''}`).join('\n') : 'None'}

**Returns:** ${func.returns}

---
`).join('')}

## Classes

${docData.classes.map(cls => `
### \`${cls.name}\`

**File:** ${cls.file}:${cls.line}

${cls.description}

**Methods:** ${cls.methods.map(m => m.name).join(', ')}

---
`).join('')}

## Constants

${docData.constants.map(constant => `
### \`${constant.name}\`

**File:** ${constant.file}:${constant.line}

${constant.description}

**Value:** \`${constant.value}\`

---
`).join('')}
`;
}

// Generate Mermaid diagrams
async function generateDiagrams(docData, outputPath) {
    console.log(chalk.yellow('  📊 Generating diagrams...'));
    
    // Generate class diagram
    const classDiagram = generateClassDiagram(docData.classes);
    await fs.writeFile(path.join(outputPath, 'class-diagram.md'), classDiagram);
    
    // Generate module dependency diagram
    const dependencyDiagram = generateDependencyDiagram(docData.modules);
    await fs.writeFile(path.join(outputPath, 'dependency-diagram.md'), dependencyDiagram);
}

// Generate class diagram
function generateClassDiagram(classes) {
    if (classes.length === 0) return '# Class Diagram\n\nNo classes found.';
    
    const diagram = `# Class Diagram

\`\`\`mermaid
classDiagram
${classes.map(cls => `
    class ${cls.name} {
        ${cls.constructor ? cls.constructor.parameters.map(p => `+${p.name}`).join('\n        ') : ''}
        ${cls.methods.map(method => `${method.isStatic ? '+' : '-'}${method.name}()${method.isAsync ? ' async' : ''}`).join('\n        ')}
    }
`).join('')}
\`\`\`
`;
    
    return diagram;
}

// Generate dependency diagram
function generateDependencyDiagram(modules) {
    const diagram = `# Module Dependencies

\`\`\`mermaid
graph TD
${modules.map(module => `
    ${module.name}[${module.name}]
`).join('')}
\`\`\`
`;
    
    return diagram;
}

// Generate index file
async function generateIndex(docData, outputPath) {
    const indexPath = path.join(outputPath, 'README.md');
    
    const content = `# Documentation Index

Generated on: ${new Date().toISOString()}

## Modules (${docData.modules.length})

${docData.modules.map(module => `- [${module.name}](./modules/${module.name}.md) - ${module.description}`).join('\n')}

## API Reference

- [Complete API Reference](./api-reference.md)

${options.diagrams ? `
## Diagrams

- [Class Diagram](./class-diagram.md)
- [Dependency Diagram](./dependency-diagram.md)
` : ''}

## Statistics

- **Modules:** ${docData.modules.length}
- **Functions:** ${docData.functions.length}
- **Classes:** ${docData.classes.length}
- **Constants:** ${docData.constants.length}

---
*Generated by Best Practices SDK Documentation Generator*
`;
    
    await fs.writeFile(indexPath, content);
}

// Generate maintenance files
async function generateMaintenanceFiles() {
    console.log(chalk.yellow('  📋 Generating maintenance files...'));
    
    const MaintenanceValidator = require('../lib/validators/maintenance-validator');
    const validator = new MaintenanceValidator();
    
    // Generate dependencies.md if it doesn't exist
    const dependenciesPath = path.join(process.cwd(), 'dependencies.md');
    if (!await fs.pathExists(dependenciesPath)) {
        const dependenciesContent = validator.generateTemplate('dependencies');
        await fs.writeFile(dependenciesPath, dependenciesContent);
        console.log(chalk.green('    ✅ Generated dependencies.md'));
    } else {
        console.log(chalk.yellow('    ⚠️  dependencies.md already exists, skipping'));
    }
    
    // Generate sdk-map.md if it doesn't exist
    const sdkMapPath = path.join(process.cwd(), 'sdk-map.md');
    if (!await fs.pathExists(sdkMapPath)) {
        const sdkMapContent = validator.generateTemplate('sdk-map');
        await fs.writeFile(sdkMapPath, sdkMapContent);
        console.log(chalk.green('    ✅ Generated sdk-map.md'));
    } else {
        console.log(chalk.yellow('    ⚠️  sdk-map.md already exists, skipping'));
    }
    
    // Run validation to check if the files are properly formatted
    const validation = validator.validate();
    if (!validation.passed) {
        console.log(chalk.yellow('    ⚠️  Maintenance file validation warnings:'));
        validation.issues.forEach(issue => {
            console.log(chalk.yellow(`      • ${issue.message}`));
        });
        validation.warnings.forEach(warning => {
            console.log(chalk.yellow(`      • ${warning.message}`));
        });
    } else {
        console.log(chalk.green('    ✅ Maintenance files validated successfully'));
    }
}

// Run documentation generation
generateDocs().catch(error => {
    console.error(chalk.red('Failed to generate documentation:'), error);
    process.exit(1);
});