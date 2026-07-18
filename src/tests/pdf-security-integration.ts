import { prisma } from '../config/database';
import { securePdfDocument } from '../services/pdf-security.service';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function generateTestPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([200, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Test Document', { x: 20, y: 100, font, size: 12 });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function runTests() {
  console.log('\n🧪 Starting APCO PDF Security & Password Protection Integration Tests...');
  
  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`   ✅ [PASSED] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`   ❌ [FAILED] ${name}`);
      console.error(`      Reason: ${err.message || err}`);
      failedCount++;
    }
  }

  const originalFindMany = prisma.globalSetting.findMany;
  const mockPrisma = prisma as any;

  // Test 1: securePdfDocument returns original buffer when password is not configured
  await testCase('Returns original PDF unchanged when password is not configured', async () => {
    mockPrisma.globalSetting.findMany = async () => [
      { key: 'pdfSecureRenderEnabled', value: 'true' }, // Secure render on, but no password config
      { key: 'pdfOwnerPassword', value: '' },
    ];

    const pdfBuffer = await generateTestPdf();
    const { securedBuffer } = await securePdfDocument(pdfBuffer);
    
    if (securedBuffer.length !== pdfBuffer.length || !securedBuffer.equals(pdfBuffer)) {
      throw new Error('PDF buffer was modified when password was not configured.');
    }
  });

  // Test 2: securePdfDocument encrypts PDF when password is set, even if secure render is off
  await testCase('Encrypts PDF using AES-256 when password is set, even if secure render is off', async () => {
    mockPrisma.globalSetting.findMany = async () => [
      { key: 'pdfSecureRenderEnabled', value: 'false' }, // Secure render off, but password active
      { key: 'pdfOwnerPassword', value: 'OwnerPass123' },
      { key: 'pdfPasswordMode', value: 'open-password' },
      { key: 'pdfUserPassword', value: 'UserPass123' },
    ];

    const pdfBuffer = await generateTestPdf();
    const { securedBuffer } = await securePdfDocument(pdfBuffer);
    
    if (securedBuffer.length === pdfBuffer.length && securedBuffer.equals(pdfBuffer)) {
      throw new Error('PDF buffer was NOT encrypted.');
    }

    const rawString = securedBuffer.toString('utf8');
    if (!rawString.includes('/Encrypt')) {
      throw new Error('Encrypted PDF does not contain /Encrypt dictionary.');
    }
  });

  // Test 3: supports owner-only mode (opens without a password prompt)
  await testCase('Supports owner-only mode (opens without user password prompt)', async () => {
    mockPrisma.globalSetting.findMany = async () => [
      { key: 'pdfOwnerPassword', value: 'OwnerPass123' },
      { key: 'pdfPasswordMode', value: 'owner-only' },
    ];

    const pdfBuffer = await generateTestPdf();
    const { securedBuffer } = await securePdfDocument(pdfBuffer);
    
    const rawString = securedBuffer.toString('utf8');
    if (!rawString.includes('/Encrypt')) {
      throw new Error('Encrypted PDF does not contain /Encrypt dictionary.');
    }
  });

  // Test 4: securePdfDocument prioritizes options parameters
  await testCase('Prioritizes options parameters over DB settings', async () => {
    // Disabled in DB (no password), but forced in options
    mockPrisma.globalSetting.findMany = async () => [
      { key: 'pdfOwnerPassword', value: '' },
    ];

    const pdfBuffer = await generateTestPdf();
    const { securedBuffer } = await securePdfDocument(pdfBuffer, { encrypt: true, password: 'OptionsPass123' });
    
    const rawString = securedBuffer.toString('utf8');
    if (!rawString.includes('/Encrypt')) {
      throw new Error('Encrypted PDF does not contain /Encrypt dictionary.');
    }
  });

  // Cleanup mock
  mockPrisma.globalSetting.findMany = originalFindMany;

  console.log('\n📊 PDF Security Integration Results:');
  console.log(`   Passed: ${passedCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log('------------------------------');

  if (failedCount > 0) {
    throw new Error('Some PDF security integration tests failed');
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  });
}
