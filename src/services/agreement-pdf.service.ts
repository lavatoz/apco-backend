import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface AgreementData {
  clientName: string;
  brideName: string;
  groomName: string;
  eventName: string;
  eventDate: string;
  venue: string;
  totalAmount: string;
  advanceAmount: string;
  balanceAmount: string;
  todayDate: string;
  quotationNumber: string;
  invoiceNumber: string;
  companyName: string;
  companyTagline?: string;
  companyLogoUrl?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  primaryColor?: string;
  templateVersion?: string;
}

/**
 * Resolves path to template and asset files supporting ts-node and dist runtime.
 */
function getAssetPath(relativePath: string): string {
  const path1 = path.join(__dirname, relativePath);
  if (fs.existsSync(path1)) return path1;
  const path2 = path.join(__dirname, '../../src', relativePath.replace('../', ''));
  if (fs.existsSync(path2)) return path2;
  return path1;
}

const parseHexColor = (hex: string | undefined): any => {
  if (!hex) return rgb(0.23, 0.51, 0.96); // Default APCO blue
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0.23 : r, isNaN(g) ? 0.51 : g, isNaN(b) ? 0.96 : b);
};

/**
 * Service to handle PDF generation based on a text template
 */
export async function generateAgreementPdf(data: AgreementData): Promise<Buffer> {
  // 1. Load the template content
  const templatePath = getAssetPath('../templates/wedding-agreement.txt');
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
    .replace(/\{\{\s*CLIENT_NAME\s*\}\}/gi, data.clientName)
    .replace(/\{\{\s*EVENT_NAME\s*\}\}/gi, data.eventName)
    .replace(/\{\{\s*EVENT_DATE\s*\}\}/gi, data.eventDate)
    .replace(/\{\{\s*TOTAL_AMOUNT\s*\}\}/gi, data.totalAmount)
    .replace(/\{\{\s*ADVANCE_AMOUNT\s*\}\}/gi, data.advanceAmount)
    .replace(/\{\{\s*BALANCE_AMOUNT\s*\}\}/gi, data.balanceAmount)
    .replace(/\{\{\s*TODAY_DATE\s*\}\}/gi, data.todayDate);

  try {
    fs.appendFileSync(
      path.join(process.cwd(), 'pdf-debug.log'),
      `[${new Date().toISOString()}] [generateAgreementPdf] Called with:\n` +
      `  data: ${JSON.stringify(data, null, 2)}\n` +
      `  Content after replacement (first 800 chars):\n${content.slice(0, 800)}\n` +
      `  Does content contain CLIENT_NAME? ${content.includes('CLIENT_NAME')}\n` +
      `  Does content contain %i? ${content.includes('%i')}\n\n`
    );
  } catch (err) {
    console.error('Failed to write pdf-debug.log:', err);
  }

  // 3. Setup pdf-lib Document
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const pageWidth = 612; // Letter width
  const pageHeight = 792; // Letter height
  const maxTextWidth = pageWidth - 2 * margin;

  // Load company logo dynamically (with fallback to default logo.png)
  let logoEmbed: any = null;
  if (data.companyLogoUrl) {
    try {
      let buffer: Buffer | null = null;
      let isPng = false;

      let logoPath = data.companyLogoUrl;
      if (!logoPath.startsWith('data:') && !logoPath.startsWith('http://') && !logoPath.startsWith('https://')) {
        if (!fs.existsSync(logoPath)) {
          const resolvedPath = path.resolve(process.cwd(), logoPath.replace(/^\//, ''));
          if (fs.existsSync(resolvedPath)) {
            logoPath = resolvedPath;
          }
        }
      }

      if (logoPath.startsWith('data:image/')) {
        const matches = logoPath.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1].toLowerCase();
          const base64Data = matches[2];
          buffer = Buffer.from(base64Data, 'base64');
          if (ext === 'png') {
            isPng = true;
          }
        }
      } else if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
        const response = await fetch(logoPath);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          if (logoPath.toLowerCase().includes('.png')) {
            isPng = true;
          }
        }
      } else if (fs.existsSync(logoPath)) {
        buffer = fs.readFileSync(logoPath);
        if (logoPath.toLowerCase().endsWith('.png')) {
          isPng = true;
        }
      }

      if (buffer) {
        if (isPng) {
          logoEmbed = await pdfDoc.embedPng(buffer);
        } else {
          logoEmbed = await pdfDoc.embedJpg(buffer);
        }
      }
    } catch (logoErr) {
      console.error('Failed to embed dynamic logo:', logoErr);
    }
  }

  if (!logoEmbed) {
    const logoPath = getAssetPath('../templates/logo.png');
    if (fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoEmbed = await pdfDoc.embedPng(logoBuffer);
      } catch (logoErr) {
        console.error('Failed to embed fallback logo:', logoErr);
      }
    }
  }

  const logoWidth = 60;
  const logoHeight = 48; // maintains 1024x819 aspect ratio

  const brandColor = parseHexColor(data.primaryColor);

  // Draw header and footer helper
  const drawPageDecorations = (p: any, idx: number) => {
    // 1. Accent Bar on the right edge
    const accentWidth = 8;
    
    // Top segment (brand color)
    p.drawRectangle({
      x: pageWidth - accentWidth,
      y: pageHeight - 120,
      width: accentWidth,
      height: 120,
      color: brandColor,
    });
    
    // Bottom segment (dark slate)
    p.drawRectangle({
      x: pageWidth - accentWidth,
      y: 0,
      width: accentWidth,
      height: pageHeight - 120,
      color: rgb(0.08, 0.09, 0.12),
    });

    // 2. Header elements on later pages
    if (idx > 1) {
      // Draw top line
      p.drawLine({
        start: { x: margin, y: pageHeight - 78 },
        end: { x: pageWidth - margin - 15, y: pageHeight - 78 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Draw header text
      p.drawText('WEDDING PHOTOGRAPHY & VIDEOGRAPHY AGREEMENT', {
        x: margin,
        y: pageHeight - 55,
        size: 7,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Draw logo in the top-right corner if loaded
      if (logoEmbed) {
        p.drawImage(logoEmbed, {
          x: pageWidth - margin - logoWidth - 15,
          y: pageHeight - 75,
          width: logoWidth,
          height: logoHeight,
        });
      }
    }

    // 3. Footer line and details on all pages
    p.drawLine({
      start: { x: margin, y: 45 },
      end: { x: pageWidth - margin - 15, y: 45 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    // Draw footer text
    p.drawText(`Page ${idx}`, {
      x: pageWidth - margin - 50,
      y: 30,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    const sanitizedBrandName = data.companyName.replace(/\n/g, ' ');
    p.drawText(`Securely Managed & Encrypted by ${sanitizedBrandName} | DEBUG BUILD: BACKEND_PROJECT_2026-06-25 18:45`, {
      x: margin,
      y: 30,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    });
  };

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let pageIndex = 1;
  drawPageDecorations(page, pageIndex);

  // --- DRAW PAGE 1 PREMIUM HEADER BLOCK ---
  // Title on the top left
  page.drawText('WEDDING PHOTOGRAPHY\n& VIDEOGRAPHY AGREEMENT', {
    x: margin,
    y: pageHeight - 70,
    size: 13,
    font: fontBold,
    color: brandColor,
    lineHeight: 16,
  });

  // Version and Date metadata on the left below the title
  page.drawText(`Version: ${data.templateVersion || '1.0'}`, {
    x: margin,
    y: pageHeight - 110,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`Date: ${data.todayDate}`, {
    x: margin,
    y: pageHeight - 122,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Logo on the top right
  if (logoEmbed) {
    page.drawImage(logoEmbed, {
      x: pageWidth - margin - logoWidth - 15,
      y: pageHeight - 75,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Draw company details below logo (right-aligned)
  let detailY = pageHeight - 85;
  if (logoEmbed) {
    detailY = pageHeight - 130;
  }
  const drawTextRight = (text: string, yPos: number, fontSize: number, font: any, color = rgb(0.3, 0.3, 0.3)) => {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: pageWidth - margin - textWidth - 15,
      y: yPos,
      size: fontSize,
      font: font,
      color: color,
    });
  };

  const brandingLines = data.companyName.split('\n');
  for (const line of brandingLines) {
    drawTextRight(line, detailY, 8, fontBold, rgb(0.15, 0.15, 0.15));
    detailY -= 10;
  }
  if (data.companyTagline) {
    drawTextRight(data.companyTagline, detailY, 7.5, fontOblique, rgb(0.4, 0.4, 0.4));
    detailY -= 9;
  }
  if (data.companyPhone) {
    drawTextRight(`Phone: ${data.companyPhone}`, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
    detailY -= 9;
  }
  if (data.companyEmail) {
    drawTextRight(`Email: ${data.companyEmail}`, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
    detailY -= 9;
  }
  if (data.companyAddress) {
    const addrLines = data.companyAddress.split('\n');
    for (const addrLine of addrLines) {
      drawTextRight(addrLine, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
      detailY -= 9;
    }
  }

  // --- DRAW PREMIUM INFORMATION BOX GRID ---
  const boxTopY = Math.min(detailY - 15, pageHeight - 195);
  const boxHeight = 105;
  const boxBottomY = boxTopY - boxHeight;

  page.drawRectangle({
    x: margin,
    y: boxBottomY,
    width: maxTextWidth - 15,
    height: boxHeight,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.86, 0.88),
    borderWidth: 0.75,
  });

  // Draw Grid Titles
  const col1X = margin + 15;
  const col2X = margin + 175;
  const col3X = margin + 335;

  const titleY = boxTopY - 15;
  page.drawText('CLIENT DETAILS', { x: col1X, y: titleY, size: 7.5, font: fontBold, color: brandColor });
  page.drawText('EVENT & LOGISTICS', { x: col2X, y: titleY, size: 7.5, font: fontBold, color: brandColor });
  page.drawText('FINANCIAL SUMMARY', { x: col3X, y: titleY, size: 7.5, font: fontBold, color: brandColor });

  // Grid Values Helper
  const drawGridValue = (label: string, val: string, xPos: number, yPos: number) => {
    page.drawText(label, { x: xPos, y: yPos, size: 7.5, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    const labelWidth = fontBold.widthOfTextAtSize(label, 7.5);
    page.drawText(val, { x: xPos + labelWidth + 3, y: yPos, size: 7.5, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
  };

  // Row heights inside card
  const row1Y = boxTopY - 32;
  const row2Y = boxTopY - 47;
  const row3Y = boxTopY - 62;
  const row4Y = boxTopY - 77;

  // Col 1 Values
  drawGridValue('Client:', data.clientName, col1X, row1Y);
  drawGridValue('Bride:', data.brideName, col1X, row2Y);
  drawGridValue('Groom:', data.groomName, col1X, row3Y);
  drawGridValue('Date:', data.todayDate, col1X, row4Y);

  // Col 2 Values
  drawGridValue('Event:', data.eventName, col2X, row1Y);
  drawGridValue('Date:', data.eventDate, col2X, row2Y);
  drawGridValue('Venue:', data.venue, col2X, row3Y);
  drawGridValue('Quote No:', data.quotationNumber, col2X, row4Y);

  // Col 3 Values
  drawGridValue('Total:', data.totalAmount, col3X, row1Y);
  drawGridValue('Advance:', data.advanceAmount, col3X, row2Y);
  drawGridValue('Balance:', data.balanceAmount, col3X, row3Y);
  drawGridValue('Invoice No:', data.invoiceNumber, col3X, row4Y);

  let y = boxBottomY - 20; // start text content below card

  // Helper to safely write lines of text and handle page breaks
  const writeLine = (
    text: string,
    isBold: boolean,
    fontSize: number,
    spacing: number,
    textColor = rgb(0.15, 0.15, 0.15),
    drawDivider = false
  ) => {
    const font = isBold ? fontBold : fontRegular;

    // Perform word-wrapping
    const words = text.split(' ');
    let currentLine = '';
    const wrappedLines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxTextWidth - 15) {
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
      const lineSpacing = i === wrappedLines.length - 1 ? spacing : 2;

      // Check if we exceed page height
      if (y - fontSize - lineSpacing < 65) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - 95;
        drawPageDecorations(page, pageIndex);
      }

      y -= fontSize + lineSpacing;
      page.drawText(lineText, {
        x: margin,
        y: y,
        size: fontSize,
        font: font,
        color: textColor,
      });
    }

    if (drawDivider) {
      if (y - 8 < 65) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - 95;
        drawPageDecorations(page, pageIndex);
      }
      y -= 4;
      page.drawLine({
        start: { x: margin, y: y },
        end: { x: pageWidth - margin - 15, y: y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 4;
    }
  };

  const writeKeyValue = (key: string, value: string, fontSize: number, spacing: number) => {
    const keyWidth = fontBold.widthOfTextAtSize(key + ' ', fontSize);

    // Check page break
    if (y - fontSize - spacing < 65) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      pageIndex++;
      y = pageHeight - 95;
      drawPageDecorations(page, pageIndex);
    }

    y -= fontSize + spacing;
    page.drawText(key, {
      x: margin,
      y: y,
      size: fontSize,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    page.drawText(value, {
      x: margin + keyWidth,
      y: y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });
  };

  const writeBullet = (prefix: string, body: string, fontSize: number, lineSpacing: number) => {
    const prefixWidth = fontBold.widthOfTextAtSize(prefix + ' ', fontSize);
    const indent = 15;
    const firstLineAvailableWidth = maxTextWidth - 15 - indent - prefixWidth;
    const regularLineAvailableWidth = maxTextWidth - 15 - indent;

    // Wrap body text
    const words = body.split(' ');
    const firstLineWords: string[] = [];
    const remainingLines: string[] = [];
    
    let currentLine = '';
    let isFirstLine = true;

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = fontRegular.widthOfTextAtSize(testLine, fontSize);
      const limit = isFirstLine ? firstLineAvailableWidth : regularLineAvailableWidth;

      if (testWidth > limit) {
        if (isFirstLine) {
          firstLineWords.push(currentLine);
          currentLine = word;
          isFirstLine = false;
        } else {
          remainingLines.push(currentLine);
          currentLine = word;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      if (isFirstLine) {
        firstLineWords.push(currentLine);
      } else {
        remainingLines.push(currentLine);
      }
    }

    const firstLineText = firstLineWords.join(' ');

    // Check page break for first line
    if (y - fontSize - lineSpacing < 65) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      pageIndex++;
      y = pageHeight - 95;
      drawPageDecorations(page, pageIndex);
    }

    y -= fontSize + lineSpacing;

    // Draw bullet symbol
    page.drawText('•', {
      x: margin,
      y: y,
      size: fontSize,
      font: fontBold,
      color: brandColor,
    });

    // Draw bold prefix
    page.drawText(prefix, {
      x: margin + indent,
      y: y,
      size: fontSize,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    // Draw first line of body
    if (firstLineText) {
      page.drawText(firstLineText, {
        x: margin + indent + prefixWidth,
        y: y,
        size: fontSize,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
    }

    // Draw remaining lines
    for (const lineText of remainingLines) {
      if (y - fontSize - 3 < 65) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - 95;
        drawPageDecorations(page, pageIndex);
      }
      y -= fontSize + 3;
      page.drawText(lineText, {
        x: margin + indent,
        y: y,
        size: fontSize,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
    }
    y -= 2; // extra spacing after bullet paragraph
  };

  // Split content by paragraphs
  const paragraphs = content.split('\n');

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      // Empty paragraph serves as empty line space
      writeLine('', false, 8.5, 4);
      continue;
    }

    // Skip redundant top details as they are shown inside premium metadata info box
    if (
      trimmed === 'WEDDING PHOTOGRAPHY & VIDEOGRAPHY AGREEMENT' ||
      trimmed === 'EVENT DETAILS' ||
      trimmed === 'FINANCIAL DETAILS' ||
      trimmed.startsWith('Client Name(s):') ||
      trimmed.startsWith('Booking For (Main Event):') ||
      trimmed.startsWith('Main Event Date:') ||
      trimmed.startsWith('Agreement Date:') ||
      trimmed.startsWith('Total Amount:') ||
      trimmed.startsWith('Advance Amount:') ||
      trimmed.startsWith('Balance Amount:')
    ) {
      continue;
    }

    // Determine typography styles
    let isTitle = false;
    let isHeading = false;
    let fontSize = 8.5;
    let lineSpacing = 4;
    let textColor = rgb(0.15, 0.15, 0.15);
    let drawDivider = false;

    if (
      trimmed === 'HOW WE WORK: SERVICE TERMS & CONDITIONS'
    ) {
      isHeading = true;
      fontSize = 11;
      lineSpacing = 8;
      textColor = brandColor;
      drawDivider = true;
    } else if (/^\d+\.\s+/.test(trimmed)) {
      isHeading = true;
      fontSize = 9.5;
      lineSpacing = 6;
      textColor = rgb(0.2, 0.2, 0.2);
    }

    // Check custom styling paragraphs
    if (trimmed.startsWith('I have read, understand and agree')) {
      writeLine(trimmed.replace(/%i/g, ''), true, 8.5, 12, rgb(0.15, 0.15, 0.15));
      continue;
    }

    const isBullet = trimmed.startsWith('-') || trimmed.startsWith('%i');
    if (isBullet) {
      const rest = (trimmed.startsWith('%i') ? trimmed.substring(2).trim() : trimmed.substring(1).trim()).replace(/%i/g, '');
      const colonIdx = rest.indexOf(':');
      if (colonIdx !== -1) {
        const prefix = rest.substring(0, colonIdx + 1).trim();
        const body = rest.substring(colonIdx + 1).trim();
        writeBullet(prefix, body, 8.5, 4);
        continue;
      } else {
        writeBullet('', rest, 8.5, 4);
        continue;
      }
    }

    const isDetail = trimmed.includes(':') && 
                     !trimmed.startsWith('Service Provider') && 
                     !trimmed.startsWith('Client') &&
                     !trimmed.startsWith('I have read');
    if (isDetail) {
      const cleanDetail = trimmed.replace(/%i/g, '');
      const idx = cleanDetail.indexOf(':');
      const key = cleanDetail.substring(0, idx + 1).trim();
      const val = cleanDetail.substring(idx + 1).trim();
      writeKeyValue(key, val, 8.5, 4);
      continue;
    }

    const cleanLine = trimmed.replace(/%i/g, '');
    writeLine(cleanLine, isTitle || isHeading, fontSize, lineSpacing, textColor, drawDivider);
  }

  // 4. Save document to Buffer
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
