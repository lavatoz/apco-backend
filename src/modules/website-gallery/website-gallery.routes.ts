import { Router } from 'express';
import {
  uploadWebsiteGalleryCover,
  getWebsiteGalleries,
  getWebsiteGalleryById,
  createWebsiteGallery,
  updateWebsiteGallery,
  deleteWebsiteGallery
} from './website-gallery.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateWebsiteGallerySchema, UpdateWebsiteGallerySchema } from './website-gallery.validation';
import multer from 'multer';

const router = Router();

// Enforce stream limit (e.g. 10MB to avoid large stream attacks prior to size checking)
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }
});

// All routes here are protected by the authenticate middleware
router.use(authenticate);

// CRUD routes
router.get('/', getWebsiteGalleries);
router.get('/:id', getWebsiteGalleryById);
router.post('/', validateBody(CreateWebsiteGallerySchema), createWebsiteGallery);
router.put('/:id', validateBody(UpdateWebsiteGallerySchema), updateWebsiteGallery);
router.delete('/:id', deleteWebsiteGallery);

// Cover image upload
router.post('/upload', upload.single('file'), uploadWebsiteGalleryCover);

export default router;
