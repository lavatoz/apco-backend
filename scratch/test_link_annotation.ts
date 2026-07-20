import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFString } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function testLink() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const verificationUrl = 'https://verify.artisains.com/verify/AK-DOC-2026-000001';
  const margin = 40;
  const yStart = 108;
  const textColor = rgb(107 / 255, 114 / 255, 128 / 255);

  page.drawText('Verify this document:', {
    x: margin,
    y: yStart + 10.5,
    size: 7.5,
    font: font,
    color: textColor,
  });

  page.drawText(verificationUrl, {
    x: margin,
    y: yStart,
    size: 7.5,
    font: font,
    color: textColor,
  });

  const textWidth = font.widthOfTextAtSize(verificationUrl, 7.5);
  const textHeight = font.heightAtSize(7.5);

  const linkX = margin;
  const linkY = yStart - 2;
  const linkWidth = textWidth + 4;
  const linkHeight = textHeight + 4;

  const { context } = pdfDoc;

  const uriAction = context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of(verificationUrl),
  });

  const linkAnnotation = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [linkX, linkY, linkX + linkWidth, linkY + linkHeight],
      Border: [0, 0, 0],
      C: [0, 0, 0],
      F: 4,
      H: 'I',
      A: uriAction,
      QuadPoints: [
        linkX, linkY + linkHeight,
        linkX + linkWidth, linkY + linkHeight,
        linkX, linkY,
        linkX + linkWidth, linkY
      ]
    })
  );

  const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray);
  if (annotations) {
    annotations.push(linkAnnotation);
  } else {
    page.node.set(PDFName.of('Annots'), context.obj([linkAnnotation]));
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.resolve(process.cwd(), 'scratch/test_output.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Saved test PDF to: ${outputPath}`);

  // Now reload and inspect
  const reloadedDoc = await PDFDocument.load(pdfBytes);
  const reloadedPage = reloadedDoc.getPages()[0];
  const annots = reloadedPage.node.lookup(PDFName.of('Annots'), PDFArray);
  console.log('Annots count:', annots?.size());
  if (annots && annots.size() > 0) {
    const annotRef = annots.get(0);
    const annotObj: any = reloadedDoc.context.lookup(annotRef);
    console.log('Annot Subtype:', annotObj.get(PDFName.of('Subtype'))?.toString());
    console.log('Annot Rect:', annotObj.get(PDFName.of('Rect'))?.toString());
    console.log('Annot F:', annotObj.get(PDFName.of('F'))?.toString());
    console.log('Annot A:', annotObj.get(PDFName.of('A'))?.toString());
    const actionObj: any = reloadedDoc.context.lookup(annotObj.get(PDFName.of('A')));
    console.log('Action URI:', actionObj?.get(PDFName.of('URI'))?.toString());
  }
}

testLink().catch(console.error);
