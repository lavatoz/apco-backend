import { Router } from 'express';
import { 
  getEvents, 
  createEvent, 
  updateEvent, 
  deleteEvent 
} from './events.controller';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validation';
import { CreateEventSchema, UpdateEventSchema } from './events.validation';

const router = Router();

// Protect all event routes
router.use(authenticate);

router.get('/', getEvents);
router.post('/', validateBody(CreateEventSchema), createEvent);
router.put('/:id', validateBody(UpdateEventSchema), updateEvent);
router.delete('/:id', deleteEvent);

export default router;
