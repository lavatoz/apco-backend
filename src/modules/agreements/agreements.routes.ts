import { Router } from 'express';
import { generateProjectAgreement } from './agreements.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all agreement routes
router.use(authenticate);

// Generate agreement PDF for a project
router.post('/generate/:projectId', generateProjectAgreement);

export default router;
