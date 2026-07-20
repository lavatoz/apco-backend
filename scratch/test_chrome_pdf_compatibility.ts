import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { DocumentRegistryService } from '../src/services/document-registry.service';
import fs from 'fs';
import path from 'path';

async function testCompatibility() {
  console.log('🧪 Testing PDF Encryption Algorithms for Chrome Compatibility...\n');

  const quotDocId = 'AK-DOC-2026-000009';
  const verificationUrl = DocumentRegistryService.getVerificationUrl(quotDocId);

  // Generate unencrypted PDF buffer
  const rawPdfBuffer = await generateQuotationPdf({
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

  const aesPath = path.resolve(process.cwd(), 'scratch/quotation_aes256.pdf');
  const rc4Path = path.resolve(process.cwd(), 'scratch/quotation_rc4.pdf');

  // Save AES-256
  fs.writeFileSync(aesPath, rawPdfBuffer);
  console.log(`Saved AES-256 PDF to: ${aesPath} (${rawPdfBuffer.length} bytes)`);

  // Encrypt with RC4 128-bit
  const rc4Bytes = await encryptPDF(rawPdfBuffer, '', {
    algorithm: 'RC4',
    ownerPassword: 'Test@123',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
  });

  fs.writeFileSync(rc4Path, rc4Bytes);
  console.log(`Saved RC4-128 PDF to: ${rc4Path} (${rc4Bytes.length} bytes)`);
}

testCompatibility().catch(console.error);
