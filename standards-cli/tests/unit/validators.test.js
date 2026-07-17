const fs = require('fs-extra');
const path = require('path');
const CodeValidator = require('../../lib/validators/code-validator');
const SecurityValidator = require('../../lib/validators/security-validator');
const PerformanceValidator = require('../../lib/validators/performance-validator');

describe('Validators', () => {
  const testProjectPath = path.join(__dirname, '../fixtures/test-project');
  
  beforeAll(async () => {
    // Create test project structure
    await fs.ensureDir(testProjectPath);
    await fs.ensureDir(path.join(testProjectPath, 'src'));
    await fs.ensureDir(path.join(testProjectPath, 'test'));
  });

  beforeEach(async () => {
    // Clean up and recreate test project structure before each test
    await fs.remove(testProjectPath);
    await fs.ensureDir(testProjectPath);
    await fs.ensureDir(path.join(testProjectPath, 'src'));
    await fs.ensureDir(path.join(testProjectPath, 'test'));
  });

  afterAll(async () => {
    // Clean up test project
    await fs.remove(testProjectPath);
  });

  describe('CodeValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new CodeValidator({
        enforceComments: true,
        maxFunctionLines: 50,
        testCoverage: 80
      });
    });

    test('should validate functions with comments', async () => {
      // Create test file with commented function
      const testFile = path.join(testProjectPath, 'src', 'commented.js');
      const content = `// Calculate user score based on activity
function calculateScore(user) {
  return user.points * 1.5;
}`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      expect(result.score).toBeGreaterThan(80);
      expect(result.metrics.commentedFunctions).toBe(1);
      expect(result.metrics.totalFunctions).toBe(1);
    });

    test('should detect functions without comments', async () => {
      // Create test file with uncommented function
      const testFile = path.join(testProjectPath, 'src', 'uncommented.js');
      const content = `function processData(data) {
  return data.map(item => item.value);
}`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe('missing-comment');
      expect(result.issues[0].rule).toBe('enforce-comments');
    });

    test('should detect long functions', async () => {
      // Create test file with long function
      const testFile = path.join(testProjectPath, 'src', 'long-function.js');
      const longFunction = `// Very long function that exceeds line limit
function veryLongFunction() {
${Array(60).fill('  console.log("line");').join('\n')}
}`;
      
      await fs.writeFile(testFile, longFunction);
      
      const result = await validator.validate(testProjectPath);
      
      const longFunctionIssue = result.issues.find(issue => issue.type === 'long-function');
      expect(longFunctionIssue).toBeDefined();
      expect(longFunctionIssue.rule).toBe('max-function-lines');
    });

    test('should auto-fix missing comments when enabled', async () => {
      // Create test file with uncommented function
      const testFile = path.join(testProjectPath, 'src', 'to-fix.js');
      const content = `function autoFixMe(param) {
  return param * 2;
}`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath, { autoFix: true });
      
      expect(result.fixed.length).toBeGreaterThan(0);
      
      // Check that comment was added
      const fixedContent = await fs.readFile(testFile, 'utf8');
      expect(fixedContent).toContain('// autoFixMe');
    });
  });

  describe('SecurityValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new SecurityValidator({
        scanSecrets: true,
        vulnerabilityScan: true
      });
    });

    test('should detect hardcoded API keys', async () => {
      // Create test file with hardcoded secret
      const testFile = path.join(testProjectPath, 'src', 'secrets.js');
      const content = `const apiKey = "AKIA1234567890123456";
const config = {
  password: "supersecretpassword123",
  dbUrl: "mongodb://user:pass@localhost/db"
};`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      expect(result.issues.length).toBeGreaterThan(0);
      
      const secretIssues = result.issues.filter(issue => issue.type === 'hardcoded-secret');
      expect(secretIssues.length).toBeGreaterThan(0);
    });

    test('should ignore test files and comments', async () => {
      // Create test file with secrets in comments
      const testFile = path.join(testProjectPath, 'test', 'example.test.js');
      const content = `// Example API key: AKIA1234567890123456
describe('API tests', () => {
  const mockKey = "AKIA1234567890123456";
  test('should work', () => {});
});`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      // Should not flag secrets in test files
      const secretIssues = result.issues.filter(
        issue => issue.type === 'hardcoded-secret' && issue.file.includes('test')
      );
      expect(secretIssues.length).toBe(0);
    });

    test('should allow whitelisted secret patterns', async () => {
      // Create validator with allowed patterns
      validator = new SecurityValidator({
        scanSecrets: true,
        allowedSecretPatterns: ['example', 'placeholder']
      });

      const testFile = path.join(testProjectPath, 'src', 'allowed.js');
      const content = `const exampleKey = "AKIA1234567890123456"; // example key
const placeholderToken = "your-token-here";`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      // Should not flag allowed patterns
      const secretIssues = result.issues.filter(issue => issue.type === 'hardcoded-secret');
      expect(secretIssues.length).toBe(0);
    });

    test('should calculate security score based on issues', async () => {
      // Create file with multiple security issues
      const testFile = path.join(testProjectPath, 'src', 'multiple-issues.js');
      const content = `const apiKey = "AKIA1234567890123456";
const password = "mypassword123";
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      expect(result.score).toBeLessThan(100);
      expect(result.metrics.secretsFound).toBeGreaterThan(0);
    });
  });

  describe('PerformanceValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new PerformanceValidator({
        bundleSize: '100KB', // Small limit for testing
        loadTime: '2s'
      });
    });

    test('should detect large files', async () => {
      // Create a large test file
      const testFile = path.join(testProjectPath, 'src', 'large-file.js');
      const largeContent = '// Large file\n' + 'x'.repeat(150000); // 150KB
      
      await fs.writeFile(testFile, largeContent);
      
      const result = await validator.validate(testProjectPath);
      
      const largeFileIssue = result.issues.find(issue => issue.type === 'large-file');
      expect(largeFileIssue).toBeDefined();
    });

    test('should detect performance anti-patterns', async () => {
      // Create test file with performance issues
      const testFile = path.join(testProjectPath, 'src', 'performance-issues.js');
      const content = `function badCode() {
  console.log("This will slow down production");
  
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      // Nested loops are performance-intensive
      process(data[i][j]);
    }
  }
  
  const cloned = JSON.parse(JSON.stringify(largeObject));
}`;
      
      await fs.writeFile(testFile, content);
      
      const result = await validator.validate(testProjectPath);
      
      const perfIssues = result.issues.filter(issue => 
        ['console-log', 'nested-loop', 'inefficient-clone'].includes(issue.type)
      );
      expect(perfIssues.length).toBeGreaterThan(0);
    });

    test('should calculate bundle size correctly', async () => {
      // Create multiple files to test bundle size
      const files = ['file1.js', 'file2.js', 'file3.js'];
      
      for (const fileName of files) {
        const testFile = path.join(testProjectPath, 'src', fileName);
        const content = 'x'.repeat(30000); // 30KB each
        await fs.writeFile(testFile, content);
      }
      
      const result = await validator.validate(testProjectPath);
      
      // Should detect bundle size issue (3 * 30KB = 90KB, but with existing files > 100KB)
      expect(result.metrics.bundleSize).toBeGreaterThan(0);
    });

    test('should calculate performance score', async () => {
      const result = await validator.validate(testProjectPath);
      
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});