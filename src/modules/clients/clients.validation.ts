import { z } from 'zod';

const EventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
  actualCompletedAt: z.string().optional().nullable(),
  brideLocation: z.string().optional().nullable(),
  groomLocation: z.string().optional().nullable(),
  venueLocation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string(),
});

export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  events: z.array(EventSchema).optional(),
});

export const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  events: z.array(EventSchema).optional(),
});

