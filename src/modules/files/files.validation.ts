import { z } from 'zod';

export const getUploadUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required.'),
  mimeType: z.string().min(1, 'Mime type is required.'),
  size: z.number().positive('File size must be positive.'),
  projectId: z.string().uuid('Project ID must be a valid UUID.').optional(),
});

export const confirmUploadSchema = z.object({
  key: z.string().min(1, 'File key is required.'),
  originalName: z.string().min(1, 'Original file name is required.'),
  mimeType: z.string().min(1, 'Mime type is required.'),
  size: z.number().positive('File size must be positive.'),
  hash: z.string().min(64, 'SHA-256 hash must be 64 characters.').max(64),
  isSecured: z.boolean().default(false),
  projectId: z.string().uuid('Project ID must be a valid UUID.').optional(),
});

export const fileIdParamSchema = z.object({
  fileId: z.string().uuid('File ID must be a valid UUID.'),
});
