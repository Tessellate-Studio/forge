// Advanced validation example with custom configuration

const bp = require('@company/code-directives');
const { CodeValidator, SecurityValidator, PerformanceValidator } = bp;

async function advancedValidationExample() {
    console.log('🔍 Code Directives SDK - Advanced Validation Example');
    
    try {
        // Custom configuration for stricter validation
        const customConfig = {
            code: {
                enforceComments: true,
                maxFunctionLines: 30, // Stricter than default 50
                testCoverage: 90       // Higher than default 80
            },
            security: {
                scanSecrets: true,
                vulnerabilityScan: true,
                auditLevel: 'moderate'
            },
            performance: {
                bundleSize: '300KB',   // Stricter than default 500KB
                loadTime: '1.5s',      // Faster than default 2s
                apiTimeout: '3s'
            }
        };
        
        // Individual validator instances for fine control
        console.log('\n1. Running individual validators...');
        
        // Code quality validation
        const codeValidator = new CodeValidator(customConfig);
        const codeResults = await codeValidator.validate('./src');
        console.log(`📝 Code Quality Score: ${codeResults.score}/100`);
        console.log(`   Functions with comments: ${codeResults.metrics.commentedFunctions}/${codeResults.metrics.totalFunctions}`);
        console.log(`   Long functions: ${codeResults.metrics.longFunctions}`);
        
        // Security validation
        const securityValidator = new SecurityValidator(customConfig);
        const securityResults = await securityValidator.validate('./');
        console.log(`🔒 Security Score: ${securityResults.score}/100`);
        console.log(`   Vulnerabilities found: ${securityResults.vulnerabilities?.length || 0}`);
        console.log(`   Secrets exposed: ${securityResults.secretsExposed || 0}`);
        
        // Performance validation
        const performanceValidator = new PerformanceValidator(customConfig);
        const performanceResults = await performanceValidator.validate('./dist');
        console.log(`⚡ Performance Score: ${performanceResults.score}/100`);
        console.log(`   Bundle size: ${performanceResults.metrics?.bundleSize || 'N/A'}`);
        
        // Comprehensive validation with custom rules
        console.log('\n2. Running comprehensive validation...');
        
        const comprehensiveResults = await bp.validate({
            path: './',
            standards: ['code', 'security', 'performance'],
            autoFix: true,
            config: customConfig,
            reportPath: './validation-report.json'
        });
        
        // Analyze results by severity
        const criticalIssues = comprehensiveResults.issues.filter(i => i.severity === 'error');
        const warnings = comprehensiveResults.issues.filter(i => i.severity === 'warning');
        
        console.log(`\n📊 Comprehensive Results:`);
        console.log(`   Overall Score: ${comprehensiveResults.score}/100`);
        console.log(`   Critical Issues: ${criticalIssues.length}`);
        console.log(`   Warnings: ${warnings.length}`);
        console.log(`   Auto-fixed: ${comprehensiveResults.fixed.length}`);
        
        // Display critical issues
        if (criticalIssues.length > 0) {
            console.log(`\n🔴 Critical Issues:`);
            criticalIssues.slice(0, 5).forEach(issue => {
                console.log(`   ${issue.file}:${issue.line} - ${issue.message}`);
            });
            if (criticalIssues.length > 5) {
                console.log(`   ... and ${criticalIssues.length - 5} more`);
            }
        }
        
        // Display auto-fixes
        if (comprehensiveResults.fixed.length > 0) {
            console.log(`\n✅ Auto-fixes Applied:`);
            comprehensiveResults.fixed.slice(0, 3).forEach(fix => {
                console.log(`   ${fix.file}:${fix.line} - ${fix.fix}`);
            });
            if (comprehensiveResults.fixed.length > 3) {
                console.log(`   ... and ${comprehensiveResults.fixed.length - 3} more`);
            }
        }
        
        // Generate detailed report
        console.log('\n3. Generating detailed report...');
        const reportData = {
            timestamp: new Date().toISOString(),
            config: customConfig,
            results: {
                code: codeResults,
                security: securityResults,
                performance: performanceResults,
                comprehensive: comprehensiveResults
            },
            summary: {
                overallScore: Math.round((codeResults.score + securityResults.score + performanceResults.score) / 3),
                totalIssues: comprehensiveResults.issues.length,
                criticalCount: criticalIssues.length,
                warningsCount: warnings.length,
                fixedCount: comprehensiveResults.fixed.length
            }
        };
        
        // Save detailed report
        const fs = require('fs-extra');
        await fs.writeFile('./detailed-validation-report.json', JSON.stringify(reportData, null, 2));
        console.log('📄 Detailed report saved to: detailed-validation-report.json');
        
        // Recommendations based on results
        console.log('\n💡 Recommendations:');
        if (reportData.summary.overallScore < 80) {
            console.log('   - Focus on addressing critical issues first');
            console.log('   - Consider increasing test coverage');
            console.log('   - Review and add function comments');
        }
        if (securityResults.score < 90) {
            console.log('   - Run security audit and update dependencies');
            console.log('   - Review environment variable usage');
        }
        if (performanceResults.score < 75) {
            console.log('   - Optimize bundle size');
            console.log('   - Consider code splitting');
            console.log('   - Profile API performance');
        }
        
    } catch (error) {
        console.error('❌ Advanced validation failed:', error.message);
        if (error.details) {
            console.error('Details:', error.details);
        }
        process.exit(1);
    }
}

// Run the example
if (require.main === module) {
    advancedValidationExample();
}

module.exports = { advancedValidationExample };