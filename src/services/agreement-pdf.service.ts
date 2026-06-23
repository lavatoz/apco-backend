import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface AgreementData {
  clientName: string;
  eventName: string;
  eventDate: string;
  totalAmount: string;
  advanceAmount: string;
  balanceAmount: string;
  todayDate: string;
}

/**
 * Service to handle PDF generation based on a text template
 */
export async function generateAgreementPdf(data: AgreementData): Promise<Buffer> {
  // 1. Load the template content
  const templatePath = path.join(__dirname, '../templates/wedding-agreement.txt');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Agreement template file not found at: ${templatePath}`);
  }
  let content = fs.readFileSync(templatePath, 'utf8');

  // Replace non-WinAnsi characters to prevent encoding crashes
  content = content
    .replace(/●/g, '-')
    .replace(/₹/g, 'Rs. ');

  // 2. Perform placeholder replacements
  content = content
    .replace(/\{\{CLIENT_NAME\}\}/g, data.clientName)
    .replace(/\{\{EVENT_NAME\}\}/g, data.eventName)
    .replace(/\{\{EVENT_DATE\}\}/g, data.eventDate)
    .replace(/\{\{TOTAL_AMOUNT\}\}/g, data.totalAmount)
    .replace(/\{\{ADVANCE_AMOUNT\}\}/g, data.advanceAmount)
    .replace(/\{\{BALANCE_AMOUNT\}\}/g, data.balanceAmount)
    .replace(/\{\{TODAY_DATE\}\}/g, data.todayDate);

  // 3. Setup pdf-lib Document
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 612; // Letter width
  const pageHeight = 792; // Letter height
  const maxTextWidth = pageWidth - 2 * margin;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageIndex = 1;

  // Draw header and footer helper
  const drawPageDecorations = (p: any, idx: number) => {
    // Draw top thin gradient line look alike (using primary blue/amber tone)
    p.drawRectangle({
      x: margin,
      y: pageHeight - 35,
      width: maxTextWidth,
      height: 2,
      color: rgb(0.23, 0.51, 0.96), // APCO primary blue color
    });

    // Draw header text
    p.drawText('WEDDING PHOTOGRAPHY & VIDEOGRAPHY AGREEMENT', {
      x: margin,
      y: pageHeight - 30,
      size: 7,
      font: fontBold,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Draw footer text
    p.drawText(`Page ${idx}`, {
      x: pageWidth - margin - 35,
      y: 30,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    p.drawText('Securely Managed & Encrypted by Artisans Production Company', {
      x: margin,
      y: 30,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    });
  };

  // Draw first page decorations
  drawPageDecorations(page, pageIndex);

  // Helper to safely write lines of text and handle page breaks
  const writeLine = (text: string, isBold: boolean, fontSize: number, spacing: number) => {
    const font = isBold ? fontBold : fontRegular;
    const textHeight = fontSize;

    // Check if we exceed page height
    if (y - textHeight - spacing < margin + 15) {
      // Add new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      pageIndex++;
      y = pageHeight - margin;
      drawPageDecorations(page, pageIndex);
    }

    y -= textHeight + spacing;
    page.drawText(text, {
      x: margin,
      y: y,
      size: fontSize,
      font: font,
      color: rgb(0.1, 0.1, 0.1),
    });
  };

  // Split content by paragraphs
  const paragraphs = content.split('\n');

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      // Empty paragraph serves as empty line space
      writeLine('', false, 10, 4);
      continue;
    }

    // Determine typography styles
    let isTitle = false;
    let isHeading = false;
    let fontSize = 10;
    let lineSpacing = 4;

    if (trimmed === 'WEDDING PHOTOGRAPHY & VIDEOGRAPHY AGREEMENT') {
      isTitle = true;
      fontSize = 15;
      lineSpacing = 8;
    } else if (
      trimmed === 'EVENT DETAILS' ||
      trimmed === 'FINANCIAL DETAILS' ||
      trimmed === 'HOW WE WORK: SERVICE TERMS & CONDITIONS' ||
      /^\d+\.\s+/.test(trimmed)
    ) {
      isHeading = true;
      fontSize = 11;
      lineSpacing = 6;
    }

    const currentFont = isTitle || isHeading ? fontBold : fontRegular;

    // Perform word-wrapping
    const words = trimmed.split(' ');
    let currentLine = '';
    const wrappedLines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = currentFont.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxTextWidth) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }

    // Draw all wrapped lines for this paragraph
    for (let i = 0; i < wrappedLines.length; i++) {
      const lineText = wrappedLines[i];
      const textToDraw = lineText;

      const spacing = i === wrappedLines.length - 1 ? lineSpacing : 2;
      writeLine(textToDraw, isTitle || isHeading, fontSize, spacing);
    }
  }

  // 4. Save document to Buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
