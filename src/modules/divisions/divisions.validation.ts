import { z } from 'zod';
import { DivisionMediaType } from '@prisma/client';

export const DivisionMediaInputSchema = z.object({
  type: z.nativeEnum(DivisionMediaType),
  position: z.number().int(),
  url: z.string(),
  fileId: z.string().min(1, 'File ID is required'),
}).superRefine((data, ctx) => {
  // Validate URL: must be a valid absolute URL or a valid proxy URL matching the fileId
  let isUrlValid = false;
  try {
    new URL(data.url);
    isUrlValid = true;
  } catch {
    if (data.url === `/api/public/divisions/media/${data.fileId}`) {
      isUrlValid = true;
    }
  }

  if (!isUrlValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid media URL',
      path: ['url']
    });
  }

  if (data.type === DivisionMediaType.IMAGE) {
    if (data.position < 1 || data.position > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Image media position must be between 1 and 3',
        path: ['position']
      });
    }
  } else if (data.type === DivisionMediaType.VIDEO) {
    if (data.position !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Video media position must be 4',
        path: ['position']
      });
    }
  }
});

export const CreateDivisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  instagramUrl: z.string().url('Invalid Instagram URL').or(z.string().length(0)).nullable().optional(),
  published: z.boolean().default(false),
  coverMediaId: z.string().nullable().optional(),
  media: z.array(DivisionMediaInputSchema).optional(),
});

export const UpdateDivisionSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  instagramUrl: z.string().url('Invalid Instagram URL').or(z.string().length(0)).nullable().optional(),
  published: z.boolean().optional(),
  coverMediaId: z.string().nullable().optional(),
  media: z.array(DivisionMediaInputSchema).optional(),
});
