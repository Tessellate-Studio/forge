const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const BestPracticesSDK = require('../../lib/index');

describe('Integration Tests - Full Workflow', () => {
  const testProjectName = 'test-integration-project';
  const testProjectPath = path.join(__dirname, '../fixtures', testProjectName);
  let sdk;

  beforeAll(async () => {
    // Clean up any existing test project
    await fs.remove(testProjectPath);
    await fs.ensureDir(path.dirname(testProjectPath));
    
    sdk = new BestPracticesSDK({
      code: { enforceComments: true, maxFunctionLines: 50 },
      security: { scanSecrets: true },
      performance: { bundleSize: '500KB' }
    });
  });

  afterAll(async () => {
    // Clean up test project
    await fs.remove(testProjectPath);
  });

  describe('Project Initialization', () => {
    test('should initialize new project with best practices', async () => {
      const result = await sdk.init({
        projectName: testProjectName,
        template: 'web-app',
        github: false, // Skip GitHub setup in tests
        autoSetupCI: false
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(`./${testProjectName}`);

      // Check that required files were created
      const readmePath = path.join(testProjectPath, 'README.md');
      const configPath = path.join(testProjectPath, '.bp-config.yml');

      expect(await fs.pathExists(readmePath)).toBe(true);
      expect(await fs.pathExists(configPath)).toBe(true);

      // Verify config content
      const config = await fs.readFile(configPath, 'utf8');
      expect(config).toContain('enforceComments: true');
      expect(config).toContain('maxFunctionLines: 50');
    });

    test('should create proper project structure', async () => {
      // Check directory structure (if template exists)
      const projectExists = await fs.pathExists(testProjectPath);
      expect(projectExists).toBe(true);

      // Check that standard files exist
      const standardFiles = ['README.md', '.bp-config.yml'];
      
      for (const file of standardFiles) {
        const filePath = path.join(testProjectPath, file);
        expect(await fs.pathExists(filePath)).toBe(true);
      }
    });
  });

  describe('Code Validation Workflow', () => {
    beforeEach(async () => {
      // Clean up and recreate test project directory
      await fs.remove(testProjectPath);
      await fs.ensureDir(testProjectPath);
      await fs.ensureDir(path.join(testProjectPath, 'src'));
    });

    test('should validate clean code successfully', async () => {
      // Create a well-written file
      const goodFile = path.join(testProjectPath, 'src', 'good-code.js');
      const goodContent = `// Calculate user engagement score
function calculateEngagement(userData) {
  // Validate input parameters
  if (!userData || !userData.activities) {
    throw new Error('Invalid user data provided');
  }
  
  // Calculate score based on activities
  const score = userData.activities.length * 10;
  return Math.min(score, 100);
}

// Export the function for use in other modules
module.exports = { calculateEngagement };`;

      await fs.writeFile(goodFile, goodContent);

      const result = await sdk.validate({
        path: testProjectPath,
        standards: ['code', 'security', 'performance']
      });

      expect(result.passed).toBe(true);
      expect(result.overallScore).toBeGreaterThan(80);
      expect(result.issues.length).toBe(0);
    });

    test('should detect and report issues in problematic code', async () => {
      // Create a problematic file
      const badFile = path.join(testProjectPath, 'src', 'bad-code.js');
      const badContent = `function processUserData(userData) {
  const apiKey = "AKIA1234567890123456";
  
  for (let i = 0; i < userData.length; i++) {
    for (let j = 0; j < userData[i].items.length; j++) {
      console.log("Processing item:", userData[i].items[j]);
      const result = JSON.parse(JSON.stringify(userData[i].items[j]));
    }
  }
  
  return userData.map(user => ({ ...user, processed: true }));
}`;

      await fs.writeFile(badFile, badContent);

      const result = await sdk.validate({
        path: testProjectPath,
        standards: ['code', 'security', 'performance']
      });

      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);

      // Check for specific issue types
      const issueTypes = result.issues.map(issue => issue.type);
      expect(issueTypes).toContain('missing-comment');
      expect(issueTypes).toContain('hardcoded-secret');
    });

    test('should auto-fix issues when requested', async () => {
      // Create a file with fixable issues
      const fixableFile = path.join(testProjectPath, 'src', 'fixable-code.js');
      const originalContent = `function calculate(x, y) {
  return x + y;
}

function multiply(a, b) {
  return a * b;
}`;

      await fs.writeFile(fixableFile, originalContent);

      const result = await sdk.validate({
        path: testProjectPath,
        standards: ['code'],
        autoFix: true
      });

      expect(result.fixed.length).toBeGreaterThan(0);

      // Check that comments were added
      const fixedContent = await fs.readFile(fixableFile, 'utf8');
      expect(fixedContent).toContain('// calculate');
      expect(fixedContent).toContain('// multiply');
    });
  });

  describe('Security Scanning Workflow', () => {
    beforeEach(async () => {
      // Clean up and recreate test project directory
      await fs.remove(testProjectPath);
      await fs.ensureDir(testProjectPath);
      await fs.ensureDir(path.join(testProjectPath, 'src'));
    });

    test('should detect various types of secrets', async () => {
      const securityFile = path.join(testProjectPath, 'src', 'security-test.js');
      const securityContent = `const config = {
  awsAccessKey: "AKIA1234567890123456",
  awsSecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  dbPassword: "supersecretpassword123",
  jwtToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
};`;

      await fs.writeFile(securityFile, securityContent);

      const result = await sdk.validate({
        path: testProjectPath,
        standards: ['security']
      });

      expect(result.passed).toBe(false);
      
      const secretIssues = result.issues.filter(issue => issue.type === 'hardcoded-secret');
      expect(secretIssues.length).toBeGreaterThan(0);
      
      // Check for different secret types
      const secretTypes = secretIssues.map(issue => issue.secretType);
      expect(secretTypes).toContain('AWS Access Key');
    });
  });

  describe('Performance Analysis Workflow', () => {
    beforeEach(async () => {
      // Clean up and recreate test project directory
      await fs.remove(testProjectPath);
      await fs.ensureDir(testProjectPath);
      await fs.ensureDir(path.join(testProjectPath, 'src'));
    });

    test('should analyze bundle size and performance patterns', async () => {
      // Create files of various sizes
      const smallFile = path.join(testProjectPath, 'src', 'small.js');
      const largeFile = path.join(testProjectPath, 'src', 'large.js');
      const perfFile = path.join(testProjectPath, 'src', 'performance.js');

      await fs.writeFile(smallFile, '// Small file\nconst x = 1;');
      await fs.writeFile(largeFile, '// Large file\n' + 'x'.repeat(120000)); // 120KB
      
      const perfContent = `function performanceIssues() {
  console.log("This will be flagged");
  
  // Nested loops
  for (let i = 0; i < 100; i++) {
    for (let j = 0; j < 100; j++) {
      process(i, j);
    }
  }
  
  // Inefficient cloning
  const clone = JSON.parse(JSON.stringify(largeObject));
}`;
      
      await fs.writeFile(perfFile, perfContent);

      const result = await sdk.validate({
        path: testProjectPath,
        standards: ['performance']
      });

      expect(result.issues.length).toBeGreaterThan(0);
      
      // Check for performance issues
      const perfIssues = result.issues.filter(issue => 
        ['large-file', 'console-log', 'nested-loop', 'inefficient-clone'].includes(issue.type)
      );
      expect(perfIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Documentation Generation Workflow', () => {
    beforeEach(async () => {
      // Clean up and recreate test project directory
      await fs.remove(testProjectPath);
      await fs.ensureDir(testProjectPath);
      await fs.ensureDir(path.join(testProjectPath, 'src'));
    });

    test('should generate documentation from source code', async () => {
      // Create source files with documentation
      const apiFile = path.join(testProjectPath, 'src', 'api.js');
      const apiContent = `// User management API functions
class UserAPI {
  // Get user by ID from database
  async getUser(id) {
    return await db.users.findById(id);
  }
  
  // Create new user with validation
  async createUser(userData) {
    if (!userData.email) {
      throw new Error('Email is required');
    }
    return await db.users.create(userData);
  }
}

module.exports = UserAPI;`;

      await fs.writeFile(apiFile, apiContent);

      const result = await sdk.generateDocs({
        source: path.join(testProjectPath, 'src'),
        output: path.join(testProjectPath, 'docs'),
        includeDiagrams: true
      });

      expect(result.success).toBe(true);
      
      // Check that docs directory was created
      const docsDir = path.join(testProjectPath, 'docs');
      expect(await fs.pathExists(docsDir)).toBe(true);
    });
  });

  describe('Complete SDK Integration', () => {
    test('should handle full project lifecycle', async () => {
      // 1. Initialize project
      const initResult = await sdk.init({
        projectName: `${testProjectName}-full`,
        template: 'web-app',
        github: false,
        autoSetupCI: false
      });
      
      expect(initResult.success).toBe(true);

      const fullProjectPath = path.join(path.dirname(testProjectPath), `${testProjectName}-full`);
      
      // 2. Add some code with mixed quality
      await fs.ensureDir(path.join(fullProjectPath, 'src'));
      
      const mixedCodeFile = path.join(fullProjectPath, 'src', 'mixed-quality.js');
      const mixedContent = `// Good function with proper comment
function goodFunction(param) {
  return param * 2;
}

function badFunction(data) {
  const secret = "AKIA1234567890123456";
  console.log("Debug info:", data);
  return data;
}`;

      await fs.writeFile(mixedCodeFile, mixedContent);

      // 3. Run validation
      const validationResult = await sdk.validate({
        path: fullProjectPath,
        standards: ['code', 'security', 'performance']
      });

      expect(validationResult.passed).toBe(false);
      expect(validationResult.issues.length).toBeGreaterThan(0);
      expect(validationResult.overallScore).toBeDefined();

      // 4. Auto-fix what can be fixed
      const autoFixResult = await sdk.validate({
        path: fullProjectPath,
        standards: ['code'],
        autoFix: true
      });

      expect(autoFixResult.fixed.length).toBeGreaterThan(0);

      // 5. Generate documentation
      const docsResult = await sdk.generateDocs({
        source: path.join(fullProjectPath, 'src'),
        output: path.join(fullProjectPath, 'docs')
      });

      expect(docsResult.success).toBe(true);

      // Clean up
      await fs.remove(fullProjectPath);
    });
  });
});