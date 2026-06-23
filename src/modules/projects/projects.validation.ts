import { z } from 'zod';
import { Role } from '@prisma/client';

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional().nullable(),
  status: z.string().default('Draft'),
  clientId: z.string().uuid('Invalid client ID'),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
});

export const AssignStaffSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.nativeEnum(Role),
  eventId: z.string().optional().nullable(),
});

export const UpdateAssignedEventsSchema = z.object({
  eventIds: z.array(z.string()),
});

