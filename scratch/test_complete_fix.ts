import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import fs from 'fs';

async function testCompleteFix() {
  console.log('--- Generating Brand New Quotation PDF ---');
  const sampleData = {
    quotationNumber: 'AK-QUO-2026-COMPLETE-TEST',
    issueDate: '2026-07-21',
    validUntil: '2026-08-21',
    clientName: 'Rahul Sharma',
    clientEmail: 'rahul@example.com',
    verificationUrl: 'https://verify.apco.com/verify/AK-DOC-2026-000009',
    items: [
      { description: 'Premium Wedding Photography Package', quantity: 1, unitPrice: 150000, amount: 150000 },
      { description: 'Cinematic Videography', quantity: 1, unitPrice: 100000, amount: 100000 }
    ],
    amount: 250000,
    advancePaid: 50000,
    balanceAmount: 200000,
    companyName: 'APCO Studios & Events',
  };

  const buffer = await generateQuotationPdf(sampleData);
  fs.writeFileSync('scratch/fresh_quotation_test.pdf', buffer);
  console.log('Saved scratch/fresh_quotation_test.pdf (', buffer.length, 'bytes)');

  // Let's inspect the generated PDF with pdf-lib ignoreEncryption
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
  console.log('\nPage 1 Annots count:', annots?.size());

  if (annots && annots.size() > 0) {
    const annotRef = annots.get(0);
    const annotDict = doc.context.lookup(annotRef) as PDFDict;
    console.log('Link Annotation Keys:', annotDict.keys().map(k => k.toString()).join(', '));
    annotDict.keys().forEach(k => {
      console.log(`  ${k.toString()}:`, annotDict.get(k)?.toString());
    });

    const actionRef = annotDict.get(PDFName.of('A'));
    const actionDict = doc.context.lookup(actionRef) as PDFDict;
    console.log('Action Dict Keys:', actionDict.keys().map(k => k.toString()).join(', '));
    actionDict.keys().forEach(k => {
      console.log(`  ${k.toString()}:`, actionDict.get(k)?.toString());
    });
  }

  // Raw string check for /URI
  const rawStr = buffer.toString('latin1');
  console.log('\nRaw file /URI matches:');
  const uriMatches = rawStr.match(/\/URI\s*(\([^)]+\)|<[^>]+>)/g);
  console.log(uriMatches);
}

testCompleteFix().catch(console.error);
