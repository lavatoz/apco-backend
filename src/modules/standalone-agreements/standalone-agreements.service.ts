import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { StandaloneAgreementTemplate, StandaloneAgreement, StandaloneAgreementDocument, StandaloneAgreementSignature, DocumentType, Role } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

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
  static async assignAgreement(clientId: string, templateId: string): Promise<StandaloneAgreement> {
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
    return prisma.standaloneAgreement.create({
      data: {
        clientId,
        templateId,
        title: template.name,
        status: 'PENDING',
        generatedContent: template.content,
        assignedAt: new Date(),
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

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin - 30; // Start below top header boundary
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
      // Top blue bar
      p.drawRectangle({
        x: margin,
        y: pageHeight - 35,
        width: maxTextWidth,
        height: 2,
        color: rgb(0.23, 0.51, 0.96),
      });

      // Text Logo rectangle
      p.drawRectangle({
        x: margin,
        y: pageHeight - 30,
        width: 40,
        height: 15,
        color: rgb(0.23, 0.51, 0.96),
      });

      p.drawText('APCO', {
        x: margin + 6,
        y: pageHeight - 27,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      p.drawText('ARTISANS PRODUCTION COMPANY', {
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

      // Footer line
      p.drawRectangle({
        x: margin,
        y: 45,
        width: maxTextWidth,
        height: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      });

      p.drawText(`Agreement ID: ${agreement.id} | Generated: ${formatDate(new Date())}`, {
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

      if (y - textHeight - spacing < 60) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        pageIndex++;
        y = pageHeight - margin - 30;
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

    // 1. Title Block (Page 1)
    writeLine('STANDALONE SERVICE AGREEMENT', true, 16, 8);
    writeLine(`Agreement Number: AGR-${agreement.id.slice(0, 8).toUpperCase()}`, true, 10, 4);
    writeLine(`Generated Date: ${formatDate(new Date())}`, false, 9, 12, margin, rgb(0.4, 0.4, 0.4));

    // 2. Client & Agreement Metadata Box
    const boxHeight = 85;
    const boxY = y - boxHeight - 10;
    
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

    page.drawText('CLIENT INFORMATION', { x: leftColX, y: boxStartY - 15, size: 8, font: fontBold, color: rgb(0.23, 0.51, 0.96) });
    page.drawText('AGREEMENT DETAILS', { x: rightColX, y: boxStartY - 15, size: 8, font: fontBold, color: rgb(0.23, 0.51, 0.96) });

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

    const paragraphs = content.split('\n');

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        writeLine('', false, 10, 4);
        continue;
      }

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
      if (y - 120 < 60) {
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
      if (y - 80 < 60) {
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

    // 6. Save PDF to disk
    const pdfBytes = await pdfDoc.save();
    const dirPath = path.resolve(process.cwd(), 'uploads/standalone-agreements/pdfs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const fileName = `signed-agreement-${agreement.id}.pdf`;
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, pdfBytes);

    const relativePath = `uploads/standalone-agreements/pdfs/${fileName}`;

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
}
