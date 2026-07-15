import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '../../middleware/error';
import { Role, DivisionMediaType } from '@prisma/client';
import { uploadAndVerifyPublicFile, getOrCreateFolder, streamGoogleDriveFile, cleanupOrphanedDriveFiles } from '../../services/google-drive.service';
import { env } from '../../config/env';
import { prisma } from '../../config/database';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4'];

// Helper to format division response and strip fileId for public endpoints
function formatDivision(division: any, isPublic: boolean = false) {
  if (!division) return division;
  return {
    ...division,
    media: division.media ? division.media.filter((m: any) => m.position !== 5).map((m: any) => {
      const formatted = {
        ...m,
        url: `/api/public/divisions/media/${m.fileId}`
      };
      if (isPublic) {
        delete (formatted as any).fileId;
      }
      return formatted;
    }) : []
  };
}

/**
 * Normalizes a division media URL to its canonical Google Drive URL format.
 */
function getCanonicalMediaUrl(fileId: string, type: DivisionMediaType, url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (type === DivisionMediaType.VIDEO) {
    return `https://drive.google.com/uc?id=${fileId}`;
  }
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Controller: Upload Division Media to Google Drive (images/videos)
 */
export async function uploadDivisionMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can upload division media.', 403);
    }

    const file = req.file;
    if (!file) {
      throw new AppError('No file provided for upload.', 400);
    }

    if (file.size === 0) {
      throw new AppError('Zero-byte file uploads are not allowed.', 400);
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);

    if (!isImage && !isVideo) {
      throw new AppError(`MIME type "${file.mimetype}" is not allowed. Only JPEG, PNG, WEBP, and MP4 are accepted.`, 400);
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      throw new AppError('Image file size exceeds the 5MB limit.', 400);
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      throw new AppError('Video file size exceeds the 50MB limit.', 400);
    }

    // Generate unique filename
    const originalExt = path.extname(file.originalname) || '';
    let ext = originalExt.toLowerCase();
    if (!ext || ext === '.') {
      if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/webp') ext = '.webp';
      else if (file.mimetype === 'video/mp4') ext = '.mp4';
      else ext = '.jpg';
    }
    const uniqueFilename = `${crypto.randomUUID()}-${Date.now()}${ext}`;

    // Folder structure: Website -> Divisions -> Images/Videos
    const rootFolderId = env.GOOGLE_DRIVE_FOLDER_ID;
    const websiteFolderId = await getOrCreateFolder('Website', rootFolderId);
    const divisionsFolderId = await getOrCreateFolder('Divisions', websiteFolderId);

    let targetFolderId: string;
    if (isVideo) {
      targetFolderId = await getOrCreateFolder('Videos', divisionsFolderId);
    } else {
      targetFolderId = await getOrCreateFolder('Images', divisionsFolderId);
    }

    // Upload, configure public sharing, generate URL, and verify accessibility in one shared step
    let fileId: string;
    let rawUrl: string;
    try {
      const uploadRes = await uploadAndVerifyPublicFile(
        file.buffer,
        uniqueFilename,
        file.mimetype,
        targetFolderId,
        `[Website Divisions Media Upload]`
      );
      fileId = uploadRes.id;
      rawUrl = uploadRes.url;
    } catch (err: any) {
      throw new AppError(`Uploaded cover media is not publicly accessible: ${err.message}`, 502);
    }

    console.log(`[UPLOAD] fileId: ${fileId}, filename: ${uniqueFilename}, mimeType: ${file.mimetype}, size: ${file.size} bytes, targetFolderId: ${targetFolderId}`);

    res.status(200).json({
      success: true,
      url: rawUrl,
      fileId,
      mimeType: file.mimetype,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: List all Website Divisions (Admin/Manager Dashboard)
 */
export async function getDivisions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can list divisions.', 403);
    }

    const divisions = await prisma.division.findMany({
      include: { media: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(divisions.map(d => formatDivision(d, false)));
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get details of a single Division
 */
export async function getDivisionById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can view division config.', 403);
    }

    const { id } = req.params;
    const division = await prisma.division.findUnique({
      where: { id },
      include: { media: { orderBy: { position: 'asc' } } },
    });

    if (!division) {
      throw new AppError('Division not found.', 404);
    }

    res.status(200).json(formatDivision(division, false));
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Create new Division
 */
export async function createDivision(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can create divisions.', 403);
    }

    const { name, description, instagramUrl, published, coverMediaId, media } = req.body;
    const filteredMedia = media ? media.filter((m: any) => m.position !== 5) : [];

    const division = await prisma.division.create({
      data: {
        name,
        description,
        instagramUrl: instagramUrl || null,
        published: !!published,
        coverMediaId: coverMediaId || null,
        media: media ? {
          create: filteredMedia.map((m: any) => ({
            type: m.type,
            position: m.position,
            url: getCanonicalMediaUrl(m.fileId, m.type, m.url),
            fileId: m.fileId,
          }))
        } : undefined,
      },
      include: {
        media: { orderBy: { position: 'asc' } }
      }
    });

    res.status(201).json(formatDivision(division, false));
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update existing Division (with media replacement and Drive cleanup of orphaned files)
 */
export async function updateDivision(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can update divisions.', 403);
    }

    const { id } = req.params;
    const { name, description, instagramUrl, published, coverMediaId, media } = req.body;

    const existing = await prisma.division.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!existing) {
      throw new AppError('Division not found.', 404);
    }

    const filteredMedia = media ? media.filter((m: any) => m.position !== 5) : [];

    // Identify orphaned files to clean up from Google Drive
    const newFileIds = new Set(filteredMedia.map((m: any) => m.fileId));
    
    const candidateFileIds: (string | null | undefined)[] = [];
    
    // Check for removed/replaced media
    for (const m of existing.media) {
      if (m.fileId && !newFileIds.has(m.fileId)) {
        candidateFileIds.push(m.fileId);
        const newItem = filteredMedia.find((nm: any) => nm.position === m.position);
        if (newItem) {
          console.log(`[REPLACED] oldFileId: ${m.fileId}, newFileId: ${newItem.fileId} (media position ${m.position})`);
        } else {
          console.log(`[REMOVED] fileId: ${m.fileId} (media position ${m.position})`);
        }
      }
    }

    // Check for cover replacement/removal
    if (existing.coverMediaId && existing.coverMediaId !== coverMediaId) {
      candidateFileIds.push(existing.coverMediaId);
      if (coverMediaId) {
        console.log(`[REPLACED] oldFileId: ${existing.coverMediaId}, newFileId: ${coverMediaId} (cover)`);
      } else {
        console.log(`[REMOVED] fileId: ${existing.coverMediaId} (cover)`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Delete all old media records in DB
      await tx.divisionMedia.deleteMany({
        where: { divisionId: id }
      });

      // 2. Update division info and recreate new media records
      return await tx.division.update({
        where: { id },
        data: {
          name,
          description,
          instagramUrl: instagramUrl === '' ? null : instagramUrl,
          published: !!published,
          coverMediaId: coverMediaId || null,
          media: media ? {
            create: filteredMedia.map((m: any) => ({
              type: m.type,
              position: m.position,
              url: getCanonicalMediaUrl(m.fileId, m.type, m.url),
              fileId: m.fileId,
            }))
          } : undefined,
        },
        include: {
          media: { orderBy: { position: 'asc' } }
        }
      });
    });

    // 3. Cleanup Google Drive orphaned files
    await cleanupOrphanedDriveFiles(candidateFileIds);

    res.status(200).json(formatDivision(updated, false));
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Delete Division (cascades database deletes and cleans up all associated Drive media)
 */
export async function deleteDivision(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can delete divisions.', 403);
    }

    const { id } = req.params;

    const existing = await prisma.division.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!existing) {
      throw new AppError('Division not found.', 404);
    }

    // Delete database record (onDelete: Cascade automatically handles divisionMedia deletes)
    await prisma.division.delete({
      where: { id }
    });

    // Drive cleanup for all media and cover media
    const candidateFileIds: (string | null | undefined)[] = [];
    for (const item of existing.media) {
      if (item.fileId) {
        candidateFileIds.push(item.fileId);
      }
    }
    if (existing.coverMediaId) {
      candidateFileIds.push(existing.coverMediaId);
    }

    await cleanupOrphanedDriveFiles(candidateFileIds);

    res.status(200).json({ success: true, message: 'Division deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get published Divisions (Public landing page, only returns specific required fields)
 */
export async function getPublicDivisions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const divisions = await prisma.division.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        instagramUrl: true,
        media: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            type: true,
            position: true,
            url: true,
            fileId: true
          }
        }
      }
    });

    res.status(200).json(divisions.map(d => formatDivision(d, true)));
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Stream Public Division Media directly from Google Drive with Range support
 */
export async function streamPublicDivisionMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId } = req.params;
    await streamGoogleDriveFile(fileId, req, res);
  } catch (error) {
    next(error);
  }
}
