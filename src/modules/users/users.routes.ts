import { Router } from 'express';
import { 
  getUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser 
} from './users.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateUserSchema, UpdateUserSchema } from './users.validation';

const router = Router();

// Protect all user routes
router.use(authenticate);

router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', validateBody(CreateUserSchema), createUser);
router.put('/:id', validateBody(UpdateUserSchema), updateUser);
router.delete('/:id', deleteUser);

export default router;
