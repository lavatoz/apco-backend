import { PDFDocument, StandardFonts } from 'pdf-lib';

async function inspectCoordinates() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const verificationUrl = 'https://verify.artisains.com/verify/AK-DOC-2026-000009';
  const fontSize = 7.5;
  const margin = 40;
  const yStart = 108; // for hasBlackFooter: true

  const textX = margin;
  const textY = yStart;

  const textWidth = font.widthOfTextAtSize(verificationUrl, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  // Exact Text Bounding Box (accounting for baseline yStart)
  // Base line is textY. Descenders extend ~1.5pt below baseline. Ascenders extend font.heightAtSize above baseline.
  const exactLlx = textX;
  const exactLly = textY - 2.0; // padded below baseline
  const exactUrx = textX + textWidth;
  const exactUry = textY + textHeight + 1.0; // padded above ascender

  // Current Annotation Rect in code
  const currentLinkX = margin;
  const currentLinkY = yStart - 2.0;
  const currentLinkWidth = textWidth + 4.0;
  const currentLinkHeight = textHeight + 4.0;

  const currentRect = [
    currentLinkX,
    currentLinkY,
    currentLinkX + currentLinkWidth,
    currentLinkY + currentLinkHeight
  ];

  const exactRect = [
    exactLlx,
    exactLly,
    exactUrx,
    exactUry
  ];

  console.log('=== TASK 1 & 2: drawText() Parameters ===');
  console.log(`Rendered Text String: "${verificationUrl}"`);
  console.log(`x (textX):             ${textX}`);
  console.log(`y (textY / Baseline): ${textY}`);
  console.log(`Font Size:            ${fontSize}`);
  console.log(`Text Width:           ${textWidth}`);
  console.log(`Text Height:          ${textHeight}`);

  console.log('\n=== TASK 3: Current Annotation Rectangle ===');
  console.log(`Current Rect [x1, y1, x2, y2]: [ ${currentRect.join(', ')} ]`);

  console.log('\n=== TASK 4: Overlay & Alignment Comparison ===');
  console.log(`Exact Rendered Text Box [llx, lly, urx, ury]: [ ${exactRect.join(', ')} ]`);
  console.log(`Horizontal Overhang / Shift: linkX starts at ${currentLinkX}, text starts at ${textX}. linkWidth is ${currentLinkWidth} vs textWidth ${textWidth} (+4pt padding offset on urx)`);
  console.log(`Vertical Alignment: text baseline is ${textY}. Text top is ${textY + textHeight}. Current Rect top is ${currentLinkY + currentLinkHeight} (${currentRect[3]}). Exact Text top is ${exactUry}.`);

  console.log('\n=== TASK 5: Recommendation for Exact Fit ===');
  console.log(`Proposed Rect: [ ${exactLlx}, ${exactLly}, ${exactLlx + textWidth}, ${exactLly + textHeight + 3.0} ]`);
  console.log(`Proposed QuadPoints: [ ${exactLlx}, ${exactLly + textHeight + 3.0}, ${exactLlx + textWidth}, ${exactLly + textHeight + 3.0}, ${exactLlx}, ${exactLly}, ${exactLlx + textWidth}, ${exactLly} ]`);
}

inspectCoordinates().catch(console.error);
