import { PDFDocument, PDFName, PDFArray, PDFRef, StandardFonts, rgb, PDFString } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

async function testCombinedFix() {
  console.log('🧪 Testing combined fix (useObjectStreams: false + URI string preservation)...\n');

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

  // Encrypt with encryptPDF
  const encryptedBytes = await encryptPDF(uncompressedBytes, '', {
    algorithm: 'AES-256',
    ownerPassword: 'TestPassword123',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
    allowAnnotating: true,
  });

  // Preserve plaintext URI in encrypted PDF buffer
  let binaryStr = Buffer.from(encryptedBytes).toString('binary');
  const origBinaryStr = Buffer.from(uncompressedBytes).toString('binary');

  const uriMatches = origBinaryStr.match(/\/S\s*\/URI\s*\/URI\s*\(((?:[^()\\]|\\.)*)\)/g);
  if (uriMatches) {
    for (const match of uriMatches) {
      const urlExtract = match.match(/\/URI\s*\(((?:[^()\\]|\\.)*)\)/);
      if (urlExtract && urlExtract[1]) {
        const rawUrl = urlExtract[1];
        if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
          binaryStr = binaryStr.replace(/\/S\s*\/URI\s*\/URI\s*\((?:[^()\\]|\\.)*\)/g, `/S /URI /URI (${rawUrl})`);
        }
      }
    }
  }

  const finalBuffer = Buffer.from(binaryStr, 'binary');
  console.log(`Final Buffer Size: ${finalBuffer.length} bytes`);
  console.log(`Contains Plaintext URL in Final Buffer? ${finalBuffer.toString('binary').includes(targetUrl)}`);

  // Inspect with pdf-lib (without error)
  const inspectDoc = await PDFDocument.load(finalBuffer, { ignoreEncryption: true });
  const p = inspectDoc.getPages()[0];
  const annots = p.node.lookup(PDFName.of('Annots'), PDFArray);
  console.log(`Annots array size: ${annots?.size()}`);

  if (annots && annots.size() > 0) {
    let annotRef = annots.get(0);
    let annotObj: any = inspectDoc.context.lookup(annotRef);
    while (annotObj instanceof PDFRef) annotObj = inspectDoc.context.lookup(annotObj);

    let actionRef = annotObj.get(PDFName.of('A'));
    let actionObj: any = inspectDoc.context.lookup(actionRef);
    while (actionObj instanceof PDFRef) actionObj = inspectDoc.context.lookup(actionObj);

    console.log(`Subtype: ${annotObj.get(PDFName.of('Subtype'))?.toString()}`);
    console.log(`Rect: ${annotObj.get(PDFName.of('Rect'))?.toString()}`);
    console.log(`QuadPoints: ${annotObj.get(PDFName.of('QuadPoints'))?.toString()}`);
    console.log(`Flags (F): ${annotObj.get(PDFName.of('F'))?.toString()}`);
    console.log(`URI Action: ${actionObj.get(PDFName.of('URI'))?.toString()}`);
  }
}

testCombinedFix().catch(console.error);
