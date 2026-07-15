import { z } from 'zod';

export const CreateWebsiteGallerySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  coverImageUrl: z.string().url('Invalid cover image URL'),
  coverImageFileId: z.string().min(1, 'Cover image file ID is required'),
  instagramUrl: z.string().url('Invalid Instagram URL').or(z.string().length(0)).nullable().optional(),
  published: z.boolean().default(false),
});

export const UpdateWebsiteGallerySchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  coverImageUrl: z.string().url('Invalid cover image URL').optional(),
  coverImageFileId: z.string().min(1, 'Cover image file ID is required').optional(),
  instagramUrl: z.string().url('Invalid Instagram URL').or(z.string().length(0)).nullable().optional(),
  published: z.boolean().optional(),
});
