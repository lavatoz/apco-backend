import { PDFDocument, PDFName, PDFArray, PDFRef, StandardFonts, rgb, PDFString } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

async function testObjectStreams() {
  console.log('🧪 Testing PDF generation with useObjectStreams: false...\n');

  // 1. Create PDF with link annotation and save with useObjectStreams: false
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const targetUrl = 'https://verify.artisains.com/verify/AK-DOC-2026-000009';

  page.drawText('Verify this document:', { x: 50, y: 750, size: 10, font });
  page.drawText(targetUrl, { x: 50, y: 730, size: 10, font, color: rgb(0, 0.4, 0.8) });

  const { context } = pdfDoc;
  const uriAction = context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of(targetUrl),
  });

  const linkAnnot = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 725, 450, 745],
      Border: [0, 0, 0],
      C: [0, 0, 0],
      F: 4,
      H: 'I',
      A: uriAction,
      QuadPoints: [50, 745, 450, 745, 50, 725, 450, 725],
    })
  );

  page.node.set(PDFName.of('Annots'), context.obj([linkAnnot]));

  // Save with useObjectStreams: false
  const uncompressedBytes = await pdfDoc.save({ useObjectStreams: false });
  console.log(`Uncompressed PDF Size: ${uncompressedBytes.length} bytes`);
  console.log(`Contains Plaintext URL before encryption? ${Buffer.from(uncompressedBytes).toString('binary').includes(targetUrl)}`);

  // Now encrypt with encryptPDF
  const encryptedBytes = await encryptPDF(uncompressedBytes, '', {
    algorithm: 'AES-256',
    ownerPassword: 'TestPassword123',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
    allowAnnotating: true,
  });

  console.log(`Encrypted PDF Size: ${encryptedBytes.length} bytes`);

  // Inspect encrypted PDF with pdf-lib
  const encryptedDoc = await PDFDocument.load(encryptedBytes, { ignoreEncryption: true });
  const p = encryptedDoc.getPages()[0];
  const annots = p.node.lookup(PDFName.of('Annots'), PDFArray);
  console.log(`Annots array size: ${annots?.size()}`);

  if (annots && annots.size() > 0) {
    let annotRef = annots.get(0);
    let annotObj: any = encryptedDoc.context.lookup(annotRef);
    while (annotObj instanceof PDFRef) annotObj = encryptedDoc.context.lookup(annotObj);

    let actionRef = annotObj.get(PDFName.of('A'));
    let actionObj: any = encryptedDoc.context.lookup(actionRef);
    while (actionObj instanceof PDFRef) actionObj = encryptedDoc.context.lookup(actionObj);

    console.log(`Subtype: ${annotObj.get(PDFName.of('Subtype'))?.toString()}`);
    console.log(`Rect: ${annotObj.get(PDFName.of('Rect'))?.toString()}`);
    console.log(`QuadPoints: ${annotObj.get(PDFName.of('QuadPoints'))?.toString()}`);
    console.log(`Flags (F): ${annotObj.get(PDFName.of('F'))?.toString()}`);
    console.log(`URI Action: ${actionObj.get(PDFName.of('URI'))?.toString()}`);
  }
}

testObjectStreams().catch(console.error);
