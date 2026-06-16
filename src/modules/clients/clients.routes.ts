import { Router } from 'express';
import { 
  getClients, 
  getClientById, 
  createClient, 
  updateClient, 
  deleteClient 
} from './clients.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateClientSchema, UpdateClientSchema } from './clients.validation';

const router = Router();

// Protect all client routes
router.use(authenticate);

router.get('/', getClients);
router.get('/:id', getClientById);
router.post('/', validateBody(CreateClientSchema), createClient);
router.put('/:id', validateBody(UpdateClientSchema), updateClient);
router.delete('/:id', deleteClient);

export default router;
