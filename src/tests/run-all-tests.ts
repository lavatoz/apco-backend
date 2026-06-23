process.env.NODE_ENV = 'test';
import { runTests as runAuthTests } from './auth-integration';
import { runTests as runComprehensiveTests } from './comprehensive-integration';
import { runTests as runGoogleDriveTests } from './google-drive-integration';
import { runTests as runAgreementTests } from './agreement-generation-integration';
import { runTests as runStandaloneAgreementTests } from './standalone-agreements-integration';

async function executeSuite() {
  console.log('🚀 Running APCO Complete Test Suite...');
  
  try {
    // Run Auth Integration
    await runAuthTests();
    
    // Run Comprehensive Integration
    await runComprehensiveTests();
    
    // Run Google Drive Integration
    await runGoogleDriveTests();

    // Run Agreement Generation Integration
    await runAgreementTests();

    // Run Standalone Agreement Integration
    await runStandaloneAgreementTests();
    
    console.log('\n🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

executeSuite();
