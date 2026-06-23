import { z } from 'zod';

export const CreateEventSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1, 'Client ID is required'),
  name: z.string().min(1, 'Event name is required'),
  date: z.string().min(1, 'Event date is required'),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
  actualCompletedAt: z.string().optional().nullable(),
  brideLocation: z.string().optional().nullable(),
  groomLocation: z.string().optional().nullable(),
  venueLocation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional().default('Scheduled'),
});

export const UpdateEventSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
  actualCompletedAt: z.string().optional().nullable(),
  brideLocation: z.string().optional().nullable(),
  groomLocation: z.string().optional().nullable(),
  venueLocation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
});
