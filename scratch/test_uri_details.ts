import { PDFDocument, PDFName } from 'pdf-lib';
import { securePdfDocument } from '../src/services/pdf-security.service';

async function testUriEncryption() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);

  const linkUrl = 'https://verify.apco.com/verify/AK-DOC-2026-000009';
  
  // Create URI action
  const uriAction = pdfDoc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: linkUrl,
  });

  const linkAnnot = pdfDoc.context.register(
    pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [40, 100, 200, 120],
      Border: [0, 0, 0],
      C: [0, 0, 0],
      F: 4,
      H: 'I',
      A: uriAction,
    })
  );

  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkAnnot]));

  const rawBytes = await pdfDoc.save();
  const rawStr = Buffer.from(rawBytes).toString('utf-8');
  console.log('=== RAW UNENCRYPTED PDF ===');
  console.log(rawStr);

  const { securedBuffer } = await securePdfDocument(Buffer.from(rawBytes), { encrypt: true, password: '123' });
  const encStr = securedBuffer.toString('latin1');
  console.log('=== RAW ENCRYPTED PDF ===');
  console.log(encStr);
}

testUriEncryption().catch(console.error);
