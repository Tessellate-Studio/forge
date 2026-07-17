const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');
const glob = require('glob');

class ProjectGenerator {
  constructor() {
    // Get the SDK's template directory
    this.templatesDir = path.join(__dirname, '../../templates');
  }

  async createProject(options) {
    const { name, template, path: projectPath, config } = options;

    // Ensure project directory exists
    await fs.ensureDir(projectPath);

    const filesCreated = [];

    // Create README.md
    const readmePath = path.join(projectPath, 'README.md');
    const readmeContent = `# ${name}

A project generated with Code Standards best practices.

## Getting Started

This project was initialized with automated best practices enforcement and includes:
- Proper dependency management
- Standardized project structure  
- Automated code quality validation
- Security scanning and best practices

## Installation

\`\`\`bash
npm install
\`\`\`

## Scripts

- \`npm start\` - Start the application
- \`npm run dev\` - Start development server  
- \`npm test\` - Run tests
- \`npm run lint\` - Check code style
- \`npm run validate\` - Validate code against best practices
- \`npm run audit\` - Run security audit

## Dependencies

This project uses:
- **Code Standards** CLI (\`standards\`) - dev standards + \`standards inspect\` (installed from GitHub)
- \`@tessellate-studio/rubric-sdk\` - Task scoring and prioritization

## Best Practices

This project follows automated code quality standards:
- Enforced function comments
- Maximum function line limits  
- Security scanning
- Performance optimization checks
- Proper dependency management (no SDK code duplication)
`;

    await fs.writeFile(readmePath, readmeContent);
    filesCreated.push('README.md');

    // Create .bp-config.yml from the app-type profile (or generic) template
    await this._createConfigFile(projectPath, config, filesCreated, template);

    // Copy template files if they exist, otherwise create basic structure
    if (await this._templateExists(template)) {
      await this._copyTemplateFiles(template, projectPath, name, filesCreated);
    } else {
      await this._createBasicStructure(
        template,
        projectPath,
        name,
        filesCreated
      );
    }

    return { filesCreated };
  }

  async _templateExists(template) {
    const templatePath = path.join(this.templatesDir, template);
    return fs.pathExists(templatePath);
  }

  async _copyTemplateFiles(template, projectPath, projectName, filesCreated) {
    const templatePath = path.join(this.templatesDir, template);

    // Copy all files from template directory
    const templateFiles = glob.sync('**/*', { cwd: templatePath, nodir: true });

    for (const file of templateFiles) {
      const srcPath = path.join(templatePath, file);
      const destPath = path.join(projectPath, file);

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(destPath));

      // Read template file and process variables if it's a text file
      if (this._isTextFile(file)) {
        let content = await fs.readFile(srcPath, 'utf8');
        content = this._processTemplateVariables(content, projectName);
        await fs.writeFile(destPath, content);
      } else {
        await fs.copy(srcPath, destPath);
      }

      filesCreated.push(file);
    }

    // Update package.json with proper dependencies
    await this._updatePackageJsonDependencies(projectPath);
  }

  async _createBasicStructure(
    template,
    projectPath,
    projectName,
    filesCreated
  ) {
    // Create basic package.json with proper dependencies
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = this._generatePackageJson(template, projectName);

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    filesCreated.push('package.json');

    // Create basic project structure based on template
    if (template === 'web-app') {
      await this._createWebAppStructure(projectPath, filesCreated);
    } else if (template === 'api') {
      await this._createApiStructure(projectPath, filesCreated);
    }
  }

  async _createConfigFile(projectPath, config, filesCreated, template) {
    const configPath = path.join(projectPath, '.bp-config.yml');

    // Prefer an app-type profile (templates/profiles/<type>.bp-config.yml),
    // fall back to the generic template config.
    const profilePath = path.join(
      this.templatesDir,
      'profiles',
      `${template}.bp-config.yml`
    );
    const templateConfigPath = (await fs.pathExists(profilePath))
      ? profilePath
      : path.join(this.templatesDir, '.bp-config.yml');

    let configContent;

    if (await fs.pathExists(templateConfigPath)) {
      // Use template config as base
      configContent = yaml.parse(await fs.readFile(templateConfigPath, 'utf8'));
    } else {
      // Generate default config
      configContent = {
        standards: {
          code: {
            enforceComments: true,
            maxFunctionLines: 50,
            testCoverage: 80
          },
          security: {
            scanSecrets: true,
            vulnerabilityScan: true
          },
          performance: {
            bundleSize: '500KB',
            loadTime: '2s'
          }
        },
        automation: {
          github: {
            autoPR: true,
            claudeReview: true,
            autoMerge: false
          }
        }
      };
    }

    // Override with provided config
    if (config) {
      configContent = this._mergeConfigs(configContent, config);
    }

    await fs.writeFile(configPath, yaml.stringify(configContent));
    filesCreated.push('.bp-config.yml');
  }

  _generatePackageJson(template, projectName) {
    const basePackageJson = {
      name: projectName,
      version: '1.0.0',
      description: `${template} project generated with Code Standards`,
      main: template === 'api' ? 'src/app.js' : 'src/index.js',
      scripts: {
        test: 'jest',
        'test:watch': 'jest --watch',
        lint: 'eslint src/ --fix',
        'lint:check': 'eslint src/',
        validate: 'standards inspect',
        audit: 'standards audit'
      },
      keywords: ['code-standards', 'best-practices', template],
      author: '',
      license: 'MIT',
      devDependencies: {
        // The Code Standards CLI and rubric-sdk are installed on demand from
        // GitHub by the platform skills (not per-app npm deps), so only the
        // genuinely-published toolchain goes here.
        jest: '^29.0.0',
        eslint: '^8.0.0',
        'eslint-config-standard': '^17.0.0'
      }
    };

    // Add template-specific dependencies
    if (template === 'web-app' || template === 'api') {
      basePackageJson.scripts.start = 'node src/app.js';
      basePackageJson.scripts.dev = 'nodemon src/app.js';
      basePackageJson.dependencies = {
        express: '^4.18.0',
        cors: '^2.8.5',
        helmet: '^7.0.0',
        dotenv: '^16.0.0'
      };
      basePackageJson.devDependencies.nodemon = '^3.0.0';

      if (template === 'api') {
        basePackageJson.dependencies['express-rate-limit'] = '^6.0.0';
        basePackageJson.dependencies['express-validator'] = '^7.0.0';
        basePackageJson.dependencies.morgan = '^1.10.0';
        basePackageJson.dependencies.compression = '^1.7.4';
      }
    }

    return basePackageJson;
  }

  async _updatePackageJsonDependencies(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);

      // Ensure SDK dependencies are properly set
      if (!packageJson.devDependencies) {
        packageJson.devDependencies = {};
      }

      packageJson.devDependencies['@company/code-directives'] = '^1.0.0';
      packageJson.devDependencies['@company/rubric-sdk'] = '^1.0.0';

      // Update validate script to use proper CLI command
      if (packageJson.scripts) {
        packageJson.scripts.validate = 'standards inspect';
        packageJson.scripts.audit = 'standards audit';
      }

      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    }
  }

  _processTemplateVariables(content, projectName) {
    return content
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
      .replace(/\{\{project_name\}\}/g, projectName)
      .replace(/my-web-app|my-api/g, projectName);
  }

  _isTextFile(filepath) {
    const textExtensions = [
      '.js',
      '.json',
      '.md',
      '.yml',
      '.yaml',
      '.txt',
      '.env'
    ];
    return textExtensions.some(ext => filepath.endsWith(ext));
  }

  _mergeConfigs(base, override) {
    const result = { ...base };
    for (const key in override) {
      if (
        typeof override[key] === 'object' &&
        override[key] !== null &&
        !Array.isArray(override[key])
      ) {
        result[key] = this._mergeConfigs(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  async _createWebAppStructure(projectPath, filesCreated) {
    // Create src directory
    const srcPath = path.join(projectPath, 'src');
    await fs.ensureDir(srcPath);

    // Create basic index.js
    const indexPath = path.join(srcPath, 'index.js');
    const indexContent = `// Main application entry point
function initializeApp() {
  console.log('Application initialized');
}

// Start the application
initializeApp();

module.exports = { initializeApp };
`;

    await fs.writeFile(indexPath, indexContent);
    filesCreated.push('src/index.js');

    // Create tests directory
    const testsPath = path.join(projectPath, 'tests');
    await fs.ensureDir(testsPath);

    // Create basic test file
    const testPath = path.join(testsPath, 'index.test.js');
    const testContent = `const { initializeApp } = require('../src/index');

describe('Application', () => {
  test('should initialize without errors', () => {
    expect(() => initializeApp()).not.toThrow();
  });
});
`;

    await fs.writeFile(testPath, testContent);
    filesCreated.push('tests/index.test.js');
  }

  async _createApiStructure(projectPath, filesCreated) {
    // Create src directory
    const srcPath = path.join(projectPath, 'src');
    await fs.ensureDir(srcPath);

    // Create basic app.js for API
    const appPath = path.join(srcPath, 'app.js');
    const appContent = `const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Basic API endpoint
app.get('/api/status', (req, res) => {
  res.json({
    message: 'API is running successfully',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(\`🚀 API Server running on port \${PORT}\`);
  console.log(\`📊 Health check: http://localhost:\${PORT}/health\`);
});

module.exports = app;
`;

    await fs.writeFile(appPath, appContent);
    filesCreated.push('src/app.js');

    // Create tests directory
    const testsPath = path.join(projectPath, 'tests');
    await fs.ensureDir(testsPath);

    // Create basic API test
    const testPath = path.join(testsPath, 'api.test.js');
    const testContent = `const request = require('supertest');
const app = require('../src/app');

describe('API Endpoints', () => {
  test('GET /health should return healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body.status).toBe('healthy');
    expect(response.body.timestamp).toBeDefined();
  });

  test('GET /api/status should return API status', async () => {
    const response = await request(app)
      .get('/api/status')
      .expect(200);
    
    expect(response.body.message).toContain('running successfully');
    expect(response.body.version).toBeDefined();
  });
});
`;

    await fs.writeFile(testPath, testContent);
    filesCreated.push('tests/api.test.js');

    // Create .env.example file
    const envExamplePath = path.join(projectPath, '.env.example');
    const envContent = `# Environment Configuration
NODE_ENV=development
PORT=3000

# Database Configuration (if needed)
# DATABASE_URL=

# API Keys (if needed)  
# API_KEY=
`;

    await fs.writeFile(envExamplePath, envContent);
    filesCreated.push('.env.example');
  }
}

module.exports = new ProjectGenerator();
