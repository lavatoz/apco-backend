import { Router } from 'express';
import { 
  getApprovals, 
  createApproval, 
  verifyApproval, 
  deleteApproval 
} from './approvals.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all approval routes
router.use(authenticate);

router.get('/', getApprovals);
router.post('/', createApproval);
router.put('/:id/verify', verifyApproval);
router.delete('/:id', deleteApproval);

export default router;
