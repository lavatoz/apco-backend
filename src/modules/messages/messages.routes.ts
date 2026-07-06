import { Router } from 'express';
import { getProjectMessages, createProjectMessage } from './messages.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateMessageSchema } from './messages.validation';

const router = Router();

// Protect all routes in this module
router.use(authenticate);

router.get('/:projectId/messages', getProjectMessages);
router.post('/:projectId/messages', validateBody(CreateMessageSchema), createProjectMessage);

export default router;
