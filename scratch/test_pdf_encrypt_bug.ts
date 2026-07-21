import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

async function testPdfEncryptBug() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);

  const url = 'https://verify.apco.com/verify/AK-DOC-2026-000009';

  // Correct PDFString.of
  const uriAction = pdfDoc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of(url),
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

  const unencryptedBytes = await pdfDoc.save();
  const unencryptedStr = Buffer.from(unencryptedBytes).toString('utf-8');
  console.log('=== UNENCRYPTED RAW PDF ===');
  console.log(unencryptedStr);

  // Encrypt using @pdfsmaller/pdf-encrypt
  const encryptedUint8 = await encryptPDF(unencryptedBytes, 'user123', {
    algorithm: 'AES-256',
    ownerPassword: 'owner123',
    allowCopying: false,
    allowModifying: false,
    allowPrinting: true,
  });

  const encryptedStr = Buffer.from(encryptedUint8).toString('latin1');
  console.log('=== ENCRYPTED RAW PDF (@pdfsmaller/pdf-encrypt) ===');
  console.log(encryptedStr);
}

testPdfEncryptBug().catch(console.error);
