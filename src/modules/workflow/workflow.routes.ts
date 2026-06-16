import { Router } from 'express';
import { getProjectTimeline } from './workflow.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect workflow routes
router.use(authenticate);

router.get('/projects/:projectId/timeline', getProjectTimeline);

export default router;
