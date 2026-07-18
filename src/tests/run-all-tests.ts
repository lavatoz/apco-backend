process.env.NODE_ENV = 'test';
import { runTests as runAuthTests } from './auth-integration';
import { runTests as runComprehensiveTests } from './comprehensive-integration';
import { runTests as runGoogleDriveTests } from './google-drive-integration';
import { runTests as runAgreementTests } from './agreement-generation-integration';
import { runTests as runStandaloneAgreementTests } from './standalone-agreements-integration';
import { runTests as runPhotoSelectionTests } from './photo-selection-integration';
import { runTests as runMessagingTests } from './messaging-integration';
import { runTests as runWebsiteGalleryUploadTests } from './website-gallery-upload-integration';
import { runTests as runWebsiteGalleryCrudTests } from './website-gallery-crud-integration';
import { runTests as runWebsiteDivisionsTests } from './divisions-crud-integration';
import { runTests as runPdfSecurityTests } from './pdf-security-integration';

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

    // Run Photo Selection Integration
    await runPhotoSelectionTests();

    // Run Messaging Integration
    await runMessagingTests();

    // Run Website Gallery Upload Integration
    await runWebsiteGalleryUploadTests();

    // Run Website Gallery CRUD Integration
    await runWebsiteGalleryCrudTests();

    // Run Website Divisions CRUD & Upload Integration
    await runWebsiteDivisionsTests();

    // Run PDF Security & Encryption Integration
    await runPdfSecurityTests();
    
    console.log('\n🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

executeSuite();
