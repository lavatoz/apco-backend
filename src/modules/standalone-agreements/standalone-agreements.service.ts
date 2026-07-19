import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { StandaloneAgreementTemplate, StandaloneAgreement, StandaloneAgreementDocument, StandaloneAgreementSignature, DocumentType, Role } from '@prisma/client';
import { DisplayIdGenerator } from '../../services/display-id.service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { aahaLogoBase64, tinyToesLogoBase64 } from '../../services/default-logo';
import { securePdfDocument } from '../../services/pdf-security.service';
import { DocumentRegistryService } from '../../services/document-registry.service';
import { applyVerificationFooterToDoc } from '../../services/pdf-branding.service';


const parseHexColor = (hex: string | undefined): any => {
  if (!hex) return rgb(0.23, 0.51, 0.96); // Default APCO blue
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
  return rgb(isNaN(r) ? 0.23 : r, isNaN(g) ? 0.51 : g, isNaN(b) ? 0.96 : b);
};



/**
 * Resolves path to template and asset files supporting ts-node and dist runtime.
 */
function getAssetPath(fileName: string): string {
  const path1 = path.join(__dirname, '../../templates', fileName);
  if (fs.existsSync(path1)) return path1;
  const path2 = path.join(__dirname, '../../../src/templates', fileName);
  if (fs.existsSync(path2)) return path2;
  return path1;
}

export class StandaloneAgreementsService {
  /**
   * Create a new standalone agreement template
   */
  static async createTemplate(data: {
    name: string;
    version: string;
    content: string;
  }): Promise<StandaloneAgreementTemplate> {
    return prisma.standaloneAgreementTemplate.create({
      data,
    });
  }

  /**
   * Get all standalone templates
   */
  static async getTemplates(): Promise<StandaloneAgreementTemplate[]> {
    return prisma.standaloneAgreementTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get standalone template by ID
   */
  static async getTemplateById(id: string): Promise<StandaloneAgreementTemplate> {
    const template = await prisma.standaloneAgreementTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new AppError('Standalone agreement template not found.', 404);
    }
    return template;
  }

  /**
   * Update standalone template
   */
  static async updateTemplate(
    id: string,
    data: Partial<{ name: string; version: string; content: string; isActive: boolean }>
  ): Promise<StandaloneAgreementTemplate> {
    const existing = await prisma.standaloneAgreementTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Standalone agreement template not found.', 404);
    }
    return prisma.standaloneAgreementTemplate.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete standalone template
   */
  static async deleteTemplate(id: string): Promise<StandaloneAgreementTemplate> {
    const existing = await prisma.standaloneAgreementTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Standalone agreement template not found.', 404);
    }
    return prisma.standaloneAgreementTemplate.delete({
      where: { id },
    });
  }

  /**
   * Assign a standalone template to a client
   */
  static async assignAgreement(clientId: string, templateId: string, linkedQuoteId?: string | null): Promise<StandaloneAgreement> {
    // 1. Verify client exists
    const client = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
    });
    if (!client) {
      throw new AppError('Client not found.', 400);
    }

    // 2. Prevent assignment bug: Check if client already has an active PENDING agreement
    const pendingAgreement = await prisma.standaloneAgreement.findFirst({
      where: {
        clientId,
        status: 'PENDING',
      },
    });
    if (pendingAgreement) {
      throw new AppError('Client already has an active PENDING agreement.', 400);
    }

    // 3. Fetch template
    const template = await prisma.standaloneAgreementTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new AppError('Standalone agreement template not found.', 404);
    }

    // 4. Create and return StandaloneAgreement
    const agreementCode = await DisplayIdGenerator.getNextId('AGR');
    return prisma.standaloneAgreement.create({
      data: {
        clientId,
        templateId,
        title: template.name,
        status: 'PENDING',
        generatedContent: template.content,
        assignedAt: new Date(),
        linkedQuoteId: linkedQuoteId || null,
        agreementCode,
      },
    });
  }

  /**
   * Retrieve all standalone agreements for a client
   */
  static async getClientAgreement(clientId: string): Promise<any[]> {
    const client = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
    });
    if (!client) {
      throw new AppError('Client not found.', 404);
    }

    const agreements = await prisma.standaloneAgreement.findMany({
      where: { clientId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            version: true,
            isActive: true,
          },
        },
        signatures: true,
        documents: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!agreements || agreements.length === 0) {
      throw new AppError('Standalone agreement not found for this client.', 404);
    }

    return agreements;
  }

  /**
   * Upload an identity verification document for an agreement
   */
  static async uploadDocument(
    agreementId: string,
    documentType: DocumentType,
    fileUrl: string
  ): Promise<StandaloneAgreementDocument> {
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    return prisma.standaloneAgreementDocument.create({
      data: {
        agreementId,
        documentType,
        fileUrl,
      },
    });
  }

  /**
   * Get all documents for an agreement
   */
  static async getDocuments(agreementId: string): Promise<StandaloneAgreementDocument[]> {
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    return prisma.standaloneAgreementDocument.findMany({
      where: { agreementId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Delete an uploaded document
   */
  static async deleteDocument(documentId: string): Promise<StandaloneAgreementDocument> {
    const doc = await prisma.standaloneAgreementDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new AppError('Document not found.', 404);
    }

    return prisma.standaloneAgreementDocument.delete({
      where: { id: documentId },
    });
  }

  /**
   * Get standalone agreement document by ID with permission verification
   */
  static async getDocumentForDownload(
    documentId: string,
    user: { id: string; email: string; role: Role }
  ): Promise<StandaloneAgreementDocument> {
    const doc = await prisma.standaloneAgreementDocument.findUnique({
      where: { id: documentId },
      include: { agreement: true },
    });

    if (!doc) {
      throw new AppError('Document not found.', 404);
    }

    if (!doc.agreement) {
      throw new AppError('Linked agreement not found.', 404);
    }

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || doc.agreement.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    return doc;
  }

  /**
   * Sign a standalone agreement
   */
  static async signAgreement(
    agreementId: string,
    signerName: string,
    signatureImageUrl: string,
    user: { id: string; email: string; role: Role }
  ): Promise<StandaloneAgreementSignature> {
    // 1. Fetch agreement with documents and signatures count
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
      include: {
        documents: { take: 1 },
        signatures: { take: 1 },
      },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // 2. Client ownership validation
    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || agreement.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    // 3. Agreement status check
    if (agreement.status !== 'PENDING') {
      throw new AppError('Agreement must be in PENDING status to be signed.', 400);
    }

    // 4. Identity document presence check
    if (agreement.documents.length === 0) {
      throw new AppError('At least one identity verification document must be uploaded before signing.', 400);
    }

    // 5. Prevent duplicate signatures check
    if (agreement.signatures.length > 0) {
      throw new AppError('Agreement has already been signed.', 400);
    }

    // 6. Atomically write signature and transition status to SIGNED
    return prisma.$transaction(async (tx) => {
      const signature = await tx.standaloneAgreementSignature.create({
        data: {
          agreementId,
          signerName,
          signatureImageUrl,
          signedAt: new Date(),
        },
      });

      await tx.standaloneAgreement.update({
        where: { id: agreementId },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
        },
      });

      // Update linked invoice status to ready for payment (Unpaid / Agreement Completed)
      try {
        if (agreement.linkedQuoteId && tx.quotation && typeof tx.quotation.findUnique === 'function') {
          const quote = await tx.quotation.findUnique({ where: { id: agreement.linkedQuoteId } });
          if (quote && tx.invoice && typeof tx.invoice.updateMany === 'function') {
            await tx.invoice.updateMany({
              where: { projectId: quote.projectId, deletedAt: null },
              data: { status: 'Unpaid' },
            });
          }
        }
        if (tx.invoice && typeof tx.invoice.updateMany === 'function') {
          await tx.invoice.updateMany({
            where: { clientId: agreement.clientId, status: 'Pending Agreement', deletedAt: null },
            data: { status: 'Unpaid' },
          });
        }
      } catch (invoiceErr) {
        console.warn('Linked invoice update on sign warning:', invoiceErr);
      }

      return signature;
    });
  }

  /**
   * Get signature for a standalone agreement
   */
  static async getSignature(
    agreementId: string,
    user: { id: string; email: string; role: Role }
  ): Promise<StandaloneAgreementSignature | null> {
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // Client ownership validation
    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || agreement.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    return prisma.standaloneAgreementSignature.findFirst({
      where: { agreementId },
    });
  }

  /**
   * Generate a professional signed PDF for an agreement
   */
  static async generateSignedAgreementPdf(agreementId: string): Promise<string> {
    // 1. Fetch agreement and associated relations
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
      include: {
        client: true,
        template: true,
        signatures: true,
        documents: true,
      },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // 2. Enforce SIGNED status constraint
    if (agreement.status !== 'SIGNED') {
      throw new AppError('Only signed agreements can have a generated PDF.', 400);
    }

    // 3. Setup pdf-lib Document
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;
    const pageWidth = 612; // Letter width
    const pageHeight = 792; // Letter height
    const maxTextWidth = pageWidth - 2 * margin;

    // Resolve brand profile
    const project = await prisma.project.findFirst({
      where: { clientId: agreement.clientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const quotation = project
      ? await prisma.quotation.findFirst({
          where: { projectId: project.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const invoice = project
      ? await prisma.invoice.findFirst({
          where: { projectId: project.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    let brandProfile = null;
    if (quotation?.brandId) {
      brandProfile = await prisma.companyProfile.findFirst({
        where: { id: quotation.brandId, deletedAt: null },
      });
    }

    if (!brandProfile && quotation?.brand) {
      brandProfile = await prisma.companyProfile.findFirst({
        where: { companyName: quotation.brand, deletedAt: null },
      });
    }

    const activeBrandName = brandProfile?.companyName || quotation?.brand || undefined;

    const companyProfile = await prisma.companyProfile.findFirst({
      where: { isDefault: true, deletedAt: null },
    });

    let companyLogoUrl: string | undefined = undefined;
    if (brandProfile?.logo) {
      companyLogoUrl = brandProfile.logo;
    } else if (companyProfile?.logo) {
      companyLogoUrl = companyProfile.logo;
    } else if (activeBrandName) {
      const normalized = activeBrandName.toLowerCase();
      if (normalized.includes('aaha')) {
        companyLogoUrl = aahaLogoBase64;
      } else if (normalized.includes('tiny toes')) {
        companyLogoUrl = tinyToesLogoBase64;
      }
    }

    const companyName = brandProfile?.companyName || companyProfile?.companyName || 'Artisans Production Company';
    const primaryColor = brandProfile?.primaryColor || companyProfile?.primaryColor || undefined;
    const brandColor = parseHexColor(primaryColor);

    // Load company logo dynamically (with fallback to default logo.png)
    let logoEmbed: any = null;
    if (companyLogoUrl) {
      try {
        let buffer: Buffer | null = null;
        let isPng = false;

        let logoPath = companyLogoUrl;
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
        console.error('Failed to embed dynamic logo in standalone service:', logoErr);
      }
    }

    if (!logoEmbed) {
      const logoPath = getAssetPath('logo.png');
      if (fs.existsSync(logoPath)) {
        try {
          const logoBuffer = fs.readFileSync(logoPath);
          logoEmbed = await pdfDoc.embedPng(logoBuffer);
        } catch (logoErr) {
          console.error('Failed to embed agreement logo:', logoErr);
        }
      }
    }

    const logoWidth = 60;
    const logoHeight = 48; // maintains 1024x819 aspect ratio

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 110; // Start below top header and logo
    let pageIndex = 1;

    // Helper to format dates cleanly
    const formatDate = (date: Date | string | null | undefined): string => {
      if (!date) return 'N/A';
      const d = new Date(date);
      if (isNaN(d.getTime())) return String(date);
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    // Draw header and footer decorations
    const drawPageDecorations = (p: any, idx: number) => {
      // Top brand color bar
      p.drawRectangle({
        x: margin,
        y: pageHeight - 35,
        width: maxTextWidth,
        height: 2,
        color: brandColor,
      });

      // Text Logo rectangle
      p.drawRectangle({
        x: margin,
        y: pageHeight - 30,
        width: 40,
        height: 15,
        color: brandColor,
      });

      let brandShort = 'APCO';
      if (companyName.toLowerCase().includes('aaha')) brandShort = 'AAHA';
      else if (companyName.toLowerCase().includes('tiny')) brandShort = 'TINY';

      p.drawText(brandShort, {
        x: margin + 6,
        y: pageHeight - 27,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      p.drawText(companyName.toUpperCase(), {
        x: margin + 50,
        y: pageHeight - 27,
        size: 7,
        font: fontBold,
        color: rgb(0.5, 0.5, 0.5),
      });

      p.drawText(`AGREEMENT: AGR-${agreement.id.slice(0, 8).toUpperCase()}`, {
        x: pageWidth - margin - 150,
        y: pageHeight - 27,
        size: 7,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      });

      // Draw logo in the top-right corner if loaded (on later pages)
      if (idx > 1 && logoEmbed) {
        p.drawImage(logoEmbed, {
          x: pageWidth - margin - logoWidth,
          y: pageHeight - 100,
          width: logoWidth,
          height: logoHeight,
        });
      }

      // Draw header line under logo
      p.drawLine({
        start: { x: margin, y: pageHeight - 104 },
        end: { x: pageWidth - margin, y: pageHeight - 104 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Footer line
      p.drawRectangle({
        x: margin,
        y: 45,
        width: maxTextWidth,
        height: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      p.drawText(`Agreement ID: ${agreement.id} | Generated: ${formatDate(new Date())} | DEBUG BUILD: BACKEND_STANDALONE_2026-06-25 18:45`, {
        x: margin,
        y: 32,
        size: 7,
        font: fontRegular,
        color: rgb(0.6, 0.6, 0.6),
      });

      p.drawText(`Page ${idx}`, {
        x: pageWidth - margin - 30,
        y: 32,
        size: 7,
        font: fontRegular,
        color: rgb(0.6, 0.6, 0.6),
      });
    };

    drawPageDecorations(page, pageIndex);

    // Helper to safely write lines of text and handle page breaks
    const writeLine = (text: string, isBold: boolean, fontSize: number, spacing: number, textX = margin, color = rgb(0.1, 0.1, 0.1)) => {
      const font = isBold ? fontBold : fontRegular;
      const textHeight = fontSize;

      if (y - textHeight - spacing < 80) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - 110;
        drawPageDecorations(page, pageIndex);
      }

      y -= textHeight + spacing;
      if (text) {
        page.drawText(text, {
          x: textX,
          y: y,
          size: fontSize,
          font: font,
          color: color,
        });
      }
    };

    let todayDateStr = (agreement.createdAt || new Date()).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    let eventNameStr = 'N/A';
    let eventDateStr = 'N/A';
    let formattedTotal = 'Rs. 0';
    let formattedAdvance = 'Rs. 0';
    let formattedBalance = 'Rs. 0';

    if (project) {
      eventNameStr = project.name;
      // Fetch successful payments logged for project
      const payments = await prisma.payment.findMany({
        where: {
          invoice: { projectId: project.id },
          status: { in: ['Paid', 'SUCCESSFUL', 'Paid', 'successful', 'paid', 'Successful'] },
        },
      });
      const advancePaidSum = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      const taskWithEvent = await prisma.task.findFirst({
        where: { projectId: project.id, eventId: { not: null } },
        include: { event: true },
      });

      let resolvedEvent = taskWithEvent?.event || null;
      if (!resolvedEvent) {
        resolvedEvent = await prisma.event.findFirst({
          where: { clientId: agreement.clientId },
          orderBy: { date: 'asc' },
        });
      }

      if (resolvedEvent) {
        eventNameStr = resolvedEvent.name;
        if (resolvedEvent.date) {
          eventDateStr = new Date(resolvedEvent.date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          });
        }
      }

      const totalAmountVal = quotation ? Number(quotation.amount) : (invoice ? Number(invoice.amount) : 0);
      const advanceAmountVal = advancePaidSum;
      const balanceAmountVal = totalAmountVal - advanceAmountVal;

      formattedTotal = `Rs. ${totalAmountVal.toLocaleString('en-IN')}`;
      formattedAdvance = `Rs. ${advanceAmountVal.toLocaleString('en-IN')}`;
      formattedBalance = `Rs. ${balanceAmountVal.toLocaleString('en-IN')}`;
    }

    // --- DRAW PAGE 1 PREMIUM HEADER BLOCK ---
    // Title on the top left
    page.drawText(agreement.template.name.toUpperCase(), {
      x: margin,
      y: pageHeight - 70,
      size: 13,
      font: fontBold,
      color: brandColor,
      lineHeight: 16,
    });

    // Version and Date metadata on the left below the title
    page.drawText(`Agreement Number: AGR-${agreement.id.slice(0, 8).toUpperCase()}`, {
      x: margin,
      y: pageHeight - 100,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`Version: ${agreement.template.version || '1.0'}`, {
      x: margin,
      y: pageHeight - 112,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText(`Date: ${todayDateStr}`, {
      x: margin,
      y: pageHeight - 124,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Logo on the top right
    if (logoEmbed) {
      page.drawImage(logoEmbed, {
        x: pageWidth - margin - logoWidth,
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
        x: pageWidth - margin - textWidth,
        y: yPos,
        size: fontSize,
        font: font,
        color: color,
      });
    };

    const brandingLines = companyName.split('\n');
    for (const line of brandingLines) {
      drawTextRight(line, detailY, 8, fontBold, rgb(0.15, 0.15, 0.15));
      detailY -= 10;
    }

    const companyTagline = brandProfile?.tagline || companyProfile?.tagline || undefined;
    const companyPhone = brandProfile?.phone || companyProfile?.phone || undefined;
    const companyEmail = brandProfile?.email || companyProfile?.email || undefined;
    const companyAddress = brandProfile?.address || companyProfile?.address || undefined;

    if (companyTagline) {
      const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      drawTextRight(companyTagline, detailY, 7.5, fontOblique, rgb(0.4, 0.4, 0.4));
      detailY -= 9;
    }
    if (companyPhone) {
      drawTextRight(`Phone: ${companyPhone}`, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
      detailY -= 9;
    }
    if (companyEmail) {
      drawTextRight(`Email: ${companyEmail}`, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
      detailY -= 9;
    }
    if (companyAddress) {
      const addrLines = companyAddress.split('\n');
      for (const addrLine of addrLines) {
        drawTextRight(addrLine, detailY, 7.5, fontRegular, rgb(0.4, 0.4, 0.4));
        detailY -= 9;
      }
    }

    // 2. Client & Agreement Metadata Box
    const boxTopY = Math.min(detailY - 15, pageHeight - 195);
    const boxHeight = 85;
    const boxY = boxTopY - boxHeight;
    
    page.drawRectangle({
      x: margin,
      y: boxY,
      width: maxTextWidth,
      height: boxHeight,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });

    const boxStartY = boxY + boxHeight - 5;
    const leftColX = margin + 15;
    const rightColX = margin + 270;

    page.drawText('CLIENT INFORMATION', { x: leftColX, y: boxStartY - 15, size: 8, font: fontBold, color: brandColor });
    page.drawText('AGREEMENT DETAILS', { x: rightColX, y: boxStartY - 15, size: 8, font: fontBold, color: brandColor });

    page.drawText(`Client Name: ${agreement.client.name}`, { x: leftColX, y: boxStartY - 30, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Template: ${agreement.template.name}`, { x: rightColX, y: boxStartY - 30, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

    page.drawText(`Email: ${agreement.client.email}`, { x: leftColX, y: boxStartY - 45, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Version: ${agreement.template.version}`, { x: rightColX, y: boxStartY - 45, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

    page.drawText(`Phone: ${agreement.client.phone || 'N/A'}`, { x: leftColX, y: boxStartY - 60, size: 9, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Status: ${agreement.status}`, { x: rightColX, y: boxStartY - 60, size: 9, font: fontBold, color: rgb(0.1, 0.6, 0.2) });

    y = boxY - 15;

    // 3. Agreement Text Content
    let content = agreement.generatedContent
      .replace(/●/g, '-')
      .replace(/₹/g, 'Rs. ');

    content = content
      .replace(/\{\{\s*CLIENT_NAME\s*\}\}/gi, agreement.client.name)
      .replace(/\{\{\s*EVENT_NAME\s*\}\}/gi, eventNameStr)
      .replace(/\{\{\s*EVENT_DATE\s*\}\}/gi, eventDateStr)
      .replace(/\{\{\s*TOTAL_AMOUNT\s*\}\}/gi, formattedTotal)
      .replace(/\{\{\s*ADVANCE_AMOUNT\s*\}\}/gi, formattedAdvance)
      .replace(/\{\{\s*BALANCE_AMOUNT\s*\}\}/gi, formattedBalance)
      .replace(/\{\{\s*TODAY_DATE\s*\}\}/gi, todayDateStr);

    try {
      fs.appendFileSync(
        path.join(process.cwd(), 'pdf-debug.log'),
        `[${new Date().toISOString()}] [generateSignedAgreementPdf] Called for agreementId=${agreementId}:\n` +
        `  client: ${agreement.client.name}, eventNameStr: ${eventNameStr}\n` +
        `  Content after replacement (first 800 chars):\n${content.slice(0, 800)}\n` +
        `  Does content contain CLIENT_NAME? ${content.includes('CLIENT_NAME')}\n` +
        `  Does content contain %i? ${content.includes('%i')}\n\n`
      );
    } catch (err) {
      console.error('Failed to write pdf-debug.log in standalone service:', err);
    }

    const paragraphs = content.split('\n');

    for (const paragraph of paragraphs) {
      let trimmed = paragraph.trim();
      if (!trimmed) {
        writeLine('', false, 10, 4);
        continue;
      }

      // Skip redundant top details as they are shown inside client metadata box
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

      // Check formatting markers robustly
      trimmed = trimmed.replace(/^-\s*%i/gi, '•');
      trimmed = trimmed.replace(/^●\s*%i/gi, '•');
      trimmed = trimmed.replace(/^%i/gi, '•');
      trimmed = trimmed.replace(/%i/gi, '');

      // Word wrapping
      const words = trimmed.split(' ');
      let currentLine = '';
      const wrappedLines: string[] = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = fontRegular.widthOfTextAtSize(testLine, 10);

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

      for (let i = 0; i < wrappedLines.length; i++) {
        const spacing = i === wrappedLines.length - 1 ? 6 : 2;
        writeLine(wrappedLines[i], false, 10, spacing);
      }
    }

    // 4. Signature Section
    const signature = agreement.signatures[0];
    if (signature) {
      if (y - 120 < 80) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - margin - 30;
        drawPageDecorations(page, pageIndex);
      }

      y -= 10;
      page.drawRectangle({
        x: margin,
        y: y,
        width: maxTextWidth,
        height: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      writeLine('SIGNATURE & ACCEPTANCE', true, 11, 4, margin, rgb(0.23, 0.51, 0.96));
      writeLine('By signing below, the client agrees to be bound by the terms and conditions outlined in this agreement.', false, 8, 8, margin, rgb(0.4, 0.4, 0.4));

      const sigY = y;
      writeLine(`Signer Name: ${signature.signerName}`, true, 9, 4);
      writeLine(`Signed Date: ${formatDate(signature.signedAt)}`, false, 9, 15);

      try {
        const base64Data = signature.signatureImageUrl.replace(/^data:image\/\w+;base64,/, '');
        const signatureBuffer = Buffer.from(base64Data, 'base64');
        
        let img;
        if (signature.signatureImageUrl.includes('image/png')) {
          img = await pdfDoc.embedPng(signatureBuffer);
        } else {
          img = await pdfDoc.embedJpg(signatureBuffer);
        }

        page.drawImage(img, {
          x: pageWidth - margin - 150,
          y: sigY - 45,
          width: 120,
          height: 40,
        });

        if (y > sigY - 50) {
          y = sigY - 50;
        }
      } catch (err) {
        writeLine('[Signature image could not be rendered]', false, 8, 4, margin, rgb(0.8, 0.2, 0.2));
      }
    }

    // 5. Verification Section
    if (agreement.documents.length > 0) {
      if (y - 80 < 80) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - margin - 30;
        drawPageDecorations(page, pageIndex);
      }

      y -= 15;
      page.drawRectangle({
        x: margin,
        y: y,
        width: maxTextWidth,
        height: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      writeLine('IDENTITY VERIFICATION DOCUMENTS REGISTERED', true, 10, 6, margin, rgb(0.23, 0.51, 0.96));

      for (const doc of agreement.documents) {
        writeLine(`- Document Type: ${doc.documentType} | Uploaded At: ${formatDate(doc.uploadedAt)}`, false, 9, 3);
      }
    }

    // Generate Document ID and Verification URL
    const resolvedPrefixForDoc = companyProfile?.invoicePrefix || 'APCO';
    const documentId = await DocumentRegistryService.generateDocumentId(resolvedPrefixForDoc);
    const verificationUrl = DocumentRegistryService.getVerificationUrl(documentId);

    // Apply verification link above the footer
    await applyVerificationFooterToDoc(pdfDoc, verificationUrl, { hasBlackFooter: false, margin: 50 });

    // 6. Save PDF to disk
    const pdfBytes = await pdfDoc.save();
    const { securedBuffer, fingerprint } = await securePdfDocument(Buffer.from(pdfBytes));
    const dirPath = path.resolve(process.cwd(), 'uploads/standalone-agreements/pdfs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const fileName = `signed-agreement-${agreement.id}.pdf`;
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, securedBuffer);

    const relativePath = `uploads/standalone-agreements/pdfs/${fileName}`;

    // Register document in the Document Registry
    await DocumentRegistryService.registerDocument(documentId, {
      documentNumber: agreement.agreementCode || agreement.id,
      documentType: 'AGREEMENT',
      clientId: agreement.clientId,
      projectId: project?.id || null,
      companyId: brandProfile?.id || companyProfile?.id || null,
      sha256Hash: fingerprint,
    });

    // Update database fields
    await prisma.standaloneAgreement.update({
      where: { id: agreementId },
      data: {
        pdfFilePath: relativePath,
        pdfGeneratedAt: new Date(),
      },
    });

    return relativePath;
  }

  /**
   * Link an existing standalone agreement to a quotation
   */
  static async linkQuotation(agreementId: string, linkedQuoteId: string): Promise<StandaloneAgreement> {
    // 1. Fetch agreement
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // 2. Fetch quotation to verify it exists and belongs to the same client
    const quotation = await prisma.quotation.findFirst({
      where: { id: linkedQuoteId, deletedAt: null },
    });
    if (!quotation) {
      throw new AppError('Quotation not found.', 400);
    }

    if (quotation.clientId !== agreement.clientId) {
      throw new AppError('Quotation does not belong to the same client as this agreement.', 400);
    }

    // 3. Update standalone agreement with linkedQuoteId
    return prisma.standaloneAgreement.update({
      where: { id: agreementId },
      data: {
        linkedQuoteId,
      },
    });
  }

  /**
   * Automatically handle quotation acceptance: create or return active PENDING agreement
   */
  static async acceptQuotation(quotationId: string): Promise<StandaloneAgreement> {
    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, deletedAt: null },
      include: { client: true, project: true, items: true },
    });

    if (!quotation) {
      throw new AppError('Quotation not found.', 404);
    }

    // 1. Update quotation status to ACCEPTED
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'ACCEPTED' },
    });

    // 2. Generate Invoice if not already created for this project / quotation
    let existingInvoice = await prisma.invoice.findFirst({
      where: { projectId: quotation.projectId, deletedAt: null },
    });

    if (!existingInvoice) {
      const { generateDocumentNumber } = require('../../utils/number-generator');
      const prefix = quotation.brand ? quotation.brand.slice(0, 3).toUpperCase() : 'APCO';
      const invoiceNumber = await generateDocumentNumber('INV', prefix);

      const invoiceCode = await DisplayIdGenerator.getNextId('INV');
      await prisma.invoice.create({
        data: {
          invoiceNumber,
          invoiceCode,
          projectId: quotation.projectId,
          clientId: quotation.clientId,
          amount: quotation.amount,
          status: 'Pending Agreement',
          dueDate: quotation.validUntil || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          discountValue: quotation.discountValue,
          discountType: quotation.discountType,
          taxPercent: quotation.taxPercent,
          shippingCost: quotation.shippingCost,
          notes: quotation.notes,
          termsSummary: quotation.termsSummary,
          companyLogoUrl: quotation.companyLogoUrl,
          paymentTerms: quotation.paymentTerms,
          templateId: quotation.templateId,
          templateVersion: quotation.templateVersion,
          brandId: quotation.brandId,
          brand: quotation.brand,
          items: quotation.items && quotation.items.length > 0 ? {
            create: quotation.items.map((item: any) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            }))
          } : undefined
        }
      });
    }

    let pendingAgreement = await prisma.standaloneAgreement.findFirst({
      where: {
        clientId: quotation.clientId,
        status: 'PENDING',
        OR: [
          { linkedQuoteId: quotation.id },
          { linkedQuoteId: null },
        ],
      },
      include: {
        template: true,
        signatures: true,
        documents: true,
      },
    });

    if (pendingAgreement) {
      if (!pendingAgreement.linkedQuoteId) {
        pendingAgreement = await prisma.standaloneAgreement.update({
          where: { id: pendingAgreement.id },
          data: { linkedQuoteId: quotation.id },
          include: {
            template: true,
            signatures: true,
            documents: true,
          },
        });
      }
      return pendingAgreement;
    }

    let template = null;
    if (quotation.templateId) {
      template = await prisma.standaloneAgreementTemplate.findUnique({
        where: { id: quotation.templateId },
      });
    }

    if (!template) {
      template = await prisma.standaloneAgreementTemplate.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!template) {
      template = await prisma.standaloneAgreementTemplate.create({
        data: {
          name: 'Standard Photography Agreement',
          version: '1.0',
          content: 'Standard Photography Service Agreement Content',
          isActive: true,
        },
      });
    }

    const agreementCode = await DisplayIdGenerator.getNextId('AGR');
    return prisma.standaloneAgreement.create({
      data: {
        clientId: quotation.clientId,
        templateId: template.id,
        title: template.name,
        status: 'PENDING',
        generatedContent: template.content,
        assignedAt: new Date(),
        linkedQuoteId: quotation.id,
        agreementCode,
      },
      include: {
        template: true,
        signatures: true,
        documents: true,
      },
    });
  }

  /**
   * Formatted Client Agreements List API (GET /client/agreements)
   */
  static async getClientAgreementsList(user: { id: string; email: string; role: Role }, clientIdParam?: string): Promise<any[]> {
    let clientId = clientIdParam;

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client) return [];
      clientId = client.id;
    } else if (!clientId && user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    const whereClause: any = {};
    if (clientId) {
      whereClause.clientId = clientId;
    }

    const agreements = await prisma.standaloneAgreement.findMany({
      where: whereClause,
      include: {
        template: true,
        signatures: true,
        documents: true,
        client: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const companyProfile = await prisma.companyProfile.findFirst({
      where: { isDefault: true, deletedAt: null },
    });

    const result = [];
    for (const agr of agreements) {
      let brandName = companyProfile?.companyName || 'Artisans Production Company';
      if (agr.linkedQuoteId) {
        const quotation = await prisma.quotation.findUnique({ where: { id: agr.linkedQuoteId } });
        if (quotation?.brand) {
          brandName = quotation.brand;
        }
      }

      const isPdfAvail = Boolean(agr.pdfFilePath || agr.pdfGeneratedAt);
      result.push({
        id: agr.id,
        name: agr.title || agr.template?.name || 'Service Agreement',
        brand: brandName,
        templateId: agr.templateId,
        version: agr.template?.version || '1.0',
        status: agr.status === 'SIGNED' ? 'SIGNED' : (agr.status === 'REVOKED' ? 'REVOKED' : 'PENDING'),
        assignedAt: agr.assignedAt.toISOString(),
        signedAt: agr.signedAt ? agr.signedAt.toISOString() : null,
        pdfAvailable: isPdfAvail,
        downloadUrl: isPdfAvail ? `/api/standalone-agreements/${agr.id}/pdf` : null,
      });
    }

    return result;
  }

  /**
   * Formatted Client Agreement Details API (GET /client/agreements/:id)
   */
  static async getClientAgreementDetails(agreementId: string, user: { id: string; email: string; role: Role }): Promise<any> {
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
      include: {
        template: true,
        signatures: true,
        documents: true,
        client: true,
      },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || agreement.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    let quotation: any = null;
    let project: any = null;
    if (agreement.linkedQuoteId) {
      quotation = await prisma.quotation.findUnique({
        where: { id: agreement.linkedQuoteId },
        include: { items: true },
      });
    }

    if (!quotation) {
      project = await prisma.project.findFirst({
        where: { clientId: agreement.clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (project) {
        quotation = await prisma.quotation.findFirst({
          where: { projectId: project.id, deletedAt: null },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    let brandProfile = null;
    if (quotation?.brandId) {
      brandProfile = await prisma.companyProfile.findFirst({
        where: { id: quotation.brandId, deletedAt: null },
      });
    }
    const companyProfile = await prisma.companyProfile.findFirst({
      where: { isDefault: true, deletedAt: null },
    });

    const brandName = brandProfile?.companyName || quotation?.brand || companyProfile?.companyName || 'Artisans Production Company';

    const dynamicPlaceholders = {
      clientName: agreement.client.name,
      clientEmail: agreement.client.email,
      clientPhone: agreement.client.phone || '',
      clientAddress: agreement.client.address || '',
      companyName: brandName,
      quotationNumber: quotation?.quotationNumber || '',
      totalAmount: quotation ? Number(quotation.amount) : 0,
      assignedDate: agreement.assignedAt.toISOString(),
      signedDate: agreement.signedAt ? agreement.signedAt.toISOString() : null,
    };

    const isPdfAvail = Boolean(agreement.pdfFilePath || agreement.pdfGeneratedAt);

    return {
      id: agreement.id,
      name: agreement.title || agreement.template?.name || 'Service Agreement',
      brand: brandName,
      status: agreement.status,
      assignedAt: agreement.assignedAt,
      signedAt: agreement.signedAt,
      template: {
        id: agreement.template.id,
        name: agreement.template.name,
        version: agreement.template.version,
        content: agreement.generatedContent || agreement.template.content,
      },
      dynamicPlaceholders,
      signatureState: {
        isSigned: agreement.status === 'SIGNED',
        signedAt: agreement.signedAt,
        signatures: agreement.signatures,
      },
      pdfInformation: {
        pdfAvailable: isPdfAvail,
        pdfGeneratedAt: agreement.pdfGeneratedAt,
        downloadUrl: isPdfAvail ? `/api/standalone-agreements/${agreement.id}/pdf` : null,
      },
      identityDocuments: agreement.documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        uploadedAt: doc.uploadedAt,
        downloadUrl: `/api/standalone-agreements/documents/${doc.id}/download`,
      })),
    };
  }
}
