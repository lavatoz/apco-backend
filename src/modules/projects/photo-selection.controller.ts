import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { downloadFileStream } from '../../services/google-drive.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { AppError } from '../../middleware/error';
import { Role, GalleryStatus } from '@prisma/client';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

/**
 * Access Control Helper: Verifies that the user has permission for the project.
 */
async function validateProjectAccess(user: any, projectId: string): Promise<any> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { client: true },
  });

  if (!project) {
    throw new AppError('Project not found or has been deleted.', 404);
  }

  if (user.role === Role.SystemAdmin || user.role === Role.Manager) {
    return project;
  }

  if (user.role === Role.Client) {
    if (project.client.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('Access Denied: You do not have access to this project.', 403);
    }
    return project;
  }

  // Staff role check: Must be assigned to the project
  const assignment = await prisma.staffAssignment.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!assignment) {
    throw new AppError('Access Denied: You are not assigned to this project.', 403);
  }

  return project;
}

/**
 * Ensures that the ProjectGallery record exists for the project.
 */
async function getOrCreateProjectGallery(projectId: string): Promise<any> {
  let gallery = await prisma.projectGallery.findUnique({
    where: { projectId },
  });

  if (!gallery) {
    gallery = await prisma.projectGallery.create({
      data: {
        projectId,
        currentStatus: GalleryStatus.UPLOADED,
        selectionLocked: false,
      },
    });
  }

  return gallery;
}

/**
 * Endpoint: POST /api/projects/:id/photos/:photoId/select
 */
export async function togglePhotoSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, photoId } = req.params;
    const { selected } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Only clients can toggle selections
    if (user.role !== Role.Client) {
      throw new AppError('Access Denied: Only clients can toggle photo selections.', 403);
    }

    const project = await validateProjectAccess(user, projectId);
    const gallery = await getOrCreateProjectGallery(projectId);

    // If selection is submitted, reject edits
    if (gallery.selectionLocked || gallery.currentStatus === GalleryStatus.SELECTION_SUBMITTED) {
      throw new AppError('Access Denied: Photo selection is submitted and locked.', 400);
    }

    // Verify file exists and belongs to the project
    const file = await prisma.file.findFirst({
      where: { id: photoId, projectId, deletedAt: null },
    });

    if (!file) {
      throw new AppError('File not found in this project.', 404);
    }

    // Ensure the GalleryPhoto record exists
    let galleryPhoto = await prisma.galleryPhoto.findUnique({
      where: { projectId_fileId: { projectId, fileId: photoId } },
    });

    if (!galleryPhoto) {
      galleryPhoto = await prisma.galleryPhoto.create({
        data: {
          projectId,
          fileId: photoId,
        },
      });
    }

    const linkData = {
      galleryPhotoId: galleryPhoto.id,
      clientId: project.clientId,
      projectId,
    };

    if (selected) {
      // Create selection if it doesn't exist
      await prisma.photoSelection.upsert({
        where: {
          galleryPhotoId_clientId_projectId: {
            galleryPhotoId: galleryPhoto.id,
            clientId: project.clientId,
            projectId,
          },
        },
        create: linkData,
        update: {},
      });

      // Update status to SELECTION_IN_PROGRESS if it was UPLOADED
      if (gallery.currentStatus === GalleryStatus.UPLOADED) {
        await prisma.projectGallery.update({
          where: { projectId },
          data: { currentStatus: GalleryStatus.SELECTION_IN_PROGRESS },
        });
      }
    } else {
      // Remove selection
      await prisma.photoSelection.deleteMany({
        where: {
          galleryPhotoId: galleryPhoto.id,
          clientId: project.clientId,
          projectId,
        },
      });
    }

    // Log Audit
    await logAudit({
      userId: user.id,
      action: 'PHOTO_SELECTION_TOGGLE',
      details: { projectId, photoId, selected },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    const selectedCount = await prisma.photoSelection.count({
      where: { projectId },
    });

    res.status(200).json({
      selected,
      selectedCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: POST /api/projects/:id/selections/submit
 */
export async function submitPhotoSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.Client) {
      throw new AppError('Access Denied: Only clients can submit selections.', 403);
    }

    await validateProjectAccess(user, projectId);
    const gallery = await getOrCreateProjectGallery(projectId);

    if (gallery.selectionLocked || gallery.currentStatus === GalleryStatus.SELECTION_SUBMITTED) {
      throw new AppError('Photo selection has already been submitted.', 400);
    }

    // Update gallery status to submitted and lock selections
    const now = new Date();
    await prisma.projectGallery.update({
      where: { projectId },
      data: {
        currentStatus: GalleryStatus.SELECTION_SUBMITTED,
        selectionLocked: true,
        submittedAt: now,
        submittedBy: user.id,
      },
    });

    // Log Audit
    await logAudit({
      userId: user.id,
      action: 'PHOTO_SELECTION_SUBMIT',
      details: { projectId },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    // Log workflow event
    await logWorkflowEvent({
      projectId,
      eventType: 'SELECTION_SUBMITTED',
      description: 'Client finalized and submitted their photo selections.',
      payload: { submittedAt: now },
    });

    res.status(200).json({
      status: GalleryStatus.SELECTION_SUBMITTED,
      submittedAt: now,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/projects/:id/selections
 */
export async function getPhotoSelections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;

    await validateProjectAccess(user, projectId);

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const selectionsWhere = { projectId };

    const [totalCount, selections] = await Promise.all([
      prisma.photoSelection.count({ where: selectionsWhere }),
      prisma.photoSelection.findMany({
        where: selectionsWhere,
        include: {
          galleryPhoto: {
            include: {
              file: true,
            },
          },
        },
        orderBy: { selectedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const mappedFiles = selections.map((s) => {
      const f = s.galleryPhoto.file;
      return {
        id: f.id,
        fileName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        category: f.category,
        viewLink: f.googleDriveViewLink || `https://drive.google.com/file/d/${f.googleDriveFileId}/view`,
        uploadedAt: f.createdAt,
        selectedAt: s.selectedAt,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

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
 * Endpoint: GET /api/projects/:id/gallery-workflow
 */
export async function getGalleryWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;

    await validateProjectAccess(user, projectId);
    const gallery = await getOrCreateProjectGallery(projectId);

    // Compute total, selected, and remaining counts
    const totalPhotos = await prisma.file.count({
      where: {
        projectId,
        category: { in: ['Gallery', 'Raw Photos', 'Edited Photos'] },
        deletedAt: null,
      },
    });

    const selectedPhotos = await prisma.photoSelection.count({
      where: { projectId },
    });

    const selectedIds = await prisma.photoSelection.findMany({
      where: { projectId },
      include: {
        galleryPhoto: {
          select: {
            fileId: true,
          },
        },
      },
    });

    const selectedFileIds = selectedIds.map((s) => s.galleryPhoto.fileId);

    res.status(200).json({
      status: gallery.currentStatus,
      submittedAt: gallery.submittedAt,
      selectionLocked: gallery.selectionLocked,
      totalPhotos,
      selectedPhotos,
      remainingPhotos: Math.max(0, totalPhotos - selectedPhotos),
      selectedFileIds,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: PUT /api/projects/:id/gallery-workflow/status
 */
export async function updateWorkflowStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { status } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Only staff/admin can change status manually (clients are blocked)
    if (user.role === Role.Client) {
      throw new AppError('Access Denied: Only staff and admins can update workflow status.', 403);
    }

    await validateProjectAccess(user, projectId);
    await getOrCreateProjectGallery(projectId);

    const updatedGallery = await prisma.projectGallery.update({
      where: { projectId },
      data: {
        currentStatus: status as GalleryStatus,
        // Automatically lock selections if advanced to SUBMITTED or later, unlock otherwise
        selectionLocked: ([
          GalleryStatus.SELECTION_SUBMITTED,
          GalleryStatus.READY_FOR_EDITING,
          GalleryStatus.EDITING,
          GalleryStatus.EDITED,
          GalleryStatus.DELIVERED,
        ] as string[]).includes(status),
      },
    });

    // Log Audit
    await logAudit({
      userId: user.id,
      action: 'GALLERY_WORKFLOW_STATUS_UPDATE',
      details: { projectId, oldStatus: status, status },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    // Log workflow event
    await logWorkflowEvent({
      projectId,
      eventType: 'SELECTION_STAGE_ADVANCED',
      description: `Gallery workflow status updated to ${status}.`,
      payload: { status },
    });

    res.status(200).json({
      status: updatedGallery.currentStatus,
      selectionLocked: updatedGallery.selectionLocked,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: GET /api/projects/:id/selections/download
 */
export async function downloadSelectedPhotos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Only staff/managers/admins can download ZIP of selections (clients are blocked)
    if (user.role === Role.Client) {
      throw new AppError('Access Denied: Only staff and admins can download photo selections.', 403);
    }

    const project = await validateProjectAccess(user, projectId);

    // Fetch all selected files
    const selections = await prisma.photoSelection.findMany({
      where: { projectId },
      include: {
        galleryPhoto: {
          include: {
            file: true,
          },
        },
      },
    });

    if (selections.length === 0) {
      throw new AppError('No photos have been selected for download.', 400);
    }

    // Set up headers for ZIP streaming
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(
        project.name.replace(/\s+/g, '_') + '_Selections.zip'
      )}"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Handle archiver errors
    archive.on('error', (err) => {
      console.error('ZIP archiving error:', err);
      // We cannot set status code here because response streaming has already started
    });

    archive.pipe(res);

    // Log Audit
    await logAudit({
      userId: user.id,
      action: 'PHOTO_SELECTION_ZIP_DOWNLOAD',
      details: { projectId, fileCount: selections.length },
      ipAddress: meta.ipAddress,
      requestId: meta.requestId,
      userAgent: meta.userAgent,
    });

    for (const selection of selections) {
      const file = selection.galleryPhoto.file;
      let stream: any = null;

      if (file.googleDriveFileId) {
        try {
          stream = await downloadFileStream(file.googleDriveFileId);
        } catch (driveErr) {
          console.error(`Google Drive download failed for file ${file.id} in ZIP:`, driveErr);
        }
      }

      if (!stream) {
        const candidatePaths = [
          path.resolve(process.cwd(), file.key),
          path.resolve(process.cwd(), 'uploads/quotations/pdfs', file.originalName),
          path.resolve(process.cwd(), 'uploads/agreements/pdfs', file.originalName),
          path.resolve(process.cwd(), 'uploads/standalone-agreements/pdfs', file.originalName),
        ];

        let localFilePath: string | null = null;
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            localFilePath = candidate;
            break;
          }
        }

        if (localFilePath) {
          stream = fs.createReadStream(localFilePath);
        }
      }

      if (stream) {
        archive.append(stream, { name: file.originalName });
      } else {
        console.warn(`File ${file.id} (name: ${file.originalName}) was skipped in ZIP download due to missing stream source.`);
      }
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
}
