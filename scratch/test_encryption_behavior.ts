import { PDFDocument, PDFName, PDFArray, PDFRef, StandardFonts, rgb, PDFString } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

async function testEncryptionAlgorithms() {
  console.log('🧪 Testing PDF encryption behavior on Link Annotations (/URI)...\n');

  // 1. Create a simple PDF with a link annotation using pdf-lib
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

  const rawBytes = await pdfDoc.save();
  console.log(`Base Unencrypted PDF size: ${rawBytes.length} bytes`);

  async function inspectPdfUri(pdfBuffer: Buffer, label: string) {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const p = doc.getPages()[0];
    const annots = p.node.lookup(PDFName.of('Annots'), PDFArray);
    if (!annots) {
      console.log(`[${label}] No annots found.`);
      return;
    }
    const annotRef = annots.get(0);
    let annotObj: any = doc.context.lookup(annotRef);
    while (annotObj instanceof PDFRef) annotObj = doc.context.lookup(annotObj);
    
    let actionRef = annotObj.get(PDFName.of('A'));
    let actionObj: any = doc.context.lookup(actionRef);
    while (actionObj instanceof PDFRef) actionObj = doc.context.lookup(actionObj);

    const uriStr = actionObj.get(PDFName.of('URI'))?.toString();
    console.log(`[${label}] URI String: ${uriStr}`);
  }

  await inspectPdfUri(Buffer.from(rawBytes), '1. Unencrypted PDF');

  // Test 2: AES-256 with empty user password
  const aesBytes = await encryptPDF(rawBytes, '', {
    algorithm: 'AES-256',
    ownerPassword: 'TestPassword123',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
    allowAnnotating: true,
  });
  await inspectPdfUri(Buffer.from(aesBytes), '2. AES-256 Encrypted (Empty User Pass)');

  // Test 3: RC4 128-bit with empty user password
  const rc4Bytes = await encryptPDF(rawBytes, '', {
    algorithm: 'RC4',
    ownerPassword: 'TestPassword123',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
    allowAnnotating: true,
  });
  await inspectPdfUri(Buffer.from(rc4Bytes), '3. RC4 128-bit Encrypted (Empty User Pass)');
}

testEncryptionAlgorithms().catch(console.error);
