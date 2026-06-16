import { Router } from 'express';
import { 
  uploadProjectFile, 
  downloadProjectFile, 
  getFilesByProject, 
  deleteProjectFile,
  getFiles,
  confirmUpload
} from './google-drive.controller';
import { authenticate } from '../../middleware/auth';
import { downloadLimiter } from '../../middleware/rate-limiters';
import multer from 'multer';

const router = Router();

// Enforce 100MB limit on the upload stream
const upload = multer({ 
  limits: { fileSize: 100 * 1024 * 1024 } 
});

// Secure all file endpoints behind JWT authentication
router.use(authenticate);

// File Operations Endpoints
router.get('/', getFiles);
router.post('/confirm', confirmUpload);
router.post('/upload', upload.single('file'), uploadProjectFile);
router.get('/:id/download', downloadLimiter, downloadProjectFile);
router.get('/project/:projectId', getFilesByProject);
router.delete('/:id', deleteProjectFile);

export default router;
