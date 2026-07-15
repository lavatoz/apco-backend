import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateDivisionSchema, UpdateDivisionSchema } from './divisions.validation';
import {
  uploadDivisionMedia,
  getDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision
} from './divisions.controller';

const router = Router();

const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB maximum to allow video uploads
});

// Protect all administrative/CRUD endpoints
router.use(authenticate);

router.get('/', getDivisions);
router.get('/:id', getDivisionById);
router.post('/', validateBody(CreateDivisionSchema), createDivision);
router.put('/:id', validateBody(UpdateDivisionSchema), updateDivision);
router.delete('/:id', deleteDivision);

// Media upload endpoint
router.post('/upload', upload.single('file'), uploadDivisionMedia);

export default router;
