import { z } from 'zod';
import { GalleryStatus } from '@prisma/client';

export const TogglePhotoSelectionSchema = z.object({
  selected: z.boolean({
    required_error: 'selected is required',
    invalid_type_error: 'selected must be a boolean',
  }),
});

export const UpdateWorkflowStatusSchema = z.object({
  status: z.nativeEnum(GalleryStatus, {
    required_error: 'status is required',
    invalid_type_error: 'Invalid gallery workflow status',
  }),
});
