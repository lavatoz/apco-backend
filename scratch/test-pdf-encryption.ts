import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import fs from 'fs';
import path from 'path';
const pdfParse = require('pdf-parse');

async function testEncryption() {
  console.log('🏁 Creating a simple PDF using pdf-lib...');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  page.drawText('APCO Confidential Encrypted Document', {
    x: 50,
    y: 300,
    size: 24,
    font,
    color: rgb(0.1, 0.2, 0.8),
  });

  const pdfBytes = await pdfDoc.save();
  console.log('📄 Original PDF size:', pdfBytes.length, 'bytes');

  console.log('🔒 Encrypting PDF using @pdfsmaller/pdf-encrypt (AES-256)...');
  const password = 'ApcoPassword123!';
  const encryptedBytes = await encryptPDF(new Uint8Array(pdfBytes), password, {
    algorithm: 'AES-256',
  });
  console.log('🔒 Encrypted PDF size:', encryptedBytes.length, 'bytes');

  const outputPath = path.join(__dirname, 'encrypted-test.pdf');
  fs.writeFileSync(outputPath, Buffer.from(encryptedBytes));
  console.log(`💾 Saved encrypted PDF to ${outputPath}`);

  // Programmatic verification: check for '/Encrypt' dictionary in raw string
  const rawContent = fs.readFileSync(outputPath, 'utf8');
  const hasEncryptDict = rawContent.includes('/Encrypt');
  console.log(`🔍 PDF contains /Encrypt dictionary: ${hasEncryptDict}`);

  // Try parsing with pdf-parse without password (should throw or fail to extract text)
  try {
    const data = await pdfParse(fs.readFileSync(outputPath));
    console.log('🔓 pdf-parse read attempt (no password) succeeded?! Text extracted:', data.text.trim());
  } catch (err: any) {
    console.log('🔒 pdf-parse successfully blocked reading (threw expected error):', err.message || err);
  }

  console.log('✅ PDF encryption execution finished successfully.');
}

testEncryption().catch((err) => {
  console.error('❌ Encryption test failed:', err);
  process.exit(1);
});
