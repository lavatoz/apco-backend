import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters long'),
  R2_ACCOUNT_ID: z.string().optional().or(z.literal('')),
  R2_ACCESS_KEY: z.string().optional().or(z.literal('')),
  R2_SECRET_KEY: z.string().optional().or(z.literal('')),
  R2_BUCKET: z.string().optional().or(z.literal('')),
  RESEND_API_KEY: z.string().optional().or(z.literal('')),
  RESEND_FROM_EMAIL: z.string().optional().or(z.literal('')),
  RESEND_LOGO_URL: z.string().optional().or(z.literal('')),
  APP_URL: z.string().url('APP_URL must be a valid URL'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  GOOGLE_DRIVE_FOLDER_ID: z.string().min(1, 'GOOGLE_DRIVE_FOLDER_ID is required'),
  // Production: JSON credentials string from environment variable
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: z.string().optional().or(z.literal('')),
  // Local development: path to service account key file
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string().optional().or(z.literal('')),
  // Optional OAuth 2.0 credentials (for folder owner upload context)
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().or(z.literal('')),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional().or(z.literal('')),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional().or(z.literal('')),
  BYPASS_MFA: z.string().optional().transform((val) => val === 'true'),
  FIREBASE_PROJECT_ID: z.string().optional().or(z.literal('')),
  FIREBASE_CLIENT_EMAIL: z.string().optional().or(z.literal('')),
  FIREBASE_PRIVATE_KEY: z.string().optional().or(z.literal('')),
});

type Env = z.infer<typeof envSchema>;

let validatedEnv: Env;

try {
  validatedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingKeys = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('\n');
    console.error('❌ Environment configuration error:\n' + missingKeys);
    process.exit(1);
  }
  throw error;
}

export const env = validatedEnv;
export type EnvType = Env;
