import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import { securePdfDocument } from '../src/services/pdf-security.service';
import fs from 'fs';

async function testFixes() {
  console.log('--- Testing PDF Generation & Encryption ---');

  const sampleData = {
    quotationNumber: 'AK-QUO-2026-TEST',
    issueDate: '2026-07-21',
    validUntil: '2026-08-21',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    verificationUrl: 'https://verify.apco.com/verify/AK-DOC-2026-000009',
    items: [
      { description: 'Photography Service', quantity: 1, unitPrice: 50000, amount: 50000 }
    ],
    amount: 50000,
    advancePaid: 10000,
    balanceAmount: 40000,
    companyName: 'APCO Studios',
  };

  const buffer = await generateQuotationPdf(sampleData);
  fs.writeFileSync('scratch/quotation_encrypted_current.pdf', buffer);
  console.log('Generated current encrypted quotation PDF');
}

testFixes().catch(console.error);
