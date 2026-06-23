import { Request, Response, NextFunction } from 'express';
import { StandaloneAgreementsService } from './standalone-agreements.service';
import { Role, DocumentType } from '@prisma/client';
import { AppError } from '../../middleware/error';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { prisma } from '../../config/database';
import fs from 'fs';
import path from 'path';

/**
 * POST /standalone-agreement-templates
 * Create a new standalone template (Admin/Manager only)
 */
export async function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create agreement templates.', 403);
    }

    const { name, version, content } = req.body;
    const template = await StandaloneAgreementsService.createTemplate({ name, version, content });

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_TEMPLATE_CREATE',
      details: { templateId: template.id, name: template.name },
      ...meta,
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreement-templates
 * List all templates
 */
export async function getTemplates(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const templates = await StandaloneAgreementsService.getTemplates();
    res.status(200).json(templates);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreement-templates/:id
 * Get template detail by ID
 */
export async function getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const template = await StandaloneAgreementsService.getTemplateById(id);
    res.status(200).json(template);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /standalone-agreement-templates/:id
 * Update template details (Admin/Manager only)
 */
export async function updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can update agreement templates.', 403);
    }

    const updated = await StandaloneAgreementsService.updateTemplate(id, req.body);

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_TEMPLATE_UPDATE',
      details: { templateId: id, updatedFields: Object.keys(req.body) },
      ...meta,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /standalone-agreement-templates/:id
 * Delete template (Admin/Manager only)
 */
export async function deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { id } = req.params;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete agreement templates.', 403);
    }

    const deleted = await StandaloneAgreementsService.deleteTemplate(id);

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_TEMPLATE_DELETE',
      details: { templateId: id, name: deleted.name },
      ...meta,
    });

    res.status(200).json({ message: 'Standalone template deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /standalone-agreements/assign
 * Assign standalone agreement to a client (Admin/Manager only)
 */
export async function assignAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can assign agreements to clients.', 403);
    }

    const { clientId, templateId } = req.body;
    const agreement = await StandaloneAgreementsService.assignAgreement(clientId, templateId);

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_AGREEMENT_ASSIGN',
      details: { agreementId: agreement.id, clientId, templateId },
      ...meta,
    });

    res.status(201).json(agreement);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /clients/:clientId/standalone-agreement
 * Get latest standalone agreement details for a client
 */
export async function getClientAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId } = req.params;
    const user = req.user!;

    // Client role is allowed to view their own agreement. Other roles must be Admin/Manager.
    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || client.id !== clientId) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access denied.', 403);
    }

    const agreements = await StandaloneAgreementsService.getClientAgreement(clientId);
    const mapped = agreements.map((agreement) => ({
      ...agreement,
      documents: agreement.documents?.map((doc: any) => ({
        ...doc,
        fileUrl: `/api/standalone-agreements/documents/${doc.id}/download`,
      })),
    }));

    res.status(200).json(mapped);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /standalone-agreements/:agreementId/documents
 * Upload an identity verification document for an agreement
 */
export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;
    const { documentType } = req.body;
    const meta = extractReqMeta(req);

    if (!req.file) {
      throw new AppError('File is required.', 400);
    }

    // Verify agreement ownership / existence
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) {
      // Clean up the uploaded file on disk immediately since DB transaction is aborted
      fs.unlinkSync(req.file.path);
      throw new AppError('Standalone agreement not found.', 404);
    }

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || agreement.clientId !== client.id) {
        fs.unlinkSync(req.file.path);
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      fs.unlinkSync(req.file.path);
      throw new AppError('Access denied.', 403);
    }

    // Register document in DB with the relative file path normalized
    const filePath = req.file.path.replace(/\\/g, '/');
    const doc = await StandaloneAgreementsService.uploadDocument(
      agreementId,
      documentType as DocumentType,
      filePath
    );

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_AGREEMENT_DOCUMENT_UPLOAD',
      details: { documentId: doc.id, agreementId, documentType },
      ...meta,
    });

    res.status(201).json({
      ...doc,
      fileUrl: `/api/standalone-agreements/documents/${doc.id}/download`,
    });
  } catch (error) {
    // If a file was uploaded but we hit an error, clean it up
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
}

/**
 * GET /standalone-agreements/:agreementId/documents
 * Get list of uploaded documents for an agreement
 */
export async function getDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;

    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
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

    const docs = await StandaloneAgreementsService.getDocuments(agreementId);
    const mappedDocs = docs.map((doc) => ({
      ...doc,
      fileUrl: `/api/standalone-agreements/documents/${doc.id}/download`,
    }));
    res.status(200).json(mappedDocs);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /standalone-agreements/documents/:documentId
 * Delete a verification document (Admin/Manager or Client owner only)
 */
export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { documentId } = req.params;
    const meta = extractReqMeta(req);

    const doc = await prisma.standaloneAgreementDocument.findUnique({
      where: { id: documentId },
      include: { agreement: true },
    });
    if (!doc) {
      throw new AppError('Document not found.', 404);
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

    // Delete record from DB
    await StandaloneAgreementsService.deleteDocument(documentId);

    // Clean up physical file on disk using stored relative/absolute path
    const filePath = path.isAbsolute(doc.fileUrl)
      ? doc.fileUrl
      : path.join(process.cwd(), doc.fileUrl);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_AGREEMENT_DOCUMENT_DELETE',
      details: { documentId, agreementId: doc.agreementId },
      ...meta,
    });

    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreements/documents/download/:filename
 * Download / stream verification document (Admin/Manager or Client owner only)
 */
export async function downloadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { documentId } = req.params;

    // Use service layer to fetch and verify permissions
    const doc = await StandaloneAgreementsService.getDocumentForDownload(documentId, user);

    const filePath = path.isAbsolute(doc.fileUrl)
      ? doc.fileUrl
      : path.join(process.cwd(), doc.fileUrl);

    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found on disk.', 404);
    }

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /standalone-agreements/:agreementId/sign
 * Sign a standalone agreement
 */
export async function signAgreement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;
    const { signerName, signatureImageUrl } = req.body;
    const meta = extractReqMeta(req);

    const signature = await StandaloneAgreementsService.signAgreement(
      agreementId,
      signerName,
      signatureImageUrl,
      user
    );

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_AGREEMENT_SIGN',
      details: { agreementId, signatureId: signature.id, signerName },
      ...meta,
    });

    res.status(201).json(signature);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreements/:agreementId/signature
 * Get signature details for an agreement
 */
export async function getSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;

    const signature = await StandaloneAgreementsService.getSignature(agreementId, user);
    if (!signature) {
      res.status(200).json(null);
      return;
    }

    res.status(200).json(signature);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreements/:agreementId/signature/image
 * Download / serve physical signature image file (Admin/Manager or Client owner only)
 */
export async function downloadSignatureImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;

    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
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

    const signature = await prisma.standaloneAgreementSignature.findFirst({
      where: { agreementId },
    });
    if (!signature) {
      throw new AppError('Signature image not found.', 404);
    }

    const uploadDir = path.join(process.cwd(), 'uploads/standalone-agreements');
    if (!fs.existsSync(uploadDir)) {
      throw new AppError('Signature image file not found on disk.', 404);
    }

    const files = fs.readdirSync(uploadDir);
    const filename = files.find(f => f.startsWith(`signature-${agreementId}.`));

    if (!filename) {
      throw new AppError('Signature image file not found on disk.', 404);
    }

    const filePath = path.join(uploadDir, filename);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /standalone-agreements/:agreementId/generate-pdf
 * Generate professional PDF for signed standalone agreement
 */
export async function generatePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;
    const meta = extractReqMeta(req);

    // Fetch agreement to perform security checks and validation
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // Role / client ownership validation
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

    // Enforce status constraint: Only SIGNED agreements can generate PDF
    if (agreement.status !== 'SIGNED') {
      throw new AppError('Only signed agreements can have a generated PDF.', 400);
    }

    const filePath = await StandaloneAgreementsService.generateSignedAgreementPdf(agreementId);

    await logAudit({
      userId: user.id,
      action: 'STANDALONE_AGREEMENT_PDF_GENERATE',
      details: { agreementId, pdfFilePath: filePath },
      ...meta,
    });

    res.status(200).json({
      message: 'PDF generated successfully.',
      pdfFilePath: filePath,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /standalone-agreements/:agreementId/pdf
 * Download / serve professional signed PDF
 */
export async function downloadPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { agreementId } = req.params;

    // Fetch agreement for security verification
    const agreement = await prisma.standaloneAgreement.findUnique({
      where: { id: agreementId },
    });

    if (!agreement) {
      throw new AppError('Standalone agreement not found.', 404);
    }

    // Role / client ownership validation
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

    // Enforce status constraint: Only SIGNED agreements can download PDF
    if (agreement.status !== 'SIGNED') {
      throw new AppError('Only signed agreements can have a generated PDF.', 400);
    }

    let filePath = agreement.pdfFilePath;
    let absolutePath = filePath ? (path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)) : null;

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      // Auto-generate if file missing on disk but agreement is signed
      filePath = await StandaloneAgreementsService.generateSignedAgreementPdf(agreementId);
      absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=signed-agreement-${agreementId}.pdf`);
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
}




