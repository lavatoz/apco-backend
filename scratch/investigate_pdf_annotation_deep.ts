import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import { generateQuotationPdf } from '../src/services/quotation-pdf.service';
import fs from 'fs';

async function main() {
  console.log('--- 1. Generating quotation PDF with current code ---');
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
  fs.writeFileSync('scratch/test_generated_quotation.pdf', buffer);
  console.log('Saved scratch/test_generated_quotation.pdf (', buffer.length, 'bytes)');

  console.log('\n--- Inspecting Generated PDF with ignoreEncryption: true ---');
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  
  const pages = doc.getPages();
  pages.forEach((page, pageIdx) => {
    console.log(`\nPage ${pageIdx + 1} ref:`, page.ref.toString());
    const pageDict = page.node;
    console.log(`Page ${pageIdx + 1} keys:`, pageDict.keys().map(k => k.toString()).join(', '));
    
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    console.log(`Page ${pageIdx + 1} Annots array:`, annots ? `Present, size=${annots.size()}` : 'None');
    if (annots) {
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i);
        console.log(`  Annot #${i+1} ref object:`, ref.toString());
        const dict = doc.context.lookup(ref) as PDFDict;
        if (dict) {
          console.log(`  Annot #${i+1} keys:`, dict.keys().map(k => k.toString()).join(', '));
          dict.keys().forEach(k => {
            const val = dict.get(k);
            console.log(`    ${k.toString()}:`, val?.toString());
            if (k.toString() === '/A') {
              const actionDict = doc.context.lookup(val);
              console.log(`      -> Action object resolved:`, actionDict?.toString());
            }
          });
        }
      }
    }
  });

  // Let's also inspect raw text / objects by reading the buffer as string
  const str = buffer.toString('utf-8');
  console.log('\n--- RAW TEXT ANALYSIS FOR LINK & ANNOT ---');
  const annotsMatches = str.match(/\/Annots\s*\[[^\]]+\]/g);
  console.log('/Annots matches in raw file:', annotsMatches);

  const uriMatches = str.match(/\/URI\s*\([^)]+\)/g);
  console.log('/URI matches in raw file:', uriMatches);

  const hexUriMatches = str.match(/\/URI\s*<[^>]+>/g);
  console.log('/URI hex matches in raw file:', hexUriMatches);
}

main().catch(console.error);
