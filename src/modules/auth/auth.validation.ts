import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format.'),
  password: z.string().min(1, 'Password is required.'),
});

export const mfaLoginVerifySchema = z.object({
  tempToken: z.string().min(1, 'Temporary authentication token is required.'),
  code: z.string().min(6, 'MFA Code must be 6 digits.').max(6),
});

export const mfaVerifySchema = z.object({
  code: z.string().min(6, 'MFA Code must be 6 digits.').max(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string()
    .min(12, 'New password must be at least 12 characters long.')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'New password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'New password must contain at least one special character.'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address format.'),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  newPassword: z.string()
    .min(12, 'Password must be at least 12 characters long.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address format.'),
});

export const activateClientSchema = z.object({
  token: z.string().min(1, 'Token is required.'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters long.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
});

