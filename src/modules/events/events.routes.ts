import { Router } from 'express';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getPersonnelAssignedToEvent,
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

// Retrieve all personnel assigned to this event
router.get('/:id/personnel', getPersonnelAssignedToEvent);

export default router;
