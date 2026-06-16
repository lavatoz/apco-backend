import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

const hasR2Config = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY &&
  env.R2_SECRET_KEY &&
  env.R2_BUCKET
);

let s3Client: S3Client | null = null;

if (hasR2Config) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY || '',
      secretAccessKey: env.R2_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });
} else {
  console.warn('⚠️ Cloudflare R2 credentials are not fully configured. Storage operations will degrade.');
}

/**
 * Returns the S3Client instance or null if not configured
 */
export function getS3Client(): S3Client | null {
  return s3Client;
}

/**
 * Returns true if S3/R2 configuration is complete
 */
export function isR2Configured(): boolean {
  return hasR2Config;
}

/**
 * Validates connectivity to Cloudflare R2 by checking credentials or listing buckets/probing
 */
export async function checkStorageConnection(): Promise<boolean> {
  if (!s3Client) {
    return false;
  }
  try {
    // A quick lightweight request (e.g. listObjectsV2 or headBucket) to verify connection works
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    await s3Client.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET,
        MaxKeys: 1,
      })
    );
    return true;
  } catch (error) {
    console.error('❌ Cloudflare R2 storage connection check failed:', error);
    return false;
  }
}
