import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { uploadAndVerifyPublicFile, getOrCreateFolder, cleanupOrphanedDriveFiles } from '../../services/google-drive.service';
import { env } from '../../config/env';
import { prisma } from '../../config/database';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Controller: Upload Website Gallery Cover Image
 */
export async function uploadWebsiteGalleryCover(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    // 1. RBAC Check: Only SystemAdmin or Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can upload website gallery cover images.', 403);
    }

    const file = req.file;

    // 2. Validate file existence
    if (!file) {
      throw new AppError('No file provided for upload.', 400);
    }

    // 3. Reject zero-byte uploads
    if (file.size === 0) {
      throw new AppError('Zero-byte file uploads are not allowed.', 400);
    }

    // 4. Validate file size (5MB maximum)
    if (file.size > MAX_IMAGE_SIZE) {
      throw new AppError('File size exceeds the 5MB limit.', 400);
    }

    // 5. Validate MIME types
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(`MIME type "${file.mimetype}" is not allowed. Only JPEG, PNG, and WEBP are accepted.`, 400);
    }

    // 6. Generate unique filename (do not rely on original filename)
    const originalExt = path.extname(file.originalname) || '';
    let ext = originalExt.toLowerCase();
    if (!ext || ext === '.') {
      if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/webp') ext = '.webp';
      else ext = '.jpg';
    }
    const uniqueFilename = `${crypto.randomUUID()}-${Date.now()}${ext}`;

    // 7. Ensure folder structure exists in Google Drive: Website Gallery -> Cover Images
    const rootFolderId = env.GOOGLE_DRIVE_FOLDER_ID;
    const galleryRootFolderId = await getOrCreateFolder('Website Gallery', rootFolderId);
    const coverImagesFolderId = await getOrCreateFolder('Cover Images', galleryRootFolderId);

    // 8. Upload, configure public sharing, generate URL, and verify accessibility in one shared step
    let fileId: string;
    let imageUrl: string;
    try {
      const uploadRes = await uploadAndVerifyPublicFile(
        file.buffer,
        uniqueFilename,
        file.mimetype,
        coverImagesFolderId,
        `[Upload ${uniqueFilename}]`
      );
      fileId = uploadRes.id;
      imageUrl = uploadRes.url;
    } catch (err: any) {
      throw new AppError(`Uploaded cover image is not publicly accessible: ${err.message}`, 502);
    }

    // 11. Return metadata response without creating database records
    res.status(200).json({
      success: true,
      fileId,
      imageUrl,
      filename: uniqueFilename,
      mimeType: file.mimetype,
    });
  } catch (error) {
    next(error);
  }
}



/**
 * Controller: List all Website Galleries (Admin/Manager Dashboard)
 */
export async function getWebsiteGalleries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can list gallery configs.', 403);
    }

    const galleries = await prisma.websiteGallery.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(galleries);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get single Website Gallery details
 */
export async function getWebsiteGalleryById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can view gallery config.', 403);
    }

    const { id } = req.params;
    const gallery = await prisma.websiteGallery.findUnique({
      where: { id },
    });

    if (!gallery) {
      throw new AppError('Website gallery item not found.', 404);
    }

    res.status(200).json(gallery);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Create Website Gallery
 */
export async function createWebsiteGallery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can create website galleries.', 403);
    }

    const { title, coverImageUrl, coverImageFileId, instagramUrl, published } = req.body;

    const gallery = await prisma.websiteGallery.create({
      data: {
        title,
        coverImageUrl,
        coverImageFileId,
        instagramUrl: instagramUrl || null,
        published: !!published,
      },
    });

    res.status(201).json(gallery);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update Website Gallery
 */
export async function updateWebsiteGallery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can update website galleries.', 403);
    }

    const { id } = req.params;
    const { title, coverImageUrl, coverImageFileId, instagramUrl, published } = req.body;

    // Check existence
    const existing = await prisma.websiteGallery.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Website gallery item not found.', 404);
    }

    const oldFileId = existing.coverImageFileId;
    const shouldDeleteOldFile = coverImageFileId && oldFileId && coverImageFileId !== oldFileId;

    const updatedGallery = await prisma.websiteGallery.update({
      where: { id },
      data: {
        title,
        coverImageUrl,
        coverImageFileId,
        instagramUrl: instagramUrl === '' ? null : instagramUrl,
        published,
      },
    });

    if (shouldDeleteOldFile && oldFileId) {
      console.log(`[Update Gallery ${id}] Cover image replaced. Queueing previous file ID for cleanup: ${oldFileId}`);
      await cleanupOrphanedDriveFiles([oldFileId]);
    }

    res.status(200).json(updatedGallery);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Delete Website Gallery (DB + Drive file cleanup)
 */
export async function deleteWebsiteGallery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Access Denied: Only administrators or managers can delete website galleries.', 403);
    }

    const { id } = req.params;

    const existing = await prisma.websiteGallery.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Website gallery item not found.', 404);
    }

    // 1. Delete from database first
    await prisma.websiteGallery.delete({
      where: { id },
    });

    // 2. Attempt cleanup from Google Drive
    if (existing.coverImageFileId) {
      await cleanupOrphanedDriveFiles([existing.coverImageFileId]);
    }

    res.status(200).json({ success: true, message: 'Website gallery item deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get published Website Galleries (Public landing page)
 */
export async function getPublicWebsiteGalleries(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const galleries = await prisma.websiteGallery.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(galleries);
  } catch (error) {
    next(error);
  }
}
