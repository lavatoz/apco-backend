import { z } from 'zod';

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Device registration token is required.'),
  deviceId: z.string().optional(),
  platform: z.string().optional(),
});

export const deleteDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Device registration token is required.'),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;
export type DeleteDeviceTokenInput = z.infer<typeof deleteDeviceTokenSchema>;
