import { Router } from 'express';
import {
  getPersonnel,
  getPersonnelById,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  assignEventToPersonnel,
  removeEventAssignment,
} from './personnel.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { AssignPersonnelEventSchema } from './personnel.validation';

const router = Router();

// Protect all personnel routes
router.use(authenticate);

router.get('/', getPersonnel);
router.get('/:id', getPersonnelById);
router.post('/', createPersonnel);
router.put('/:id', updatePersonnel);
router.delete('/:id', deletePersonnel);

// Event Assignments
router.post('/assignments', validateBody(AssignPersonnelEventSchema), assignEventToPersonnel);
router.delete('/assignments/:id', removeEventAssignment);
router.delete('/assignments', removeEventAssignment);

export default router;
