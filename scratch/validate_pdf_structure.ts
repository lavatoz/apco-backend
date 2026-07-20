import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function validatePdf() {
  console.log('🧪 Step 1 & 2: Generating a new quotation PDF and saving to disk...');
  const quotDocId = 'AK-DOC-2026-000009';
  const verificationUrl = DocumentRegistryService.getVerificationUrl(quotDocId);

  const pdfBuffer = await generateQuotationPdf({
    quotationNumber: 'AK-QUO-2026-0004',
    issueDate: '2026-07-20',
    validUntil: '2026-08-20',
    clientName: 'rohit',
    clientEmail: 'rohit@example.com',
    items: [{ description: 'Photo Service', quantity: 1, unitPrice: 50000, amount: 50000 }],
    amount: 50000,
    advancePaid: 20000,
    balanceAmount: 30000,
    companyName: 'Aaha Kalyanam',
    verificationUrl,
  });

  const testPath = path.resolve(process.cwd(), 'scratch/test_generated_quotation.pdf');
  fs.writeFileSync(testPath, pdfBuffer);
  console.log(`Saved PDF to: ${testPath} (${pdfBuffer.length} bytes)`);

  const str = pdfBuffer.toString('binary');

  // Task 4: Confirm PDF Structure Elements
  console.log('\n--- Task 4: PDF Structure Validation ---');
  
  // 1. Header
  const headerMatch = str.slice(0, 20).match(/%PDF-\d\.\d/);
  console.log(`1. Header (%PDF-x.x): ${headerMatch ? headerMatch[0] : 'INVALID / NOT FOUND'}`);

  // 2. EOF Marker
  const eofMatch = str.slice(-30).includes('%%EOF');
  console.log(`2. EOF Marker (%%EOF): ${eofMatch ? 'FOUND at end of file' : 'INVALID / NOT FOUND'}`);

  // 3. startxref
  const startXrefIdx = str.lastIndexOf('startxref');
  console.log(`3. startxref index: ${startXrefIdx}`);
  if (startXrefIdx !== -1) {
    const afterStartXref = str.slice(startXrefIdx, startXrefIdx + 50);
    console.log(`   startxref snippet:\n   ${afterStartXref.replace(/\r?\n/g, ' ')}`);
  }

  // 4. Test loading with pdf-lib without ignoreEncryption
  console.log('\n--- Task 3 & 5: Validating with pdf-lib ---');
  try {
    const doc = await PDFDocument.load(pdfBuffer);
    console.log(`PDF loaded cleanly with pdf-lib! Total pages: ${doc.getPageCount()}`);
  } catch (err: any) {
    console.error('❌ pdf-lib load error:', err.message);
  }

  try {
    const docWithIgnore = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    console.log(`PDF loaded with ignoreEncryption: true! Object count: ${docWithIgnore.context.enumerateIndirectObjects().length}`);
  } catch (err: any) {
    console.error('❌ pdf-lib (ignoreEncryption) load error:', err.message);
  }
}

validatePdf().catch(console.error);
