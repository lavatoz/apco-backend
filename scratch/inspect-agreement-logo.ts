import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const filePath = 'C:\\Users\\joeln\\.gemini\\antigravity-ide\\brain\\da2ca056-1c77-4f2a-b5d1-e5d27170ab1f\\media__1782397233498.png';
  const data = fs.readFileSync(filePath);
  const logoEmbed = await pdfDoc.embedPng(data);
  console.log('Logo dimensions:', logoEmbed.width, 'x', logoEmbed.height);
}

main().catch(console.error);
