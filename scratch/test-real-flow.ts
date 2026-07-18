import { prisma } from '../src/config/database';
import { generateAgreementPdf } from '../src/services/agreement-pdf.service';

const mockData = {
  clientName: 'Alice Smith',
  brideName: 'Alice',
  groomName: 'Bob',
  eventName: 'Wedding Ceremony',
  eventDate: '12 December 2026',
  venue: 'Grand Plaza Hall',
  totalAmount: 'Rs. 1,50,000',
  advanceAmount: 'Rs. 50,000',
  balanceAmount: 'Rs. 1,00,000',
  todayDate: '25 June 2026',
  quotationNumber: 'QT-2026-001',
  invoiceNumber: 'INV-2026-001',
  companyName: 'APCO Productions',
  companyTagline: 'Capturing memories',
  companyLogoUrl: 'http://example.com/logo.png',
  companyPhone: '9876543210',
  companyEmail: 'info@apco.local',
  companyAddress: '123 Main St',
  primaryColor: '#3b82f6',
  templateVersion: '1.0',
};

async function main() {
  console.log('🔍 Checking settings in database before test...');
  const initialSettings = await prisma.globalSetting.findMany();
  for (const s of initialSettings) {
    console.log(`- ${s.key}: "${s.value}"`);
  }

  const secureRender = initialSettings.find(s => s.key === 'pdfSecureRenderEnabled')?.value;
  const ownerPassword = initialSettings.find(s => s.key === 'pdfOwnerPassword')?.value;

  console.log(`\n⚙️ Current config values: Enabled? "${secureRender}", Password? "${ownerPassword}"`);

  // Force enable PDF protection in the DB for the test
  console.log('\n🔒 Enabling PDF protection in database settings...');
  await prisma.globalSetting.upsert({
    where: { key: 'pdfSecureRenderEnabled' },
    update: { value: 'true' },
    create: { key: 'pdfSecureRenderEnabled', value: 'true' },
  });

  try {
    console.log('\n📂 Generating Agreement PDF (which invokes securePdfDocument internally)...');
    const pdfBuffer = await generateAgreementPdf(mockData);
    
    console.log(`\n🎉 PDF Generation finished! Final PDF size: ${pdfBuffer.length} bytes`);

    // Verify if it contains '/Encrypt'
    const rawString = pdfBuffer.toString('utf8');
    const hasEncrypt = rawString.includes('/Encrypt');
    console.log(`🔐 PDF contains /Encrypt dictionary: ${hasEncrypt}`);

    // If it is encrypted, save it for manual inspection
    if (hasEncrypt) {
      const outPath = 'scratch/encrypted-agreement-test.pdf';
      require('fs').writeFileSync(outPath, pdfBuffer);
      console.log(`💾 Saved encrypted test PDF to ${outPath}`);
    }
  } finally {
    // Restore the database setting
    console.log('\n🔄 Restoring database settings...');
    await prisma.globalSetting.update({
      where: { key: 'pdfSecureRenderEnabled' },
      data: { value: secureRender || 'false' },
    });
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
