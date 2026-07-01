import { PDFDocument, PDFPage } from 'pdf-lib';
import { apcoFooterBase64 } from './default-logo';

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
  const footerMargin = 20; // reduced left/right margin
  const footerWidth = pageWidth - 2 * footerMargin;
  void contentWidth; // prevent TS6133 unused parameter error
  const scaleFactor = footerWidth / footerEmbed.width;
  const footerHeight = footerEmbed.height * scaleFactor * 0.7; // 30% height reduction
  const footerX = (pageWidth - footerWidth) / 2;
  const bottomTransparentRatio = 227 / 576;
  const bottomTransparentHeight = footerHeight * bottomTransparentRatio;
  const footerY = 5 - bottomTransparentHeight; // safe bottom margin for visible banner
  page.drawImage(footerEmbed, {
    x: footerX,
    y: footerY,
    width: footerWidth,
    height: footerHeight,
  });
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
