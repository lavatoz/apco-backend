import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { prisma } from '../../config/database';
import { Role, GalleryStatus } from '@prisma/client';
import { AppError } from '../../middleware/error';
import { downloadFileStream } from '../../services/google-drive.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';

const GALLERY_STATUS_ORDER = [
  GalleryStatus.UPLOADED,
  GalleryStatus.SELECTION_IN_PROGRESS,
  GalleryStatus.SELECTION_SUBMITTED,
  GalleryStatus.READY_FOR_EDITING,
  GalleryStatus.EDITING,
  GalleryStatus.EDITED,
  GalleryStatus.DELIVERED
];

/**
 * Helper to validate project access for Staff/Client/Admin
 */
async function checkProjectAccess(user: any, projectId: string): Promise<any> {
  if (user.role === Role.SystemAdmin || user.role === Role.Manager) {
    return prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { client: true }
    });
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
    return project;
  }

  // Staff roles: check assignments
  const assignment = await prisma.staffAssignment.findFirst({
    where: { projectId, userId: user.id }
  });

  if (!assignment) {
    throw new AppError('Access Denied: You are not assigned to this project.', 403);
  }

  return project;
}

/**
 * Controller: Get paginated gallery photos for a project
 * Lazy-registers gallery photos from project files (category in Gallery, Raw Photos, Edited Photos)
 */
export async function getProjectGalleryPhotos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;
    const favoritesOnly = req.query.favoritesOnly === 'true';

    const project = await checkProjectAccess(user, projectId);
    const clientId = project.clientId;

    // 1. Find all active project files matching gallery categories
    const files = await prisma.file.findMany({
      where: {
        projectId,
        deletedAt: null,
        category: { in: ['Gallery', 'Raw Photos', 'Edited Photos'] }
      }
    });

    // 2. Resolve missing GalleryPhoto entries in database
    const existingGalleryPhotos = await prisma.galleryPhoto.findMany({
      where: { projectId }
    });
    const existingFileIds = new Set(existingGalleryPhotos.map(gp => gp.fileId));
    const missingFiles = files.filter(f => !existingFileIds.has(f.id));

    if (missingFiles.length > 0) {
      await prisma.galleryPhoto.createMany({
        data: missingFiles.map(f => ({
          projectId,
          fileId: f.id
        })),
        skipDuplicates: true
      });
    }

    // 3. Ensure ProjectGallery record exists
    let projectGallery = await prisma.projectGallery.findUnique({
      where: { projectId }
    });
    if (!projectGallery) {
      projectGallery = await prisma.projectGallery.create({
        data: { projectId, currentStatus: GalleryStatus.UPLOADED }
      });
    }

    // Parse pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 40));
    const skip = (page - 1) * limit;

    // Construct query filters
    const whereClause: any = { projectId };
    if (favoritesOnly) {
      whereClause.selections = {
        some: { clientId }
      };
    }

    // Get count information
    const [totalCount, selectedCount, reviewedCount, galleryPhotos] = await Promise.all([
      prisma.galleryPhoto.count({ where: { projectId } }),
      prisma.photoSelection.count({ where: { projectId, clientId } }),
      prisma.photoReview.count({ where: { projectId, clientId } }),
      prisma.galleryPhoto.findMany({
        where: whereClause,
        include: {
          file: true,
          selections: { where: { clientId } },
          reviews: { where: { clientId } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    const totalPages = Math.ceil((favoritesOnly ? selectedCount : totalCount) / limit);

    // Format response
    const formattedPhotos = galleryPhotos.map(gp => ({
      id: gp.id,
      fileId: gp.fileId,
      fileName: gp.file.originalName,
      mimeType: gp.file.mimeType,
      size: gp.file.size,
      category: gp.file.category,
      viewLink: gp.file.googleDriveViewLink || `https://drive.google.com/file/d/${gp.file.googleDriveFileId}/view`,
      isFavorite: gp.selections.length > 0,
      isReviewed: gp.reviews.length > 0,
      uploadedAt: gp.file.createdAt
    }));

    res.status(200).json({
      status: projectGallery.currentStatus,
      selectionLocked: projectGallery.selectionLocked,
      totalCount,
      selectedCount,
      reviewedCount,
      page,
      limit,
      totalPages,
      photos: formattedPhotos
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Toggle Photo Review State
 */
export async function togglePhotoReviewState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, galleryPhotoId } = req.params;
    const user = req.user!;

    const project = await checkProjectAccess(user, projectId);
    const clientId = project.clientId;

    // Check lock
    let projectGallery = await prisma.projectGallery.findUnique({ where: { projectId } });
    if (projectGallery?.selectionLocked) {
      throw new AppError('Gallery selection is locked and cannot be modified.', 400);
    }

    // Auto initialize if missing
    if (!projectGallery) {
      projectGallery = await prisma.projectGallery.create({
        data: { projectId, currentStatus: GalleryStatus.UPLOADED }
      });
    }

    const existingReview = await prisma.photoReview.findUnique({
      where: {
        galleryPhotoId_clientId_projectId: {
          galleryPhotoId,
          clientId,
          projectId
        }
      }
    });

    let reviewed = false;
    if (existingReview) {
      // Toggle off: Delete review record
      await prisma.photoReview.delete({
        where: { id: existingReview.id }
      });
    } else {
      // Toggle on: Create review record
      await prisma.photoReview.create({
        data: { galleryPhotoId, clientId, projectId }
      });
      reviewed = true;
    }

    // Auto transition to SELECTION_IN_PROGRESS if currently UPLOADED
    if (projectGallery.currentStatus === GalleryStatus.UPLOADED) {
      await prisma.projectGallery.update({
        where: { projectId },
        data: { currentStatus: GalleryStatus.SELECTION_IN_PROGRESS }
      });
    }

    res.status(200).json({ reviewed });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Toggle Favorite Photo (heart)
 */
export async function toggleFavoritePhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, galleryPhotoId } = req.params;
    const user = req.user!;

    const project = await checkProjectAccess(user, projectId);
    const clientId = project.clientId;

    // Check lock
    let projectGallery = await prisma.projectGallery.findUnique({ where: { projectId } });
    if (projectGallery?.selectionLocked) {
      throw new AppError('Gallery selection is locked and cannot be modified.', 400);
    }

    if (!projectGallery) {
      projectGallery = await prisma.projectGallery.create({
        data: { projectId, currentStatus: GalleryStatus.UPLOADED }
      });
    }

    const existingSelection = await prisma.photoSelection.findUnique({
      where: {
        galleryPhotoId_clientId_projectId: {
          galleryPhotoId,
          clientId,
          projectId
        }
      }
    });

    let favorited = false;
    if (existingSelection) {
      // Unselect: delete record
      await prisma.photoSelection.delete({
        where: { id: existingSelection.id }
      });
    } else {
      // Select: create record
      await prisma.photoSelection.create({
        data: { galleryPhotoId, clientId, projectId }
      });
      favorited = true;

      // Auto mark as reviewed when favoriting if not already done
      const existingReview = await prisma.photoReview.findUnique({
        where: {
          galleryPhotoId_clientId_projectId: {
            galleryPhotoId,
            clientId,
            projectId
          }
        }
      });
      if (!existingReview) {
        await prisma.photoReview.create({
          data: { galleryPhotoId, clientId, projectId }
        });
      }
    }

    // Auto transition to SELECTION_IN_PROGRESS if currently UPLOADED
    if (projectGallery.currentStatus === GalleryStatus.UPLOADED) {
      await prisma.projectGallery.update({
        where: { projectId },
        data: { currentStatus: GalleryStatus.SELECTION_IN_PROGRESS }
      });
    }

    res.status(200).json({ favorited });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Submit selection and lock gallery
 */
export async function submitPhotoSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    const project = await checkProjectAccess(user, projectId);

    let projectGallery = await prisma.projectGallery.findUnique({ where: { projectId } });
    if (!projectGallery) {
      projectGallery = await prisma.projectGallery.create({
        data: { projectId, currentStatus: GalleryStatus.UPLOADED }
      });
    }

    // Transition validation: UPLOADED or SELECTION_IN_PROGRESS -> SELECTION_SUBMITTED.
    if (
      projectGallery.currentStatus !== GalleryStatus.UPLOADED &&
      projectGallery.currentStatus !== GalleryStatus.SELECTION_IN_PROGRESS
    ) {
      throw new AppError(`Invalid transition. Cannot submit selections from status "${projectGallery.currentStatus}".`, 400);
    }

    // Lock and progress
    const updatedGallery = await prisma.projectGallery.update({
      where: { projectId },
      data: {
        currentStatus: GalleryStatus.SELECTION_SUBMITTED,
        selectionLocked: true,
        submittedAt: new Date(),
        submittedBy: user.id
      }
    });

    // Write audit log
    await logAudit({
      userId: user.id,
      action: 'GALLERY_SUBMITTED',
      details: { projectId },
      ...meta
    });

    // Write workflow event
    await logWorkflowEvent({
      projectId,
      eventType: 'GALLERY_SELECTION_SUBMITTED',
      description: `Client submitted and locked photo selection for project "${project.name}".`,
      payload: { submittedBy: user.id }
    });

    res.status(200).json({
      message: 'Photo selection successfully submitted and locked.',
      status: updatedGallery.currentStatus,
      selectionLocked: updatedGallery.selectionLocked
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update Gallery Status (Strict Sequential Workflow Validation)
 */
export async function updateGalleryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { status: newStatus } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (!newStatus || !GALLERY_STATUS_ORDER.includes(newStatus as GalleryStatus)) {
      throw new AppError('Invalid or missing status parameter.', 400);
    }

    await checkProjectAccess(user, projectId);

    let projectGallery = await prisma.projectGallery.findUnique({ where: { projectId } });
    if (!projectGallery) {
      projectGallery = await prisma.projectGallery.create({
        data: { projectId, currentStatus: GalleryStatus.UPLOADED }
      });
    }

    const currentStatus = projectGallery.currentStatus;
    if (currentStatus === newStatus) {
      res.status(200).json({ status: currentStatus });
      return;
    }

    const currentIndex = GALLERY_STATUS_ORDER.indexOf(currentStatus);
    const newIndex = GALLERY_STATUS_ORDER.indexOf(newStatus as GalleryStatus);

    // Enforce strict sequential transitions (no skipping) except for unlocking
    const isUnlockTransition = 
      currentStatus === GalleryStatus.SELECTION_SUBMITTED && 
      newStatus === GalleryStatus.SELECTION_IN_PROGRESS;

    if (newIndex !== currentIndex + 1 && !isUnlockTransition) {
      throw new AppError(`Invalid transition: Cannot skip stages. Transitioning from ${currentStatus} to ${newStatus} is prohibited. Allowed next status: ${GALLERY_STATUS_ORDER[currentIndex + 1] || 'None'}`, 400);
    }

    // Update gallery status
    const updatedGallery = await prisma.projectGallery.update({
      where: { projectId },
      data: {
        currentStatus: newStatus as GalleryStatus,
        selectionLocked: newIndex >= GALLERY_STATUS_ORDER.indexOf(GalleryStatus.SELECTION_SUBMITTED)
      }
    });

    // Write audit log
    await logAudit({
      userId: user.id,
      action: 'GALLERY_STATUS_UPDATED',
      details: { projectId, oldStatus: currentStatus, newStatus },
      ...meta
    });

    // Write workflow event
    await logWorkflowEvent({
      projectId,
      eventType: 'GALLERY_STATUS_CHANGED',
      description: `Gallery status progressed from ${currentStatus} to ${newStatus}.`,
      payload: { oldStatus: currentStatus, newStatus }
    });

    res.status(200).json({
      status: updatedGallery.currentStatus,
      selectionLocked: updatedGallery.selectionLocked
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Streamed ZIP download of client selected photos
 */
export async function downloadSelectedPhotos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // SECURITY GATE: Deny clients
    if (user.role === Role.Client) {
      throw new AppError('Access Denied: Clients are not allowed to download the selection ZIP.', 403);
    }

    const project = await checkProjectAccess(user, projectId);

    // Find all selections
    const selections = await prisma.photoSelection.findMany({
      where: { projectId },
      include: {
        galleryPhoto: {
          include: { file: true }
        }
      }
    });

    if (selections.length === 0) {
      throw new AppError('No selected photos found for this project.', 400);
    }

    // Log Audit Event
    await logAudit({
      userId: user.id,
      action: 'GALLERY_ZIP_DOWNLOAD',
      details: { projectId, photoCount: selections.length },
      ...meta
    });

    // Set streaming headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(project.name)}-selected-photos.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Handle archiver errors
    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      if (!res.headersSent) {
        res.status(500).send({ error: 'Archive creation failed' });
      }
    });

    archive.pipe(res);

    for (const selection of selections) {
      const file = selection.galleryPhoto.file;
      let stream = null;

      // Try Google Drive stream fallback
      if (file.googleDriveFileId) {
        try {
          stream = await downloadFileStream(file.googleDriveFileId);
        } catch (err) {
          console.error(`Google Drive download stream fail for file ID ${file.id}:`, err);
        }
      }

      // Fall back to local file if Drive failed or was mock
      if (!stream) {
        const candidatePaths = [
          path.resolve(process.cwd(), file.key),
          path.resolve(process.cwd(), 'uploads', file.originalName)
        ];
        let localPath = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            localPath = p;
            break;
          }
        }
        if (localPath) {
          stream = fs.createReadStream(localPath);
        }
      }

      if (stream) {
        archive.append(stream, { name: file.originalName });
      } else {
        console.warn(`File contents skipped in ZIP download: ID ${file.id}, name ${file.originalName}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
}
