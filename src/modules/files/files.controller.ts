import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../../services/storage.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * Controller: Generate Presigned Upload URL
 */
export async function getUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileName, mimeType, size, projectId } = req.body;
    const user = req.user!;

    // Generate unique key for Cloudflare R2 bucket: uploads/uuid-timestamp-filename
    const uniqueId = crypto.randomUUID();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${uniqueId}-${Date.now()}-${sanitizedFileName}`;

    // Generate presigned upload URL (valid for 15 minutes)
    const uploadUrl = await getPresignedUploadUrl(key, mimeType, size, 900);

    res.status(200).json({
      uploadUrl,
      key,
      projectId: projectId || null,
      userId: user.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Confirm File Upload (Registers record in DB)
 */
export async function confirmUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { key, originalName, mimeType, size, hash, isSecured, projectId } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Verify if file key already exists in DB
    const existingFile = await prisma.file.findUnique({
      where: { key },
    });

    if (existingFile) {
      throw new AppError('File with this key has already been registered.', 400);
    }

    // Register file in DB
    const file = await prisma.file.create({
      data: {
        key,
        originalName,
        mimeType,
        size,
        hash,
        isSecured,
        projectId: projectId || null,
        userId: user.id,
      },
    });

    // Write audit log
    await logAudit({
      userId: user.id,
      action: 'FILE_UPLOAD',
      details: { fileId: file.id, key, originalName, hash, isSecured },
      ...meta,
    });

    // Automatically generate workflow events for file uploads
    if (projectId) {
      await logWorkflowEvent({
        projectId,
        eventType: 'FILE_UPLOADED',
        description: `File "${originalName}" uploaded and registered under project.`,
        payload: { fileId: file.id, originalName, size, mimeType },
      });
    }

    res.status(201).json({
      message: 'File successfully registered.',
      file,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get Presigned Download URL
 */
export async function downloadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId } = req.params;
    const user = req.user!;

    // Fetch file from DB
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.deletedAt) {
      throw new AppError('File not found or has been deleted.', 404);
    }

    // Security check: if the file is secured, only admins, managers, and editors can access
    if (file.isSecured) {
      const allowedRoles: Role[] = [Role.SystemAdmin, Role.Manager, Role.Editor];
      if (!allowedRoles.includes(user.role)) {
        // Double check if user is uploader or assigned to the project
        const isOwner = file.userId === user.id;
        
        let hasProjectAccess = false;
        if (file.projectId) {
          const assignment = await prisma.staffAssignment.findFirst({
            where: {
              projectId: file.projectId,
              userId: user.id,
            },
          });
          if (assignment) {
            hasProjectAccess = true;
          }
        }

        if (!isOwner && !hasProjectAccess) {
          throw new AppError('You do not have permission to download this secured file.', 403);
        }
      }
    }

    // Generate presigned download URL (valid for 30 minutes)
    const downloadUrl = await getPresignedDownloadUrl(
      file.key,
      file.originalName,
      1800, // 30 mins
      user.id,
      req
    );

    res.status(200).json({
      downloadUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Soft Delete File
 */
export async function deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Fetch file
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file || file.deletedAt) {
      throw new AppError('File not found or has already been deleted.', 404);
    }

    // Authorization check: Only SystemAdmin, Manager or the file uploader can delete
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager && file.userId !== user.id) {
      throw new AppError('You do not have permission to delete this file.', 403);
    }

    // Perform soft delete
    await prisma.file.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });

    // Write audit log
    await logAudit({
      userId: user.id,
      action: 'FILE_DELETE',
      details: { fileId, key: file.key, originalName: file.originalName },
      ...meta,
    });

    res.status(200).json({
      message: 'File successfully deleted.',
    });
  } catch (error) {
    next(error);
  }
}
