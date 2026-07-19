import { PDFDocument, PDFPage, pushGraphicsState, popGraphicsState, clip, endPath, rectangle } from 'pdf-lib';
import { apcoFooterBase64 } from './default-logo';
// @ts-ignore
import { PNG } from 'pngjs';

/**
 * Loads the APCO family branding footer image and embeds it into the PDF document.
 */
export async function loadFooterImage(pdfDoc: PDFDocument): Promise<any> {
  try {
    const matches = apcoFooterBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1].toLowerCase();
      const base64Data = matches[2];
      const footerBuffer = Buffer.from(base64Data, 'base64');
      if (ext === 'png') {
        return await pdfDoc.embedPng(footerBuffer);
      } else if (ext === 'jpg' || ext === 'jpeg') {
        return await pdfDoc.embedJpg(footerBuffer);
      }
    }
  } catch (err) {
    console.error('Failed to load footer image:', err);
  }
  return null;
}

/**
 * Draws the APCO family branding footer centered horizontally at the bottom of the page.
 */
export function drawBrandingFooter(
  page: PDFPage,
  footerEmbed: any,
  pageWidth: number,
  contentWidth: number
): void {
  if (!footerEmbed) return;
  void pageWidth;
  void contentWidth;

  const actualPageWidth = page.getWidth();

  // Load and parse the PNG from base64 data to inspect bounds dynamically
  let contentMinX = 0;
  let contentMaxX = footerEmbed.width - 1;
  let contentMinY = 0;
  void contentMinY;
  let contentMaxY = footerEmbed.height - 1;

  try {
    const matches = apcoFooterBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (matches) {
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const png = PNG.sync.read(buffer);

      // Find the actual bounds of non-transparent and non-white/light pixels
      let foundMinX = png.width;
      let foundMaxX = -1;
      let foundMinY = png.height;
      let foundMaxY = -1;

      for (let x = 0; x < png.width; x++) {
        for (let y = 0; y < png.height; y++) {
          const idx = (png.width * y + x) << 2;
          const r = png.data[idx];
          const g = png.data[idx+1];
          const b = png.data[idx+2];
          const a = png.data[idx+3];

          // Content pixel condition: not fully transparent, and not white/light padding
          if (a > 50 && (r < 180 || g < 180 || b < 180)) {
            if (x < foundMinX) foundMinX = x;
            if (x > foundMaxX) foundMaxX = x;
            if (y < foundMinY) foundMinY = y;
            if (y > foundMaxY) foundMaxY = y;
          }
        }
      }

      if (foundMaxX >= foundMinX && foundMaxY >= foundMinY) {
        contentMinX = foundMinX;
        contentMaxX = foundMaxX;
        contentMinY = foundMinY;
        contentMaxY = foundMaxY;
      }
    }
  } catch (err) {
    console.error('Failed to parse footer image bounds dynamically:', err);
  }

  // Calculate the scale and ratios dynamically
  const contentWidthInImage = contentMaxX - contentMinX + 1;
  const bottomTransparentRatio = (footerEmbed.height - 1 - contentMaxY) / footerEmbed.height;

  // Keep original footerHeight calculation to keep the footer height exactly the same
  const originalFooterWidth = actualPageWidth - 40; // pageWidth - 2 * 20
  const originalScaleFactor = originalFooterWidth / footerEmbed.width;
  const footerHeight = footerEmbed.height * originalScaleFactor * 0.7;

  const bottomTransparentHeight = footerHeight * bottomTransparentRatio;
  const footerY = 5 - bottomTransparentHeight;

  // Clip the rendering bounds to [0, actualPageWidth] and [footerY, footerY + footerHeight]
  page.pushOperators(
    pushGraphicsState(),
    rectangle(0, footerY, actualPageWidth, footerHeight),
    clip(),
    endPath()
  );

  // Draw the footer image scaled so the black banner starts exactly at x=0 and ends at x=actualPageWidth
  const drawWidth = actualPageWidth * (footerEmbed.width / contentWidthInImage);
  const drawX = -actualPageWidth * (contentMinX / contentWidthInImage);

  // Maintain aspect ratio for height
  const drawHeight = drawWidth * (footerEmbed.height / footerEmbed.width);
  const drawBottomTransparentHeight = drawHeight * bottomTransparentRatio;
  const drawY = 5 - drawBottomTransparentHeight;

  page.drawImage(footerEmbed, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
  });

  page.pushOperators(popGraphicsState());
}

/**
 * Applies the APCO branding footer across all pages of a PDF document.
 */
export function applyBrandingFooterToDoc(
  pdfDoc: PDFDocument,
  footerEmbed: any,
  pageWidth: number,
  contentWidth: number
): void {
  if (!footerEmbed) return;
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    drawBrandingFooter(page, footerEmbed, pageWidth, contentWidth);
  }
}

import { StandardFonts, rgb } from 'pdf-lib';

/**
 * Draws the verification link immediately above the branded black footer or the standard page footer.
 */
export async function applyVerificationFooterToDoc(
  pdfDoc: PDFDocument,
  verificationUrl: string,
  options?: { hasBlackFooter?: boolean; margin?: number }
): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const textColor = rgb(107 / 255, 114 / 255, 128 / 255); // #6B7280
  
  const hasBlackFooter = options?.hasBlackFooter ?? false;
  const margin = options?.margin ?? 40;
  
  const yStart = hasBlackFooter ? 108 : 53;

  for (const page of pages) {
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
  }
}

