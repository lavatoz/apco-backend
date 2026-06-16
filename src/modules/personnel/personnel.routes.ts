import { Router } from 'express';
import { 
  getPersonnel, 
  getPersonnelById, 
  createPersonnel, 
  updatePersonnel, 
  deletePersonnel 
} from './personnel.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all personnel routes
router.use(authenticate);

router.get('/', getPersonnel);
router.get('/:id', getPersonnelById);
router.post('/', createPersonnel);
router.put('/:id', updatePersonnel);
router.delete('/:id', deletePersonnel);

export default router;
