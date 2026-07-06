import { z } from 'zod';

export const CreateMessageSchema = z.object({
  message: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: 'Message content cannot be empty.',
    }),
});
