import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import fs from 'fs';

async function testUriDecryptionFix() {
  const url = 'https://verify.apco.com/verify/AK-DOC-2026-000009';

  const docA = await PDFDocument.create();
  const pageA = docA.addPage([612, 792]);
  pageA.node.set(PDFName.of('Annots'), docA.context.obj([
    docA.context.register(docA.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [40, 100, 200, 120],
      Border: [0, 0, 0],
      C: [0, 0, 0],
      F: 4,
      H: 'I',
      A: docA.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(url),
      }),
    }))
  ]));
  const bytesA = await docA.save();
  const encBytesA = await encryptPDF(bytesA, 'user123', {
    algorithm: 'AES-256',
    ownerPassword: 'owner123',
    allowCopying: false,
    allowModifying: false,
    allowPrinting: true,
  });
  fs.writeFileSync('scratch/pdf_scenario_A_buggy.pdf', encBytesA);
  console.log('Saved scratch/pdf_scenario_A_buggy.pdf');

  const strA = Buffer.from(encBytesA).toString('latin1');
  console.log('Scenario A /URI line in raw file:');
  console.log(strA.match(/\/URI\s*.*$/m)?.[0]);
}

testUriDecryptionFix().catch(console.error);
