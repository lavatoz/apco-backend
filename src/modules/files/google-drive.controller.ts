import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { getDriveClient, uploadFile, downloadFileStream, deleteFile } from '../../services/google-drive.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { createNotification } from '../../services/notification.service';

// Enforced file upload limits (100MB limit for local development/service account)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// List of allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'video/mp4',
  'video/quicktime'
];

/**
 * Access Control Helper
 */
async function validateAccess(user: any, projectId: string): Promise<boolean> {
  if (user.role === Role.SystemAdmin || user.role === Role.Manager) {
    return true;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { client: true }
  });

  if (!project) {
    throw new AppError('Project not found or deleted.', 404);
  }

  if (user.role === Role.Client) {
    if (project.client.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('Access Denied: You do not have access to this project.', 403);
    }
    return true;
  }

  // Staff roles check assignment
  const assignment = await prisma.staffAssignment.findFirst({
    where: {
      projectId,
      userId: user.id
    }
  });

  if (!assignment) {
    throw new AppError('Access Denied: You are not assigned to this project.', 403);
  }

  return true;
}

/**
 * Endpoint: POST /api/files/upload
 */
export async function uploadProjectFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const file = req.file;
    const { projectId, folderType, isSecured } = req.body;
    const meta = extractReqMeta(req);

    if (!file) {
      throw new AppError('No file provided for upload.', 400);
    }

    if (!projectId) {
      throw new AppError('projectId is required.', 400);
    }

    // Enforce size limits
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError('File size exceeds the 100MB limit.', 400);
    }

    // Validate MIME types
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(`MIME type "${file.mimetype}" is not allowed.`, 400);
    }

    // Enforce RBAC
    await validateAccess(user, projectId);

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { client: true }
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Determine target folder ID based on folderType
    let parentFolderId = project.driveFolderId || undefined;
    if (folderType === 'Agreements' && project.agreementsFolderId) parentFolderId = project.agreementsFolderId;
    else if (folderType === 'Quotations' && project.quotationsFolderId) parentFolderId = project.quotationsFolderId;
    else if (folderType === 'Invoices' && project.invoicesFolderId) parentFolderId = project.invoicesFolderId;
    else if (folderType === 'Gallery' && project.galleryFolderId) parentFolderId = project.galleryFolderId;
    else if (folderType === 'Deliverables' && project.deliverablesFolderId) parentFolderId = project.deliverablesFolderId;
    else if (folderType === 'Raw Uploads' && project.driveFolderId) {
      // Find or lazy-create folder
      try {
        const drive = getDriveClient();
        const q = `name = 'Raw Uploads' and mimeType = 'application/vnd.google-apps.folder' and '${project.driveFolderId}' in parents and trashed = false`;
        const listResp = await drive.files.list({ q, fields: 'files(id)' });
        parentFolderId = listResp.data.files?.[0]?.id || project.driveFolderId;
      } catch {
        parentFolderId = project.driveFolderId;
      }
    }

    // Upload to Google Drive
    const driveFile = await uploadFile(file.buffer, file.originalname, file.mimetype, parentFolderId || undefined);

    // Calculate file hash
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Register file in DB
    const fileRecord = await prisma.file.create({
      data: {
        key: `gdrive-${driveFile.id}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        hash: fileHash,
        isSecured: isSecured === 'true' || isSecured === true,
        projectId,
        userId: user.id,
        googleDriveFileId: driveFile.id,
        googleDriveViewLink: driveFile.webViewLink,
        category: folderType
      }
    });

    // Write Audit Log
    await logAudit({
      userId: user.id,
      action: 'FILE_UPLOAD',
      details: { fileId: fileRecord.id, projectId, googleDriveFileId: driveFile.id, fileName: file.originalname },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent
    });

    // Trigger Workflow Events
    await logWorkflowEvent({
      projectId,
      eventType: 'FILE_UPLOADED',
      description: `File "${file.originalname}" was uploaded to Google Drive.`,
      payload: { fileId: fileRecord.id, originalName: file.originalname }
    });

    if (folderType === 'Deliverables') {
      await logWorkflowEvent({
        projectId,
        eventType: 'DELIVERABLE_PUBLISHED',
        description: `Deliverable published: "${file.originalname}"`,
        payload: { fileId: fileRecord.id }
      });
    } else if (folderType === 'Agreements') {
      await logWorkflowEvent({
        projectId,
        eventType: 'AGREEMENT_UPLOADED',
        description: `Agreement uploaded: "${file.originalname}"`,
        payload: { fileId: fileRecord.id }
      });
    } else if (folderType === 'Invoices') {
      await logWorkflowEvent({
        projectId,
        eventType: 'INVOICE_UPLOADED',
        description: `Invoice uploaded: "${file.originalname}"`,
        payload: { fileId: fileRecord.id }
      });
    } else if (folderType === 'Quotations') {
      await logWorkflowEvent({
        projectId,
        eventType: 'QUOTATION_UPLOADED',
        description: `Quotation uploaded: "${file.originalname}"`,
        payload: { fileId: fileRecord.id }
      });
    }

    // Dispatch system notifications based on uploader role
    try {
      if (user.role !== Role.Client) {
        // Staff/Admin uploaded a file, notify the client user
        if (project.client && project.client.email) {
          const clientUser = await prisma.user.findFirst({
            where: { email: project.client.email, lockedUntil: null }
          });
          if (clientUser) {
            let title = 'New File Uploaded';
            let message = `A new file has been uploaded to your project: ${project.name}`;

            if (folderType === 'Gallery') {
              title = 'New Gallery Photos Available';
              message = `New gallery photos have been uploaded to your project: ${project.name}`;
            } else if (folderType === 'Deliverables') {
              title = 'Deliverables Published';
              message = `New deliverables have been published for your project: ${project.name}`;
            } else if (folderType === 'Invoices') {
              title = 'New Invoice Available';
              message = `A new invoice has been added to your project: ${project.name}`;
            } else if (folderType === 'Agreements') {
              title = 'Agreement Available';
              message = 'A new agreement is available for your review and signature.';
            }

            await createNotification(clientUser.id, title, message);
          }
        }
      } else {
        // Client uploaded a file, notify assigned staff and managers/admins
        const assignments = await prisma.staffAssignment.findMany({
          where: { projectId },
          select: { userId: true }
        });
        const managers = await prisma.user.findMany({
          where: { role: { in: [Role.SystemAdmin, Role.Manager] }, lockedUntil: null },
          select: { id: true }
        });
        const recipientIds = Array.from(new Set([
          ...assignments.map(a => a.userId),
          ...managers.map(m => m.id)
        ]));
        for (const recipientId of recipientIds) {
          await createNotification(
            recipientId,
            'Client Uploaded File',
            `Client uploaded "${file.originalname}" to project "${project.name}".`
          );
        }
      }
    } catch (notifError) {
      console.error('Failed to trigger upload notification flow:', notifError);
    }

    res.status(201).json({
      id: fileRecord.id,
      fileName: fileRecord.originalName,
      mimeType: fileRecord.mimeType,
      viewLink: driveFile.webViewLink,
      uploadedAt: fileRecord.createdAt
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/files/:id/download
 */
export async function downloadProjectFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    const file = await prisma.file.findFirst({
      where: { id, deletedAt: null }
    });

    if (!file || !file.googleDriveFileId) {
      throw new AppError('File not found or has been deleted.', 404);
    }

    // RBAC: Client, Staff, Admin check
    if (file.projectId) {
      await validateAccess(user, file.projectId);
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager && file.userId !== user.id) {
      throw new AppError('Access Denied: You do not have permission to access this file.', 403);
    }

    // Clients are blocked from downloading "Raw Uploads"
    if (user.role === Role.Client && file.category === 'Raw Uploads') {
      throw new AppError('Access Denied: You do not have permission to access files in this category.', 403);
    }

    // Write Audit Log
    await logAudit({
      userId: user.id,
      action: 'FILE_DOWNLOAD',
      details: { fileId: file.id, projectId: file.projectId, googleDriveFileId: file.googleDriveFileId },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent
    });

    // Retrieve file download stream from Google Drive
    const stream = await downloadFileStream(file.googleDriveFileId);

    // Set download headers
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/files/project/:projectId
 * Supports pagination via ?page=<n>&limit=<n> query parameters.
 * Response headers: X-Total-Count, X-Page, X-Limit, X-Total-Pages
 */
export async function getFilesByProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Verify Access
    await validateAccess(user, projectId);

    const allowedClientCategories = ['Gallery', 'Deliverables', 'Invoices', 'Quotations', 'Agreements'];
    const { category } = req.query;

    let targetCategory: string | undefined = undefined;
    if (category) {
      targetCategory = category as string;
    }

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Setup DB query filters
    const whereClause: any = { projectId, deletedAt: null };

    if (user.role === Role.Client) {
      if (targetCategory) {
        if (!allowedClientCategories.includes(targetCategory)) {
          throw new AppError('Access Denied: You do not have permission to access files in this category.', 403);
        }
        whereClause.category = targetCategory;
      } else {
        // Client did not request a specific category — only return allowed categories
        whereClause.category = { in: allowedClientCategories };
      }
    } else {
      // Staff/Admin: no category restrictions; filter if explicitly provided
      if (targetCategory) {
        whereClause.category = targetCategory;
      }
    }

    // Execute count and data queries in parallel for efficiency
    const [totalCount, files] = await Promise.all([
      prisma.file.count({ where: whereClause }),
      prisma.file.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Write Audit Log
    await logAudit({
      userId: user.id,
      action: 'FILE_VIEW',
      details: { projectId, page, limit },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent
    });

    const mappedFiles = files.map(f => ({
      id: f.id,
      fileName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      category: f.category,
      viewLink: f.googleDriveViewLink || `https://drive.google.com/file/d/${f.googleDriveFileId}/view`,
      uploadedAt: f.createdAt
    }));

    // Set pagination headers
    res.setHeader('X-Total-Count', totalCount);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.setHeader('X-Total-Pages', totalPages);

    res.status(200).json(mappedFiles);
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: DELETE /api/files/:id
 */
export async function deleteProjectFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    const file = await prisma.file.findFirst({
      where: { id, deletedAt: null }
    });

    if (!file) {
      throw new AppError('File not found or already deleted.', 404);
    }

    // RBAC: Only admin, manager, or owner can delete files
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager && file.userId !== user.id) {
      throw new AppError('Access Denied: You do not have permission to delete this file.', 403);
    }

    // Soft delete in Postgres
    await prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    // Delete in Google Drive if ID is present
    if (file.googleDriveFileId) {
      try {
        await deleteFile(file.googleDriveFileId);
      } catch (driveErr) {
        console.error(`Failed to delete file ${file.googleDriveFileId} from Google Drive:`, driveErr);
      }
    }

    // Write Audit Log
    await logAudit({
      userId: user.id,
      action: 'FILE_DELETE',
      details: { fileId: file.id, projectId: file.projectId, googleDriveFileId: file.googleDriveFileId, fileName: file.originalName },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent
    });

    res.status(200).json({ message: 'File successfully deleted.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/files
 * Lists all active files filtered by user roles.
 */
export async function getFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { category } = req.query;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = { deletedAt: null };

    if (category) {
      whereClause.category = category as string;
    }

    if (user.role === Role.Client) {
      // Find client record by email
      const client = await prisma.client.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' }, deletedAt: null }
      });
      if (!client) {
        throw new AppError('Client record not found.', 404);
      }
      // Get all projects of client
      const projects = await prisma.project.findMany({
        where: { clientId: client.id, deletedAt: null },
        select: { id: true }
      });
      const projectIds = projects.map(p => p.id);
      
      const allowedClientCategories = ['Gallery', 'Deliverables', 'Invoices', 'Quotations', 'Agreements'];
      if (category && !allowedClientCategories.includes(category as string)) {
        throw new AppError('Access Denied: You do not have permission to access files in this category.', 403);
      }
      
      whereClause.projectId = { in: projectIds };
      if (!category) {
        whereClause.category = { in: allowedClientCategories };
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      // Staff roles: only files in projects they are assigned to
      const assignments = await prisma.staffAssignment.findMany({
        where: { userId: user.id },
        select: { projectId: true }
      });
      const projectIds = assignments.map(a => a.projectId);
      whereClause.projectId = { in: projectIds };
    }

    const [totalCount, files] = await Promise.all([
      prisma.file.count({ where: whereClause }),
      prisma.file.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.setHeader('X-Total-Count', totalCount);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.setHeader('X-Total-Pages', totalPages);

    const mappedFiles = files.map(f => ({
      id: f.id,
      fileName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      category: f.category,
      viewLink: f.googleDriveViewLink || `https://drive.google.com/file/d/${f.googleDriveFileId}/view`,
      uploadedAt: f.createdAt
    }));

    res.status(200).json(mappedFiles);
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/files/confirm
 * Confirms file upload by finding DB record.
 */
export async function confirmUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key } = req.body;
    if (!key) {
      throw new AppError('File key is required.', 400);
    }
    const file = await prisma.file.findFirst({
      where: { key, deletedAt: null }
    });
    if (!file) {
      throw new AppError('File not registered or has been deleted.', 404);
    }
    res.status(200).json({
      message: 'File successfully registered.',
      file
    });
  } catch (error) {
    next(error);
  }
}

