import fs from 'fs';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

const encryptJsPath = 'node_modules/@pdfsmaller/pdf-encrypt/dist/pdf-encrypt.js';
let code = fs.readFileSync(encryptJsPath, 'utf-8');

code = code.replace(
  "if (keyName !== '/Length' && keyName !== '/Filter' && keyName !== '/DecodeParms')",
  "if (keyName !== '/Length' && keyName !== '/Filter' && keyName !== '/DecodeParms' && keyName !== '/URI')"
);
fs.writeFileSync(encryptJsPath, code, 'utf-8');
console.log('Successfully patched dist/pdf-encrypt.js!');

// Now require after patching
const { encryptPDF } = require('@pdfsmaller/pdf-encrypt');

async function testPatchedPdfEncrypt() {
  const url = 'https://verify.apco.com/verify/AK-DOC-2026-000009';

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.node.set(PDFName.of('Annots'), doc.context.obj([
    doc.context.register(doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [40, 100, 200, 120],
      Border: [0, 0, 0],
      C: [0, 0, 0],
      F: 4,
      H: 'I',
      A: doc.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(url),
      }),
    }))
  ]));

  const bytes = await doc.save();
  const encBytes = await encryptPDF(bytes, 'user123', {
    algorithm: 'AES-256',
    ownerPassword: 'owner123',
    allowCopying: false,
    allowModifying: false,
    allowPrinting: true,
  });

  fs.writeFileSync('scratch/pdf_scenario_B_patched.pdf', encBytes);
  console.log('Saved scratch/pdf_scenario_B_patched.pdf');

  const str = Buffer.from(encBytes).toString('latin1');
  console.log('Scenario B /URI line in raw file:');
  console.log(str.match(/\/URI\s*.*$/m)?.[0]);
}

testPatchedPdfEncrypt().catch(console.error);
