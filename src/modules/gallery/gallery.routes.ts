import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import { authenticate, requireAnyRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import {
  CreateCollectionSchema,
  UpdateCollectionSchema,
  UpdateImageSchema,
  ReorderImagesSchema,
} from './gallery.validation';
import {
  getAdminCollectionsController,
  getAdminCollectionByIdController,
  createCollectionController,
  updateCollectionController,
  deleteCollectionController,
  publishCollectionController,
  unpublishCollectionController,
  uploadCollectionImagesController,
  deleteImageController,
  updateImageController,
  reorderImagesController,
  getPublicCollectionsController,
  getPublicCollectionBySlugController,
} from './gallery.controller';

const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file size limit
});

export const adminGalleryRouter = Router();
export const publicGalleryRouter = Router();

// ==========================================
// ADMIN GALLERY ROUTES (Protected)
// ==========================================
adminGalleryRouter.use(authenticate);
adminGalleryRouter.use(requireAnyRole([Role.SystemAdmin, Role.Manager, Role.Marketing]));

// Collections CRUD & Publish/Unpublish
adminGalleryRouter.get('/collections', getAdminCollectionsController);
adminGalleryRouter.get('/collections/:id', getAdminCollectionByIdController);
adminGalleryRouter.post('/collections', validateBody(CreateCollectionSchema), createCollectionController);
adminGalleryRouter.put('/collections/:id', validateBody(UpdateCollectionSchema), updateCollectionController);
adminGalleryRouter.delete('/collections/:id', deleteCollectionController);
adminGalleryRouter.post('/collections/:id/publish', publishCollectionController);
adminGalleryRouter.post('/collections/:id/unpublish', unpublishCollectionController);

// Images Upload, Delete, Update, Reorder
adminGalleryRouter.post('/collections/:id/images', upload.any(), uploadCollectionImagesController);
adminGalleryRouter.delete('/images/:id', deleteImageController);
adminGalleryRouter.put('/images/:id', validateBody(UpdateImageSchema), updateImageController);
adminGalleryRouter.post('/images/reorder', validateBody(ReorderImagesSchema), reorderImagesController);

// ==========================================
// PUBLIC GALLERY ROUTES (Unauthenticated)
// ==========================================
publicGalleryRouter.get('/collections', getPublicCollectionsController);
publicGalleryRouter.get('/collections/:slug', getPublicCollectionBySlugController);
