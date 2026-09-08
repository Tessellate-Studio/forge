// Basic usage example for Code Directives SDK

const bp = require('@company/code-directives');

async function basicExample() {
  console.log('🚀 Code Directives SDK - Basic Usage Example');

  try {
    // Initialize a new project with best practices
    console.log('\n1. Initializing new project...');
    const initResult = await bp.init({
      projectName: 'example-project',
      template: 'web-app',
      autoSetupCI: true,
    });

    console.log('✅ Project initialized:', initResult.message);

    // Validate existing project against standards
    console.log('\n2. Validating project...');
    const validationResult = await bp.validate({
      path: './example-project',
      standards: ['code', 'security', 'performance'],
      autoFix: true,
    });

    console.log(`📊 Validation score: ${validationResult.score}/100`);
    console.log(`🔧 Issues found: ${validationResult.issues.length}`);
    console.log(`✅ Issues fixed: ${validationResult.fixed.length}`);

    // Generate documentation
    console.log('\n3. Generating documentation...');
    await bp.generateDocs({
      source: './example-project/src',
      output: './example-project/docs',
      includeDiagrams: true,
    });

    console.log('📚 Documentation generated successfully');

    // Display detailed results
    console.log('\n📈 Detailed Results:');
    if (validationResult.metrics) {
      console.log(
        '  Code Quality:',
        validationResult.metrics.codeQuality?.score || 'N/A'
      );
      console.log(
        '  Security:',
        validationResult.metrics.security?.score || 'N/A'
      );
      console.log(
        '  Performance:',
        validationResult.metrics.performance?.score || 'N/A'
      );
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  basicExample();
}

module.exports = { basicExample };
