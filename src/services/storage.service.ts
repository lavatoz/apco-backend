import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, isR2Configured } from '../config/s3';
import { env } from '../config/env';
import { logAudit, extractReqMeta } from './audit.service';

/**
 * Generates an expiring presigned download URL for a given file key
 * and logs the download audit event.
 */
export async function getPresignedDownloadUrl(
  fileKey: string,
  fileName: string,
  expiresInSeconds = 1800, // 30 minutes default
  userId?: string,
  req?: any
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('Storage service is not configured.');
  }

  const s3Client = getS3Client();
  if (!s3Client) {
    throw new Error('S3 Client is not initialized.');
  }

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: fileKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  });

  // Generate presigned URL
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });

  // Audit Log the file download request
  const meta = extractReqMeta(req);
  await logAudit({
    userId,
    action: 'FILE_DOWNLOAD',
    details: { fileKey, fileName, expiresInSeconds },
    ...meta,
  });

  return signedUrl;
}

/**
 * Generates an expiring presigned upload URL for direct client-to-R2 uploads.
 */
export async function getPresignedUploadUrl(
  fileKey: string,
  mimeType: string,
  sizeLimitBytes: number,
  expiresInSeconds = 900 // 15 minutes default
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('Storage service is not configured.');
  }

  const s3Client = getS3Client();
  if (!s3Client) {
    throw new Error('S3 Client is not initialized.');
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: fileKey,
    ContentType: mimeType,
    ContentLength: sizeLimitBytes,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}
