import { z } from 'zod';

export const CreateCollectionSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters long.'),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required.'),
  heroImage: z.string().optional(),
  coverImage: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export const UpdateCollectionSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters long.').optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: z.string().min(1).optional(),
  heroImage: z.string().optional(),
  coverImage: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export const UpdateImageSchema = z.object({
  caption: z.string().optional(),
  altText: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
});

export const ReorderImagesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1, 'Image ID is required.'),
      displayOrder: z.number().int().min(0, 'displayOrder must be an integer >= 0.'),
    })
  ).min(1, 'Items array must not be empty.'),
});
