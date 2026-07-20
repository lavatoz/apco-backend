import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';

async function testUriFix() {
  console.log('🧪 Testing PDF generation and URI annotation clickability inspection...\n');

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

  console.log(`Generated PDF Buffer size: ${pdfBuffer.length} bytes`);

  const bufferString = pdfBuffer.toString('binary');
  const hasPlaintextUrl = bufferString.includes(verificationUrl);
  console.log(`Contains Plaintext Verification URL in final PDF buffer? ${hasPlaintextUrl}`);

  if (hasPlaintextUrl) {
    console.log('✅ Success! Verification URL exists in plaintext in the PDF binary stream.');
  } else {
    console.log('❌ Warning: Verification URL was encrypted by pdf-encrypt into binary ciphertext.');
  }
}

testUriFix().catch(console.error);
