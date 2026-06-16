import { z } from 'zod';

export const CreateExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)),
  category: z.string().min(1, 'Category is required'),
  date: z.string().datetime('Date must be a valid ISO datetime string'),
  clientId: z.string().uuid().optional().nullable(),
  brand: z.string().min(1, 'Brand is required'),
  divisionId: z.string().optional().nullable(),
});

export const UpdateExpenseSchema = z.object({
  description: z.string().optional(),
  amount: z.union([z.number(), z.string()]).transform((val) => String(val)).optional(),
  category: z.string().optional(),
  date: z.string().datetime().optional(),
  clientId: z.string().uuid().optional().nullable(),
  brand: z.string().optional(),
  divisionId: z.string().optional().nullable(),
});
