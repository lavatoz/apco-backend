import { z } from 'zod';

export const AssignPersonnelEventSchema = z.object({
  personnelId: z.string().min(1, 'Personnel ID is required'),
  eventId: z.string().min(1, 'Event ID is required'),
  notes: z.string().optional().nullable(),
});
