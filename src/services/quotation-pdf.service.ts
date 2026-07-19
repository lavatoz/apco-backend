import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { loadFooterImage, applyBrandingFooterToDoc, applyVerificationFooterToDoc } from './pdf-branding.service';
import { securePdfDocument } from './pdf-security.service';

export interface QuotationItemData {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface QuotationPdfData {
  quotationNumber: string;
  issueDate: string;
  validUntil: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCompanyName?: string;
  verificationUrl?: string;

  items: QuotationItemData[];
  amount: number;
  discountType?: string;
  discountValue?: number;
  taxPercent?: number;
  shippingCost?: number;
  advancePaid: number;
  balanceAmount: number;
  upiId?: string;
  companyName: string;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    ifscCode?: string;
  };
  companyLogoUrl?: string;
  brandName?: string;
  weddingDate?: string;
  muhurthamTime?: string;
  weddingVenue?: string;
  brideLocation?: string;
  groomLocation?: string;
  paymentTerms?: string;
  primaryColor?: string;
  tagline?: string;
  templateId?: string;
  themePreset?: string;
}

/**
 * Service to generate dynamic, premium dark-mode Quotation PDF matching reference design.
 */
export async function generateQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Embed APCO family branding footer image
  const footerEmbed = await loadFooterImage(pdfDoc);

  // Set sizing
  const pageWidth = 612; // Letter width
  const pageHeight = 792; // Letter height
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;

  // Render dynamic logo if available, otherwise draw central text branding
  let logoEmbed: any = null;
  if (data.companyLogoUrl) {
    try {
      let buffer: Buffer | null = null;
      let isPng = false;
      let isJpg = false;

      if (data.companyLogoUrl.startsWith('data:image/')) {
        const matches = data.companyLogoUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1].toLowerCase();
          const base64Data = matches[2];
          buffer = Buffer.from(base64Data, 'base64');
          if (ext === 'png') {
            isPng = true;
          } else if (ext === 'jpg' || ext === 'jpeg') {
            isJpg = true;
          }
        }
      } else {
        const response = await fetch(data.companyLogoUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          if (data.companyLogoUrl.endsWith('.png')) {
            isPng = true;
          } else if (data.companyLogoUrl.endsWith('.jpg') || data.companyLogoUrl.endsWith('.jpeg')) {
            isJpg = true;
          }
        }
      }

      if (buffer) {
        if (isPng) {
          logoEmbed = await pdfDoc.embedPng(buffer);
        } else if (isJpg) {
          logoEmbed = await pdfDoc.embedJpg(buffer);
        }
      }
    } catch (err) {
      console.error('Failed to load remote logo in quotation service:', err);
    }
  }

  if (data.templateId === 'apco_master_v1') {
    // -------------------------------------------------------------------------
    // PREMIUM MASTER MULTI-BRAND TEMPLATE SYSTEM (2-PAGE LAYOUT)
    // -------------------------------------------------------------------------
    const primaryColorHex = data.primaryColor || '#3B82F6';

    const parseHexColor = (hex: string) => {
      const cleanHex = hex.replace('#', '');
      const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
      const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
      const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
      return rgb(isNaN(r) ? 0.23 : r, isNaN(g) ? 0.51 : g, isNaN(b) ? 0.96 : b);
    };

    const parsedBrandPrimaryColor = parseHexColor(primaryColorHex);
    const theme = (data.themePreset || 'modern').toLowerCase();

    // Decoupled Theme System
    const THEMES: Record<string, {
      bg: any;
      brandPrimary: any | null; // null triggers dynamic accent color injection
      border: any;
      text: any;
      textMuted: any;
      cardBg: any;
      tableHeaderBg: any;
      tableHeaderTxt: any;
      fontFamily: 'serif' | 'sans';
      logoMaxWidth: number;
      logoMaxHeight: number;
      logoTopGap: number;
    }> = {
      aaha: {
        bg: rgb(245/255, 241/255, 232/255),             // Ivory/Cream #F5F1E8
        brandPrimary: rgb(139/255, 107/255, 63/255),    // Gold Brown #8B6B3F
        border: rgb(200/255, 183/255, 156/255),          // Soft Beige #C8B79C
        text: rgb(47/255, 47/255, 47/255),              // Dark Charcoal #2F2F2F
        textMuted: rgb(110/255, 105/255, 95/255),       // Warm Muted Gray
        cardBg: rgb(250/255, 248/255, 244/255),         // Off-cream card bg
        tableHeaderBg: rgb(58/255, 49/255, 40/255),     // Deep Brown #3A3128
        tableHeaderTxt: rgb(1, 1, 1),                    // White
        fontFamily: 'serif',
        logoMaxWidth: 280,
        logoMaxHeight: 120,
        logoTopGap: 10
      },
      classic: {
        bg: rgb(0.98, 0.97, 0.95),
        brandPrimary: null,
        border: rgb(0.82, 0.78, 0.74),
        text: rgb(0.12, 0.1, 0.05),
        textMuted: rgb(0.45, 0.4, 0.35),
        cardBg: rgb(0.94, 0.92, 0.89),
        tableHeaderBg: rgb(0.94, 0.92, 0.89),
        tableHeaderTxt: rgb(0.12, 0.1, 0.05),
        fontFamily: 'serif',
        logoMaxWidth: 230,
        logoMaxHeight: 75,
        logoTopGap: 40
      },
      luxury: {
        bg: rgb(0.99, 0.98, 0.96),
        brandPrimary: rgb(0.78, 0.7, 0.6),
        border: rgb(0.78, 0.7, 0.6),
        text: rgb(0.1, 0.08, 0.05),
        textMuted: rgb(0.5, 0.45, 0.4),
        cardBg: rgb(0.95, 0.92, 0.88),
        tableHeaderBg: rgb(0.95, 0.92, 0.88),
        tableHeaderTxt: rgb(0.1, 0.08, 0.05),
        fontFamily: 'serif',
        logoMaxWidth: 230,
        logoMaxHeight: 75,
        logoTopGap: 40
      },
      minimal: {
        bg: rgb(0.98, 0.98, 0.98),
        brandPrimary: null,
        border: rgb(0.88, 0.88, 0.9),
        text: rgb(0.15, 0.2, 0.25),
        textMuted: rgb(0.45, 0.5, 0.55),
        cardBg: rgb(0.94, 0.95, 0.96),
        tableHeaderBg: rgb(0.94, 0.95, 0.96),
        tableHeaderTxt: rgb(0.15, 0.2, 0.25),
        fontFamily: 'sans',
        logoMaxWidth: 230,
        logoMaxHeight: 75,
        logoTopGap: 40
      },
      default: {
        bg: rgb(1, 1, 1),
        brandPrimary: null,
        border: rgb(0.86, 0.86, 0.86),
        text: rgb(0.08, 0.08, 0.08),
        textMuted: rgb(0.38, 0.38, 0.38),
        cardBg: rgb(0.96, 0.96, 0.96),
        tableHeaderBg: rgb(0.96, 0.96, 0.96),
        tableHeaderTxt: rgb(0.08, 0.08, 0.08),
        fontFamily: 'sans',
        logoMaxWidth: 230,
        logoMaxHeight: 75,
        logoTopGap: 40
      }
    };

    const brandName = data.brandName?.toLowerCase() || '';
    const isAahaKalyanam = brandName.includes('aaha');

    let themeKey = 'default';
    if (isAahaKalyanam) {
      themeKey = 'aaha';
    } else if (theme && THEMES[theme]) {
      themeKey = theme;
    }

    const activeTheme = { ...THEMES[themeKey] };
    if (!activeTheme.brandPrimary) {
      activeTheme.brandPrimary = parsedBrandPrimaryColor;
    }

    // Export variables to ensure full backward compatibility with legacy logic
    const bgRgb = activeTheme.bg;
    const brandPrimaryColor = activeTheme.brandPrimary;
    const borderRgb = activeTheme.border;
    const textRgb = activeTheme.text;
    const textMutedRgb = activeTheme.textMuted;
    const cardBgRgb = activeTheme.cardBg;

    const fontStandard = activeTheme.fontFamily === 'serif' ? fontTimes : fontRegular;
    const fontEmphasis = activeTheme.fontFamily === 'serif' ? fontTimesBold : fontBold;

    let fontCursive = fontRegular;
    try {
      fontCursive = await pdfDoc.embedFont(StandardFonts.CourierOblique);
    } catch (e) {
      fontCursive = fontRegular;
    }

    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    const drawBackground = (p: any) => {
      p.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: bgRgb,
      });
    };

    drawBackground(page);

    const drawCenterText = (p: any, text: string, size: number, font: any, yCoord: number, color = textRgb) => {
      const width = font.widthOfTextAtSize(text, size);
      p.drawText(text, {
        x: (pageWidth - width) / 2,
        y: yCoord,
        size,
        font,
        color,
      });
    };

    if (logoEmbed) {
      const maxLogoWidth = activeTheme.logoMaxWidth;
      const maxLogoHeight = activeTheme.logoMaxHeight;
      const scaleFactor = Math.min(maxLogoWidth / logoEmbed.width, maxLogoHeight / logoEmbed.height);
      const logoWidth = logoEmbed.width * scaleFactor;
      const logoHeight = logoEmbed.height * scaleFactor;
      page.drawImage(logoEmbed, {
        x: (pageWidth - logoWidth) / 2,
        y: pageHeight - activeTheme.logoTopGap - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      const brandText = data.brandName ? data.brandName.toUpperCase() : data.companyName.toUpperCase();
      drawCenterText(page, brandText, 24, fontEmphasis, pageHeight - 95, brandPrimaryColor);
      if (data.tagline) {
        drawCenterText(page, data.tagline, 9, fontStandard, pageHeight - 110, textMutedRgb);
      }
    }

    // Info cards configuration
    let metaY = pageHeight - 145;
    if (logoEmbed) {
      const maxLogoWidth = activeTheme.logoMaxWidth;
      const maxLogoHeight = activeTheme.logoMaxHeight;
      const scaleFactor = Math.min(maxLogoWidth / logoEmbed.width, maxLogoHeight / logoEmbed.height);
      const logoHeight = logoEmbed.height * scaleFactor;
      // Position the info cards dynamically 20px below the bottom of the logo
      metaY = pageHeight - activeTheme.logoTopGap - logoHeight - 20;
    }
    const cardWidth = 170;
    const cardHeight = 90;
    const cardY = metaY - cardHeight;

    const drawCard = (x: number, title: string, lines: string[]) => {
      page.drawRectangle({
        x,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        color: cardBgRgb,
        borderColor: borderRgb,
        borderWidth: 1,
      });
      page.drawText(title, {
        x: x + 10,
        y: cardY + cardHeight - 16,
        size: 8,
        font: fontEmphasis,
        color: brandPrimaryColor,
      });
      let lineY = cardY + cardHeight - 30;
      for (const line of lines) {
        if (!line) continue;
        page.drawText(line, {
          x: x + 10,
          y: lineY,
          size: 7.5,
          font: fontStandard,
          color: textRgb,
        });
        lineY -= 12;
      }
    };

    const clientLines = [
      data.clientName,
      data.clientCompanyName || '',
      data.clientPhone || '',
      data.clientEmail
    ].filter(Boolean).slice(0, 4);
    drawCard(margin, 'BILLED TO', clientLines);

    const eventLines = [
      data.weddingDate ? `Date: ${data.weddingDate}` : '',
      data.muhurthamTime ? `Time: ${data.muhurthamTime}` : '',
      data.weddingVenue ? `Venue: ${data.weddingVenue}` : ''
    ].filter(Boolean);
    drawCard(margin + 180, 'EVENT LOGISTICS', eventLines);

    const docLines = [
      `Quote: ${data.quotationNumber}`,
      `Date: ${data.issueDate}`,
      `Valid: ${data.validUntil}`
    ];
    drawCard(margin + 360, 'DOCUMENT INFO', docLines);

    // Group items
    const physicalItems = data.items.filter(item =>
      /album|frame|print|physical/i.test(item.description)
    );
    const digitalItems = data.items.filter(item =>
      /film|video|highlight|vault|digital|teaser/i.test(item.description)
    );
    const coverageItems = data.items.filter(item =>
      !physicalItems.includes(item) && !digitalItems.includes(item)
    );

    const groups = [
      { title: 'EVENT COVERAGE & SERVICES', items: coverageItems },
      { title: 'CINEMA & DIGITAL ASSETS', items: digitalItems },
      { title: 'PHYSICAL DELIVERABLES', items: physicalItems }
    ].filter(g => g.items.length > 0);

    let y = cardY - 20;

    const drawTableHeaderMaster = (p: any, tableY: number) => {
      p.drawRectangle({
        x: margin,
        y: tableY - 18,
        width: contentWidth,
        height: 18,
        color: activeTheme.tableHeaderBg,
      });
      p.drawText('ITEM DESCRIPTION', { x: margin + 10, y: tableY - 12, size: 8, font: fontEmphasis, color: activeTheme.tableHeaderTxt });
      p.drawText('PRICE', { x: 380, y: tableY - 12, size: 8, font: fontEmphasis, color: activeTheme.tableHeaderTxt });
      p.drawText('QTY', { x: 460, y: tableY - 12, size: 8, font: fontEmphasis, color: activeTheme.tableHeaderTxt });
      p.drawText('TOTAL', { x: 520, y: tableY - 12, size: 8, font: fontEmphasis, color: activeTheme.tableHeaderTxt });
    };

    drawTableHeaderMaster(page, y);
    y -= 18;

    const wrapText = (text: string, maxWidth: number, font: any, size: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth > maxWidth) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    for (const group of groups) {
      if (y - 25 < 140) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        drawBackground(page);
        y = pageHeight - margin - 20;
        drawTableHeaderMaster(page, y);
        y -= 18;
      }

      y -= 18;
      page.drawText(group.title, {
        x: margin + 10,
        y: y + 4,
        size: 8,
        font: fontEmphasis,
        color: brandPrimaryColor,
      });

      for (const item of group.items) {
        const descLines = wrapText(item.description, 300, fontStandard, 8);
        const rowHeight = Math.max(descLines.length * 11 + 6, 20);

        if (y - rowHeight < 140) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          drawBackground(page);
          y = pageHeight - margin - 20;
          drawTableHeaderMaster(page, y);
          y -= 18;
        }

        y -= rowHeight;
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
          color: borderRgb,
        });

        let textY = y + rowHeight - 12;
        for (const line of descLines) {
          page.drawText(line, { x: margin + 10, y: textY, size: 8, font: fontStandard, color: textRgb });
          textY -= 11;
        }

        const formattedPrice = `Rs. ${Number(item.unitPrice).toLocaleString('en-IN')}`;
        const formattedTotal = `Rs. ${Number(item.amount).toLocaleString('en-IN')}`;
        page.drawText(formattedPrice, { x: 380, y: y + (rowHeight / 2) - 4, size: 8, font: fontStandard, color: textRgb });
        page.drawText(String(item.quantity), { x: 465, y: y + (rowHeight / 2) - 4, size: 8, font: fontStandard, color: textRgb });
        page.drawText(formattedTotal, { x: 520, y: y + (rowHeight / 2) - 4, size: 8, font: fontEmphasis, color: textRgb });
      }
    }

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: borderRgb,
    });

    y -= 15;

    if (y - 120 < 140) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      drawBackground(page);
      y = pageHeight - margin - 20;
    }

    const subtotal = data.items.reduce((sum, item) => sum + Number(item.amount), 0);

    // Resolve payment schedule milestones
    let milestones: string[] = [];
    if (data.paymentTerms && data.paymentTerms.trim() && data.paymentTerms.toLowerCase() !== 'due on receipt') {
      milestones = data.paymentTerms
        .split(/[\n,;]+/)
        .map(term => term.trim())
        .filter(Boolean);
    }

    if (milestones.length === 0) {
      const m1 = (subtotal * 0.1).toLocaleString('en-IN');
      const m2 = (subtotal * 0.8).toLocaleString('en-IN');
      const m3 = (subtotal * 0.1).toLocaleString('en-IN');
      milestones = [
        `10% Booking Advance: Rs. ${m1}`,
        `80% Mid-Payment (Before Event): Rs. ${m2}`,
        `10% Final Settlement (On Delivery): Rs. ${m3}`
      ];
    }

    const scheduleBoxWidth = 260;
    const scheduleBoxHeight = 110;
    const scheduleBoxY = y - scheduleBoxHeight;

    page.drawRectangle({
      x: margin,
      y: scheduleBoxY,
      width: scheduleBoxWidth,
      height: scheduleBoxHeight,
      color: cardBgRgb,
      borderColor: borderRgb,
      borderWidth: 1,
    });

    page.drawText('PAYMENT SCHEDULE', {
      x: margin + 12,
      y: scheduleBoxY + scheduleBoxHeight - 15,
      size: 8,
      font: fontEmphasis,
      color: brandPrimaryColor,
    });

    let milY = scheduleBoxY + scheduleBoxHeight - 32;
    for (const milestone of milestones.slice(0, 5)) {
      page.drawText(milestone, {
        x: margin + 12,
        y: milY,
        size: 7.5,
        font: fontStandard,
        color: textRgb,
      });
      milY -= 14;
    }

    let bankInfoY = scheduleBoxY - 12;
    if (data.bankDetails && (data.bankDetails.bankName || data.bankDetails.accountNumber)) {
      const b = data.bankDetails;
      let text = `Bank: ${b.bankName || ''} | Acc: ${b.accountNumber || ''} | IFSC: ${b.ifscCode || ''}`;
      page.drawText(text, {
        x: margin,
        y: bankInfoY,
        size: 7.5,
        font: fontStandard,
        color: textMutedRgb,
      });
      bankInfoY -= 12;
    }
    if (data.upiId) {
      page.drawText(`UPI ID: ${data.upiId}`, {
        x: margin,
        y: bankInfoY,
        size: 7.5,
        font: fontStandard,
        color: textMutedRgb,
      });
    }

    const totalsX = pageWidth - margin - 220;
    let totalY = y - 10;

    const drawTotalsRowMaster = (label: string, val: string, isBold = false) => {
      page.drawText(label, {
        x: totalsX,
        y: totalY,
        size: 8,
        font: isBold ? fontEmphasis : fontStandard,
        color: textRgb,
      });
      const textWidth = (isBold ? fontEmphasis : fontStandard).widthOfTextAtSize(val, 8);
      page.drawText(val, {
        x: pageWidth - margin - textWidth,
        y: totalY,
        size: 8,
        font: isBold ? fontEmphasis : fontStandard,
        color: textRgb,
      });
      totalY -= 14;
    };

    drawTotalsRowMaster('SUB TOTAL', `Rs. ${subtotal.toLocaleString('en-IN')}`, true);

    if (data.discountValue && data.discountValue > 0) {
      const discVal = data.discountType === 'Percentage' ? (subtotal * data.discountValue) / 100 : data.discountValue;
      drawTotalsRowMaster('DISCOUNT', `- Rs. ${discVal.toLocaleString('en-IN')}`);
    }

    if (data.taxPercent && data.taxPercent > 0) {
      const taxVal = (subtotal * data.taxPercent) / 100;
      drawTotalsRowMaster(`TAX / GST (${data.taxPercent}%)`, `+ Rs. ${taxVal.toLocaleString('en-IN')}`);
    }

    if (data.shippingCost && data.shippingCost > 0) {
      drawTotalsRowMaster('TRANSPORT', `+ Rs. ${Number(data.shippingCost).toLocaleString('en-IN')}`);
    }

    drawTotalsRowMaster('ADVANCE PAID', `Rs. ${Number(data.advancePaid).toLocaleString('en-IN')}`);

    totalY -= 4;
    page.drawRectangle({
      x: totalsX,
      y: totalY - 6,
      width: 220,
      height: 18,
      color: brandPrimaryColor,
    });

    page.drawText('TOTAL BALANCE DUE', {
      x: totalsX + 6,
      y: totalY - 1,
      size: 8,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    const formattedBalance = `Rs. ${Number(data.balanceAmount).toLocaleString('en-IN')}`;
    const balWidth = fontBold.widthOfTextAtSize(formattedBalance, 8);
    page.drawText(formattedBalance, {
      x: pageWidth - margin - balWidth - 6,
      y: totalY - 1,
      size: 8,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    const qrSize = 55;
    const qrX = pageWidth - margin - qrSize;
    const qrY = totalY - 15 - qrSize;

    if (data.upiId) {
      try {
        const upiLink = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.companyName)}&am=${Number(data.balanceAmount)}&cu=INR`;
        const qrBuffer = await QRCode.toBuffer(upiLink, {
          type: 'png',
          width: 90,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        const qrImageEmbed = await pdfDoc.embedPng(qrBuffer);
        page.drawImage(qrImageEmbed, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
        page.drawText('SCAN TO PAY WITH UPI', {
          x: qrX - 35,
          y: qrY - 10,
          size: 6,
          font: fontBold,
          color: textMutedRgb,
        });
      } catch (qrErr) {
        console.error('QR code generation failed in master template:', qrErr);
      }
    }

    // PAGE 2: TERMS AND CONDITIONS + SIGNATURES
    const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
    drawBackground(page2);

    let p2Y = pageHeight - margin - 20;
    page2.drawText('TERMS & CONDITIONS', {
      x: margin,
      y: p2Y,
      size: 11,
      font: fontEmphasis,
      color: brandPrimaryColor,
    });

    p2Y -= 15;
    page2.drawLine({
      start: { x: margin, y: p2Y },
      end: { x: pageWidth - margin, y: p2Y },
      thickness: 1,
      color: borderRgb,
    });

    p2Y -= 20;

    const terms = [
      'Booking is confirmed only upon the receipt of the booking advance.',
      'The schedule of payments must be strictly followed as detailed in the payment schedule.',
      'The deliverables will be initiated only after the full and final settlement of all dues.',
      'Raw footage/files will be stored for a maximum of 3 months from the date of the event.',
      'Any transport or lodging outside the package scope will be billed at actual cost.',
      'Post-production turn-around-time is 8 to 12 weeks from the date of final selection.'
    ];

    for (let i = 0; i < terms.length; i++) {
      const bullet = `${i + 1}.`;
      page2.drawText(bullet, {
        x: margin,
        y: p2Y,
        size: 9,
        font: fontEmphasis,
        color: brandPrimaryColor,
      });

      const termLines = wrapText(terms[i], contentWidth - 20, fontStandard, 9);
      for (const line of termLines) {
        page2.drawText(line, {
          x: margin + 20,
          y: p2Y,
          size: 9,
          font: fontStandard,
          color: textRgb,
        });
        p2Y -= 14;
      }
      p2Y -= 8;
    }

    p2Y = 240;

    page2.drawLine({
      start: { x: margin, y: p2Y },
      end: { x: pageWidth - margin, y: p2Y },
      thickness: 0.5,
      color: borderRgb,
    });

    p2Y -= 25;
    page2.drawText('SIGNATURES & ACCEPTANCE', {
      x: margin,
      y: p2Y,
      size: 9,
      font: fontEmphasis,
      color: brandPrimaryColor,
    });

    const sigLineY = p2Y - 70;

    page2.drawLine({
      start: { x: margin, y: sigLineY },
      end: { x: margin + 180, y: sigLineY },
      thickness: 1,
      color: textMutedRgb,
    });
    page2.drawText('CLIENT SIGNATURE', {
      x: margin,
      y: sigLineY - 12,
      size: 8,
      font: fontEmphasis,
      color: textMutedRgb,
    });
    page2.drawText('(PENDING ELECTRONIC SIGNATURE)', {
      x: margin,
      y: sigLineY + 15,
      size: 7,
      font: fontStandard,
      color: textMutedRgb,
    });

    const rightSigX = pageWidth - margin - 180;
    page2.drawLine({
      start: { x: rightSigX, y: sigLineY },
      end: { x: pageWidth - margin, y: sigLineY },
      thickness: 1,
      color: textMutedRgb,
    });

    page2.drawText('AUTHORIZED SIGNATORY', {
      x: rightSigX,
      y: sigLineY - 12,
      size: 8,
      font: fontEmphasis,
      color: textMutedRgb,
    });

    const cursiveText = data.brandName || data.companyName;
    page2.drawText(cursiveText, {
      x: rightSigX + 10,
      y: sigLineY + 12,
      size: 11,
      font: fontCursive,
      color: brandPrimaryColor,
    });

    // Draw graphic footer on all pages
    applyBrandingFooterToDoc(pdfDoc, footerEmbed, pageWidth, contentWidth);

    if (data.verificationUrl) {
      await applyVerificationFooterToDoc(pdfDoc, data.verificationUrl, { hasBlackFooter: true, margin });
    }

    const pdfBytes = await pdfDoc.save();
    const { securedBuffer } = await securePdfDocument(Buffer.from(pdfBytes));
    return securedBuffer;
  } else {
    // -------------------------------------------------------------------------
    // OLD DARK-MODE LAYOUT (FALLBACK)
    // -------------------------------------------------------------------------
    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Color Palette
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const lightGrey = rgb(0.8, 0.8, 0.8);
    const mediumGrey = rgb(0.55, 0.55, 0.55);
    const charcoal = rgb(0.12, 0.12, 0.12);
    const gridLineColor = rgb(0.2, 0.2, 0.2);

    const drawBackground = (p: any) => {
      p.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
        color: black,
      });
    };

    drawBackground(page);

    const drawCenterText = (p: any, text: string, size: number, font: any, yCoord: number, color = white) => {
      const width = font.widthOfTextAtSize(text, size);
      p.drawText(text, {
        x: (pageWidth - width) / 2,
        y: yCoord,
        size,
        font,
        color,
      });
    };

    if (logoEmbed) {
      const maxLogoWidth = 230;
      const maxLogoHeight = 80;
      const scaleFactor = Math.min(maxLogoWidth / logoEmbed.width, maxLogoHeight / logoEmbed.height);
      const logoWidth = logoEmbed.width * scaleFactor;
      const logoHeight = logoEmbed.height * scaleFactor;
      page.drawImage(logoEmbed, {
        x: (pageWidth - logoWidth) / 2,
        y: pageHeight - margin - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
    } else {
      const brandText = data.brandName ? data.brandName.toUpperCase() : 'AAHA.. KALYANAM!!';
      drawCenterText(page, brandText, 26, fontBold, pageHeight - 95, white);
      drawCenterText(page, 'from artisans production company', 9, fontRegular, pageHeight - 110, mediumGrey);
    }

    let metaY = pageHeight - 165;
    page.drawText('TO', { x: margin, y: metaY, size: 9, font: fontBold, color: white });
    page.drawText(data.clientName, { x: margin, y: metaY - 14, size: 10, font: fontBold, color: white });
    let nextY = metaY - 26;
    if (data.clientCompanyName) {
      page.drawText(data.clientCompanyName, { x: margin, y: nextY, size: 9, font: fontRegular, color: lightGrey });
      nextY -= 12;
    }
    if (data.clientAddress) {
      page.drawText(data.clientAddress, { x: margin, y: nextY, size: 9, font: fontRegular, color: mediumGrey });
      nextY -= 12;
    }
    const contactText = [data.clientEmail, data.clientPhone].filter(Boolean).join(' | ');
    if (contactText) {
      page.drawText(contactText, { x: margin, y: nextY, size: 9, font: fontRegular, color: mediumGrey });
    }

    page.drawText('DATE', { x: 420, y: metaY, size: 9, font: fontBold, color: white });
    page.drawText(data.issueDate, { x: 420, y: metaY - 14, size: 9, font: fontRegular, color: lightGrey });
    
    page.drawText('QUOTATION NUMBER', { x: 420, y: metaY - 36, size: 9, font: fontBold, color: white });
    page.drawText(data.quotationNumber, { x: 420, y: metaY - 50, size: 10, font: fontBold, color: white });

    let y = pageHeight - 265;

    const drawTableHeader = (p: any, tableY: number) => {
      p.drawRectangle({
        x: margin,
        y: tableY - 20,
        width: contentWidth,
        height: 20,
        color: charcoal,
      });
      p.drawText('ITEM NAME', { x: margin + 10, y: tableY - 14, size: 8, font: fontBold, color: white });
      p.drawText('PRICE', { x: 380, y: tableY - 14, size: 8, font: fontBold, color: white });
      p.drawText('QTY', { x: 460, y: tableY - 14, size: 8, font: fontBold, color: white });
      p.drawText('TOTAL', { x: 520, y: tableY - 14, size: 8, font: fontBold, color: white });
    };

    drawTableHeader(page, y);
    y -= 20;

    const wrapText = (text: string, maxWidth: number, font: any, size: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth > maxWidth) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    for (const item of data.items) {
      const descLines = wrapText(item.description, 300, fontRegular, 9);
      const rowHeight = Math.max(descLines.length * 12 + 10, 24);

      if (y - rowHeight < 140) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        drawBackground(page);
        page.drawText('QUOTATION - CONTINUED', { x: margin, y: pageHeight - 35, size: 8, font: fontBold, color: mediumGrey });
        page.drawLine({
          start: { x: margin, y: pageHeight - 42 },
          end: { x: pageWidth - margin, y: pageHeight - 42 },
          thickness: 0.5,
          color: gridLineColor,
        });
        y = pageHeight - 65;
        drawTableHeader(page, y);
        y -= 20;
      }

      y -= rowHeight;
      page.drawLine({
        start: { x: margin, y: y },
        end: { x: pageWidth - margin, y: y },
        thickness: 0.5,
        color: gridLineColor,
      });

      let textY = y + rowHeight - 16;
      for (const line of descLines) {
        page.drawText(line, { x: margin + 10, y: textY, size: 9, font: fontRegular, color: white });
        textY -= 12;
      }

      const formattedPrice = `Rs. ${Number(item.unitPrice).toLocaleString('en-IN')}`;
      const formattedTotal = `Rs. ${Number(item.amount).toLocaleString('en-IN')}`;
      page.drawText(formattedPrice, { x: 380, y: y + (rowHeight / 2) - 4, size: 9, font: fontRegular, color: white });
      page.drawText(String(item.quantity), { x: 465, y: y + (rowHeight / 2) - 4, size: 9, font: fontRegular, color: white });
      page.drawText(formattedTotal, { x: 520, y: y + (rowHeight / 2) - 4, size: 9, font: fontBold, color: white });
    }

    page.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 0.5,
      color: gridLineColor,
    });

    y -= 10;

    const renderTotalsRow = (label: string, value: string, isBold = false) => {
      page.drawText(label, {
        x: 360,
        y: y - 12,
        size: 9,
        font: isBold ? fontBold : fontRegular,
        color: white,
      });
      page.drawText(value, {
        x: 520,
        y: y - 12,
        size: 9,
        font: isBold ? fontBold : fontRegular,
        color: white,
      });
      y -= 18;
    };

    const subtotal = data.items.reduce((sum, item) => sum + Number(item.amount), 0);
    renderTotalsRow('SUB TOTAL', `Rs. ${subtotal.toLocaleString('en-IN')}`, true);

    if (data.discountValue && data.discountValue > 0) {
      const discLabel = data.discountType === 'Percentage' ? `DISCOUNT (${data.discountValue}%)` : 'DISCOUNT';
      const discVal = data.discountType === 'Percentage' ? (subtotal * data.discountValue) / 100 : data.discountValue;
      renderTotalsRow(discLabel, `- Rs. ${discVal.toLocaleString('en-IN')}`);
    }

    if (data.taxPercent && data.taxPercent > 0) {
      const taxVal = (subtotal * data.taxPercent) / 100;
      renderTotalsRow(`TAX / GST (${data.taxPercent}%)`, `+ Rs. ${taxVal.toLocaleString('en-IN')}`);
    }

    if (data.shippingCost && data.shippingCost > 0) {
      renderTotalsRow('SHIPPING / TRANSPORT', `+ Rs. ${Number(data.shippingCost).toLocaleString('en-IN')}`);
    }

    renderTotalsRow('ADVANCE PAID', `Rs. ${Number(data.advancePaid).toLocaleString('en-IN')}`);

    y -= 15;
    page.drawRectangle({
      x: margin,
      y: y - 20,
      width: contentWidth,
      height: 20,
      color: charcoal,
    });
    page.drawText('TOTAL BALANCE DUE', { x: margin + 10, y: y - 14, size: 9, font: fontBold, color: white });
    const formattedBalance = `Rs. ${Number(data.balanceAmount).toLocaleString('en-IN')}`;
    page.drawText(formattedBalance, { x: 520, y: y - 14, size: 9, font: fontBold, color: white });
    y -= 35;

    if (y < 160) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      drawBackground(page);
      y = pageHeight - margin - 40;
    }

    page.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 0.5,
      color: gridLineColor,
    });
    
    y -= 25;
    page.drawText('PAYMENT DETAILS', { x: margin, y: y, size: 10, font: fontBold, color: white });
    
    let payInfoY = y - 16;
    if (data.bankDetails && (data.bankDetails.bankName || data.bankDetails.accountNumber)) {
      const b = data.bankDetails;
      if (b.bankName) {
        page.drawText(`Bank Name: ${b.bankName}`, { x: margin, y: payInfoY, size: 9, font: fontRegular, color: lightGrey });
        payInfoY -= 12;
      }
      if (b.accountName) {
        page.drawText(`Account Name: ${b.accountName}`, { x: margin, y: payInfoY, size: 9, font: fontRegular, color: lightGrey });
        payInfoY -= 12;
      }
      if (b.accountNumber) {
        page.drawText(`Account Number: ${b.accountNumber}`, { x: margin, y: payInfoY, size: 9, font: fontRegular, color: lightGrey });
        payInfoY -= 12;
      }
      if (b.ifscCode) {
        page.drawText(`IFSC Code: ${b.ifscCode}`, { x: margin, y: payInfoY, size: 9, font: fontRegular, color: lightGrey });
        payInfoY -= 12;
      }
    } else {
      page.drawText('Bank account transfer details are not specified.', { x: margin, y: payInfoY, size: 9, font: fontRegular, color: mediumGrey });
      payInfoY -= 12;
    }

    const qrX = 460;
    const qrY = y - 60;
    const qrSize = 80;

    if (data.upiId) {
      try {
        const upiLink = `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.companyName)}&am=${Number(data.balanceAmount)}&cu=INR`;
        const qrBuffer = await QRCode.toBuffer(upiLink, {
          type: 'png',
          width: 120,
          margin: 1,
          color: {
            dark: '#ffffff',
            light: '#000000',
          },
        });
        const qrImageEmbed = await pdfDoc.embedPng(qrBuffer);
        page.drawImage(qrImageEmbed, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
        page.drawText('SCAN TO PAY WITH UPI', {
          x: qrX - 5,
          y: qrY - 12,
          size: 7,
          font: fontBold,
          color: lightGrey,
        });
      } catch (qrErr) {
        console.error('Failed to render UPI QR code:', qrErr);
        page.drawText('UPI QR Code generation error', { x: qrX - 10, y: qrY + 30, size: 8, font: fontRegular, color: mediumGrey });
      }
    } else {
      page.drawRectangle({
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
        color: charcoal,
      });
      page.drawText('UPI NOT', {
        x: qrX + 22,
        y: qrY + 46,
        size: 8,
        font: fontBold,
        color: mediumGrey,
      });
      page.drawText('CONFIGURED', {
        x: qrX + 12,
        y: qrY + 32,
        size: 8,
        font: fontBold,
        color: mediumGrey,
      });
    }

    applyBrandingFooterToDoc(pdfDoc, footerEmbed, pageWidth, contentWidth);

    if (data.verificationUrl) {
      await applyVerificationFooterToDoc(pdfDoc, data.verificationUrl, { hasBlackFooter: true, margin });
    }

    const pdfBytes = await pdfDoc.save();
    const { securedBuffer } = await securePdfDocument(Buffer.from(pdfBytes));
    return securedBuffer;
  }
}
