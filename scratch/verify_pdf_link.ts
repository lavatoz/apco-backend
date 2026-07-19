import fs from 'fs';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';

async function main() {
  const filePath = 'uploads/quotations/pdfs/Quotation_AK-QUO-2026-0001_joel.pdf';
  console.log(`Verifying PDF at: ${filePath}`);

  const pdfBuffer = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  console.log(`Total Pages: ${pages.length}`);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    console.log(`\n--- Page ${i + 1} Annotations ---`);

    // Lookup the Annots array
    const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
    if (!annots) {
      console.log('No annotations array found on this page.');
      continue;
    }

    console.log(`Found ${annots.size()} annotation(s)`);

    for (let j = 0; j < annots.size(); j++) {
      const annotRef = annots.get(j);
      const annot = pdfDoc.context.lookup(annotRef) as any;

      if (!annot) {
        console.log(`Annotation ${j + 1} is null/undefined.`);
        continue;
      }

      const type = annot.get(PDFName.of('Type'))?.toString();
      const subtype = annot.get(PDFName.of('Subtype'))?.toString();
      const rect = annot.get(PDFName.of('Rect'))?.toString();

      console.log(`Annotation ${j + 1}: Type=${type}, Subtype=${subtype}, Rect=${rect}`);

      // If it's a Link subtype, print its action details
      if (subtype === '/Link') {
        const actionRef = annot.get(PDFName.of('A'));
        if (actionRef) {
          const action = pdfDoc.context.lookup(actionRef) as any;
          const s = action.get(PDFName.of('S'))?.toString();
          const uri = action.get(PDFName.of('URI'))?.toString();
          console.log(`  Link Action S=${s}, URI=${uri}`);
        }
      }
    }
  }
}

main().catch(console.error);
