import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { calculateDocumentHash } from '../../services/pdf-security.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { AppError } from '../../middleware/error';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Schema for request validation
const VerifyParamsSchema = z.object({
  verificationId: z.string().uuid('Invalid verification ID format.')
});

/**
 * Fallback mechanism to resolve the physical file buffer from disk
 */
async function getFileBuffer(file: any): Promise<Buffer | null> {
  const candidatePaths = [
    path.resolve(process.cwd(), file.key),
    path.resolve(process.cwd(), 'uploads/quotations/pdfs', file.originalName),
    path.resolve(process.cwd(), 'uploads/agreements/pdfs', file.originalName),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return fs.readFileSync(p);
    }
  }

  // Optionally download from Google Drive if Drive ID exists
  if (file.googleDriveFileId) {
    try {
      const googleDriveService = require('../../services/google-drive.service');
      const stream = await googleDriveService.downloadFileStream(file.googleDriveFileId);
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      console.error('[Verify] Google Drive download failed:', err);
    }
  }

  return null;
}

/**
 * Controller: Public QR Document Verification Endpoint
 * GET /api/public/verify/:verificationId
 */
export async function verifyPublicDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const meta = extractReqMeta(req);
    
    // 1. Validate UUID parameter using Zod
    const parsedParams = VerifyParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      // Create a log entry for verification failure due to invalid ID
      await logAudit({
        userId: null,
        action: 'DOCUMENT_VERIFICATION_FAIL',
        details: { verificationId: req.params.verificationId, reason: 'Invalid UUID format', result: 'INVALID_ID' },
        ipAddress: meta.ipAddress,
        requestId: meta.requestId,
        userAgent: meta.userAgent,
      });
      throw new AppError(parsedParams.error.errors[0].message, 400);
    }

    const { verificationId } = parsedParams.data;

    // 2. Search database File table
    const file = await prisma.file.findUnique({
      where: { id: verificationId }
    });

    if (!file) {
      // Create a log entry for NOT_FOUND
      await logAudit({
        userId: null,
        action: 'DOCUMENT_VERIFICATION_FAIL',
        details: { verificationId, reason: 'File record not found', result: 'NOT_FOUND' },
        ipAddress: meta.ipAddress,
        requestId: meta.requestId,
        userAgent: meta.userAgent,
      });

      res.status(404).json({
        verificationStatus: 'NOT_FOUND'
      });
      return;
    }

    // 3. Resolve linked entity metadata (Client Name, Event/Project Name, Document Number/Code, Type)
    let documentType = file.category || 'Document';
    let documentNumber = 'N/A';
    let clientName = 'N/A';
    let eventName: string | undefined = undefined;
    let isRevoked = !!file.deletedAt;
    let isExpired = false;

    // Try finding linked Agreement
    const agreement = await prisma.agreement.findFirst({
      where: { fileId: file.id },
      include: { client: true, project: true }
    });

    if (agreement) {
      documentType = 'Agreement';
      documentNumber = agreement.agreementNumber;
      clientName = agreement.client.name;
      eventName = agreement.project.name;
      if (agreement.status === 'REVOKED' || agreement.status === 'Revoked') {
        isRevoked = true;
      }
    } else if (file.category === 'Quotations') {
      // Find linked Quotation
      const matches = file.originalName.match(/Quotation_([A-Z0-9-]+)/i);
      const quotationNumber = matches ? matches[1] : undefined;
      const quotation = await prisma.quotation.findFirst({
        where: {
          OR: [
            { quotationNumber: quotationNumber || undefined },
            { projectId: file.projectId || undefined }
          ]
        },
        include: { client: true, project: true }
      });

      if (quotation) {
        documentType = 'Quotation';
        documentNumber = quotation.quotationNumber;
        clientName = quotation.client.name;
        eventName = quotation.project.name;
        if (quotation.status === 'REVOKED' || quotation.status === 'Revoked') {
          isRevoked = true;
        }
        if (quotation.validUntil && new Date(quotation.validUntil) < new Date()) {
          isExpired = true;
        }
      }
    } else if (file.projectId) {
      // Fallback: load project details if no matching quotation/agreement found
      const project = await prisma.project.findUnique({
        where: { id: file.projectId },
        include: { client: true }
      });
      if (project) {
        clientName = project.client.name;
        eventName = project.name;
      }
    }

    // 4. Verify physical file integrity if file exists on disk/storage
    let verificationStatus = 'VERIFIED';
    const fileBuffer = await getFileBuffer(file);

    if (isRevoked) {
      verificationStatus = 'REVOKED';
    } else if (isExpired) {
      verificationStatus = 'EXPIRED';
    } else if (fileBuffer) {
      const currentHash = calculateDocumentHash(fileBuffer);
      if (currentHash !== file.hash) {
        verificationStatus = 'TAMPERED';
      }
    }

    // 5. Log verification attempt in AuditLog
    await logAudit({
      userId: null,
      action: 'DOCUMENT_VERIFICATION',
      details: { verificationId, verificationStatus, documentType, documentNumber },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    // 6. Return response containing ONLY required fields
    res.status(200).json({
      documentType,
      documentNumber,
      clientName,
      ...(eventName ? { eventName } : {}),
      generatedDate: file.createdAt,
      verificationStatus,
      sha256VerificationResult: file.hash
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Public Document ID Verification Endpoint
 * GET /verify/:documentId
 */
export async function verifyDocumentByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const meta = extractReqMeta(req);
    const { documentId } = req.params;

    // 1. Search database DocumentRegistry table
    const docRegistry = await prisma.documentRegistry.findUnique({
      where: { documentId }
    });

    if (!docRegistry) {
      // Create a log entry for verification failure due to not found Document ID
      await logAudit({
        userId: null,
        action: 'DOCUMENT_VERIFICATION_FAIL',
        details: { documentId, reason: 'Document registry record not found', result: 'NOT_FOUND' },
        ipAddress: meta.ipAddress,
        requestId: meta.requestId,
        userAgent: meta.userAgent,
      });

      res.status(404).json({
        verificationStatus: 'NOT_FOUND',
        message: 'Document verification record not found.'
      });
      return;
    }

    // 2. Resolve client name, brand name
    const client = await prisma.client.findUnique({
      where: { id: docRegistry.clientId }
    });

    let companyName = 'APCO Productions';
    if (docRegistry.companyId) {
      const company = await prisma.companyProfile.findUnique({
        where: { id: docRegistry.companyId }
      });
      if (company) {
        companyName = company.companyName;
      }
    }

    // 3. Check status
    let verificationStatus = 'VERIFIED';
    if (docRegistry.status === 'REVOKED' || docRegistry.status === 'Revoked') {
      verificationStatus = 'REVOKED';
    }

    // 4. Verify physical file integrity if file exists on disk/storage
    const file = await prisma.file.findFirst({
      where: { hash: docRegistry.sha256Hash }
    });

    if (file) {
      const fileBuffer = await getFileBuffer(file);
      if (fileBuffer) {
        const currentHash = calculateDocumentHash(fileBuffer);
        if (currentHash !== docRegistry.sha256Hash) {
          verificationStatus = 'TAMPERED';
        }
      }
    }

    // 5. Log verification attempt in AuditLog
    await logAudit({
      userId: null,
      action: 'DOCUMENT_VERIFICATION',
      details: { documentId, verificationStatus, documentType: docRegistry.documentType, documentNumber: docRegistry.documentNumber },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    // 6. Return response containing all required fields for the verification page
    res.status(200).json({
      verificationStatus,
      documentType: docRegistry.documentType,
      documentNumber: docRegistry.documentNumber,
      clientName: client?.name || 'N/A',
      brand: companyName,
      generatedDate: docRegistry.createdAt,
      sha256VerificationResult: docRegistry.sha256Hash
    });
  } catch (error) {
    next(error);
  }
}

