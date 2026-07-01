import { PDFDocument } from 'pdf-lib';
import { apcoFooterBase64 } from '../src/services/default-logo';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const matches = apcoFooterBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (matches) {
    const ext = matches[1].toLowerCase();
    const base64Data = matches[2];
    const footerBuffer = Buffer.from(base64Data, 'base64');
    let footerEmbed;
    if (ext === 'png') {
      footerEmbed = await pdfDoc.embedPng(footerBuffer);
    } else {
      footerEmbed = await pdfDoc.embedJpg(footerBuffer);
    }
    console.log('Footer image dimensions:', footerEmbed.width, 'x', footerEmbed.height);
    const contentWidth = 612 - 2 * 40; // 532
    const scaleFactor = contentWidth / footerEmbed.width;
    const footerHeight = footerEmbed.height * scaleFactor * 0.7;
    console.log('Scale factor:', scaleFactor);
    console.log('Resulting footer height:', footerHeight);
  } else {
    console.log('No base64 match');
  }
}

main().catch(console.error);
