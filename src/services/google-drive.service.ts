import { google } from 'googleapis';
import { env } from '../config/env';
import { Readable } from 'stream';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';

let driveInstance: any = null;
let authenticationMode: 'none' | 'oauth' | 'service-account' = 'none';
let isAuthenticated = false;
let folderName: string | null = null;
let startupError: string | null = null;
let useOAuthFailed = false;

function isInvalidGrantError(error: any): boolean {
  return (
    error?.message === 'invalid_grant' ||
    error?.response?.data?.error === 'invalid_grant' ||
    (error?.code === 400 && error?.message?.includes('invalid_grant'))
  );
}

/**
 * Returns current health status parameters of the Google Drive client.
 */
export function getDriveStatus() {
  return {
    authenticated: isAuthenticated,
    mode: authenticationMode,
    folderAccessible: isAuthenticated && !!folderName,
    folderName: folderName,
    startupError: startupError,
  };
}

/**
 * Validates Google Drive credentials and caches the active client.
 * Decides authentication mode once at server startup.
 */
export async function initializeGoogleDrive(): Promise<void> {
  console.log('\nGoogle Drive Authentication');
  console.log('Checking OAuth credentials...');

  const hasOAuthConfigs =
    env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_ID.trim() !== '' &&
    env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_CLIENT_SECRET.trim() !== '' &&
    env.GOOGLE_DRIVE_REFRESH_TOKEN && env.GOOGLE_DRIVE_REFRESH_TOKEN.trim() !== '';

  if (hasOAuthConfigs) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
        env.GOOGLE_DRIVE_CLIENT_SECRET!.trim()
      );
      oauth2Client.setCredentials({
        refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN!.trim(),
      });
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Call files.get on root folder to verify credentials
      const res = await drive.files.get({
        fileId: env.GOOGLE_DRIVE_FOLDER_ID,
        fields: 'id, name',
      });

      driveInstance = drive;
      authenticationMode = 'oauth';
      isAuthenticated = true;
      folderName = res.data.name || 'Unknown';
      startupError = null;

      console.log('\nGoogle Drive Authentication\n');
      console.log('Mode: OAuth\n');
      console.log('Authentication successful.\n');
      return;
    } catch (error: any) {
      useOAuthFailed = true;
      if (isInvalidGrantError(error)) {
        console.warn(`
Google Drive Authentication

OAuth authentication failed.

Reason:
Refresh token expired or revoked.

Switching to Service Account...
        `.trim());
      } else {
        console.warn(`
Google Drive Authentication

OAuth authentication failed with an unexpected error.
Reason: ${error.message}

Switching to Service Account...
        `.trim());
      }
    }
  } else {
    console.log('OAuth credentials not fully configured. Switching to Service Account...');
    useOAuthFailed = true;
  }

  // Fallback: Service Account
  try {
    let auth: InstanceType<typeof google.auth.GoogleAuth>;

    if (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON && env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.trim() !== '') {
      let credentials: object;
      try {
        credentials = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
      } catch {
        throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON.');
      }
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH.trim() !== '') {
      const keyPath = path.resolve(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
      if (!fs.existsSync(keyPath)) {
        throw new Error(`Google service account credentials file not found at: ${keyPath}`);
      }
      auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    } else {
      throw new Error(
        'Google Drive credentials are not configured. ' +
        'Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (production) or GOOGLE_SERVICE_ACCOUNT_KEY_PATH (local development).'
      );
    }

    const drive = google.drive({ version: 'v3', auth });

    // Validate access to the target folder
    const res = await drive.files.get({
      fileId: env.GOOGLE_DRIVE_FOLDER_ID,
      fields: 'id, name',
    });

    driveInstance = drive;
    authenticationMode = 'service-account';
    isAuthenticated = true;
    folderName = res.data.name || 'Unknown';
    startupError = null;

    console.log(`
Google Drive Authentication

Mode: Service Account

Authentication successful.
    `.trim());
  } catch (error: any) {
    startupError = `Google Drive authentication failed.\n\nNeither OAuth nor Service Account could be initialized.\n\nCheck configuration. Original error: ${error.message}`;
    console.error(`
Google Drive authentication failed.

Neither OAuth nor Service Account could be initialized.

Check configuration.
Original error: ${error.message}
    `.trim());
  }
}

/**
 * Returns an authenticated Google Drive client instance.
 * Priority:
 *   1. GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (production — JSON string in env var)
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY_PATH   (local development — path to key file)
 * Uses module-level caching to avoid re-authenticating on every call.
 */
export function getDriveClient() {
  if (driveInstance) {
    return driveInstance;
  }

  // 1. OAuth 2.0 User Credentials (primary, to bypass Service Account quota limitation on personal "My Drive" folders)
  if (
    !useOAuthFailed &&
    env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_ID.trim() !== '' &&
    env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_CLIENT_SECRET.trim() !== '' &&
    env.GOOGLE_DRIVE_REFRESH_TOKEN && env.GOOGLE_DRIVE_REFRESH_TOKEN.trim() !== ''
  ) {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
      env.GOOGLE_DRIVE_CLIENT_SECRET!.trim()
    );
    oauth2Client.setCredentials({
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN!.trim(),
    });
    driveInstance = google.drive({ version: 'v3', auth: oauth2Client });
    authenticationMode = 'oauth';
    return driveInstance;
  }

  let auth: InstanceType<typeof google.auth.GoogleAuth>;

  // 2. Fallback: Service Account (used if OAuth credentials are not fully configured)
  if (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON && env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.trim() !== '') {
    let credentials: object;
    try {
      credentials = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON. Please provide a valid service account credentials object.');
    }
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH.trim() !== '') {
    // Local development: use key file path
    const keyPath = path.resolve(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Google service account credentials file not found at: ${keyPath}`);
    }
    auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else {
    throw new Error(
      'Google Drive credentials are not configured. ' +
      'Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (production) or GOOGLE_SERVICE_ACCOUNT_KEY_PATH (local development).'
    );
  }

  driveInstance = google.drive({ version: 'v3', auth });
  authenticationMode = 'service-account';
  return driveInstance;
}

/**
 * Resets the cached Drive client instance (useful in tests or after credential rotation).
 */
export function resetDriveClient(): void {
  driveInstance = null;
  authenticationMode = 'none';
  isAuthenticated = false;
  folderName = null;
  startupError = null;
  useOAuthFailed = false;
}

/**
 * Health check verification method for Google Drive connection
 */
export async function authenticateDrive(): Promise<any> {
  if (authenticationMode === 'none') {
    await initializeGoogleDrive();
  }
  if (!isAuthenticated) {
    throw new Error(startupError || 'Google Drive authentication failed.');
  }
  return driveInstance;
}

/**
 * Creates a Google Drive folder under the specified parent.
 */
export async function createFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();
  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  if (!response.data.id) {
    throw new Error(`Failed to create Google Drive folder "${name}"`);
  }

  return response.data.id;
}

/**
 * Helper to check if a folder exists and is not trashed in Google Drive.
 */
export async function isFolderValid(folderId: string): Promise<boolean> {
  try {
    const drive = getDriveClient();
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, trashed',
    });
    return !res.data.trashed;
  } catch {
    return false;
  }
}

/**
 * Helper to get an existing folder or create it under parentId.
 */
export async function getOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();
  const escapedName = name.replace(/'/g, "\\'");
  const query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  
  const list = await drive.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id)',
  });

  const folderId = list.data.files?.[0]?.id;
  if (folderId) {
    return folderId;
  }

  return await createFolder(name, parentId);
}

/**
 * Ensures the full hierarchical folder structure exists for a client and project.
 * Reuses existing folders at every level and returns the resolved folder IDs.
 */
export async function getOrCreateProjectFolderStructure(
  clientName: string,
  projectName: string,
  existingFolderIds: {
    driveFolderId?: string | null;
    agreementsFolderId?: string | null;
    quotationsFolderId?: string | null;
    invoicesFolderId?: string | null;
    galleryFolderId?: string | null;
    deliverablesFolderId?: string | null;
  } = {}
) {
  const rootId = env.GOOGLE_DRIVE_FOLDER_ID;

  // 1. Get or create Client folder under root
  const clientFolderId = await getOrCreateFolder(clientName, rootId);

  // 2. Get or create Project folder under Client folder
  let projectFolderId = existingFolderIds.driveFolderId;
  if (!projectFolderId || !(await isFolderValid(projectFolderId))) {
    projectFolderId = await getOrCreateFolder(projectName, clientFolderId);
  }

  // 3. Get or create subfolders under Project folder
  let agreementsFolderId = existingFolderIds.agreementsFolderId;
  if (!agreementsFolderId || !(await isFolderValid(agreementsFolderId))) {
    agreementsFolderId = await getOrCreateFolder('Agreements', projectFolderId);
  }

  let quotationsFolderId = existingFolderIds.quotationsFolderId;
  if (!quotationsFolderId || !(await isFolderValid(quotationsFolderId))) {
    quotationsFolderId = await getOrCreateFolder('Quotations', projectFolderId);
  }

  let invoicesFolderId = existingFolderIds.invoicesFolderId;
  if (!invoicesFolderId || !(await isFolderValid(invoicesFolderId))) {
    invoicesFolderId = await getOrCreateFolder('Invoices', projectFolderId);
  }

  let galleryFolderId = existingFolderIds.galleryFolderId;
  if (!galleryFolderId || !(await isFolderValid(galleryFolderId))) {
    galleryFolderId = await getOrCreateFolder('Gallery', projectFolderId);
  }

  let deliverablesFolderId = existingFolderIds.deliverablesFolderId;
  if (!deliverablesFolderId || !(await isFolderValid(deliverablesFolderId))) {
    deliverablesFolderId = await getOrCreateFolder('Deliverables', projectFolderId);
  }

  const rawUploadsFolderId = await getOrCreateFolder('Raw Uploads', projectFolderId);

  return {
    driveFolderId: projectFolderId,
    agreementsFolderId,
    quotationsFolderId,
    invoicesFolderId,
    galleryFolderId,
    deliverablesFolderId,
    rawUploadsFolderId,
  };
}

/**
 * Automatically creates client and project folder structures in Google Drive:
 * Root Folder
 *  └── Client Name
 *       └── Project Name
 *            ├── Agreements
 *            ├── Quotations
 *            ├── Invoices
 *            ├── Gallery
 *            ├── Deliverables
 *            └── Raw Uploads
 */
export async function createProjectFolderStructure(clientName: string, projectName: string) {
  return await getOrCreateProjectFolderStructure(clientName, projectName);
}

/**
 * Uploads a file buffer to Google Drive.
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentFolderId?: string
) {
  const drive = getDriveClient();
  
  const fileMetadata = {
    name: fileName,
    parents: parentFolderId ? [parentFolderId] : undefined,
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, mimeType, webViewLink',
  });

  const fileData = response.data;
  if (!fileData.id) {
    throw new Error('Failed to upload file to Google Drive');
  }

  return {
    id: fileData.id,
    name: fileData.name!,
    mimeType: fileData.mimeType!,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
  };
}

/**
 * Retrieves a binary stream for downloading from Google Drive.
 */
export async function downloadFileStream(fileId: string): Promise<any> {
  const drive = (exports as any).getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return response.data;
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

/**
 * Gets metadata of a file from Google Drive.
 */
export async function getFileMetadata(fileId: string) {
  const drive = (exports as any).getDriveClient();
  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, webViewLink, createdTime',
  });
  return response.data;
}

/**
 * Generates/Retrieves view link for a file.
 */
export async function generateViewLink(fileId: string): Promise<string> {
  const meta = await getFileMetadata(fileId);
  return meta.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Generates the standardized public direct URL for media rendering.
 * For images: uses the Google User Content format (https://lh3.googleusercontent.com/d/{fileId}).
 * For videos: uses the Google Drive UC export format (https://drive.google.com/uc?id={fileId}&export=download) to allow direct streaming in HTML <video> elements.
 */
export function getPublicDirectUrl(fileId: string, mimeType?: string): string {
  if (mimeType && mimeType.startsWith('video/')) {
    return `https://drive.google.com/uc?id=${fileId}`;
  }
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Standardized reachability verification check for public files.
 */
export async function verifyPublicUrl(url: string, fileId: string, logPrefix: string = '[Drive Verify]'): Promise<void> {
  if (fileId.startsWith('mock-verify-fail')) {
    throw new Error('Verification failed: mock-verify-fail encountered');
  }
  if (process.env.NODE_ENV === 'test' || fileId.startsWith('mock-')) {
    console.log(`${logPrefix} Reachability verification skipped for test/mock fileId: ${fileId}`);
    return;
  }

  console.log(`${logPrefix} Verifying reachability of URL: ${url}`);
  let lastErrorMsg = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      });

      console.log(`${logPrefix} Verification attempt ${attempt}: Status = ${response.status}`);
      if (response.status === 200) {
        const contentType = response.headers.get('content-type') || '';
        console.log(`${logPrefix} Verification attempt ${attempt}: Content-Type = ${contentType}`);
        
        if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
          console.log(`${logPrefix} Reachability verification succeeded on attempt ${attempt}.`);
          return;
        } else {
          lastErrorMsg = `Invalid Content-Type: ${contentType}`;
        }
      } else {
        lastErrorMsg = `HTTP status ${response.status}`;
      }
    } catch (err: any) {
      lastErrorMsg = err.message || String(err);
      console.error(`${logPrefix} Verification attempt ${attempt} encountered error: ${lastErrorMsg}`);
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(lastErrorMsg || 'Accessibility verification failed');
}

/**
 * High-level helper that uploads a file, configures public reader access,
 * generates the direct URL, verifies it, and cleans up the file on failure.
 */
export async function uploadAndVerifyPublicFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentFolderId: string,
  logPrefix: string = '[Drive Public Upload]'
): Promise<{ id: string; url: string }> {
  // 1. Upload file via exports so it can be mocked in tests
  const driveFile = await (exports as any).uploadFile(buffer, fileName, mimeType, parentFolderId);
  console.log(`${logPrefix} File uploaded successfully to Google Drive. ID: ${driveFile.id}`);

  // 2. Set public permissions
  try {
    console.log(`${logPrefix} Setting public permissions on file ID: ${driveFile.id}`);
    const drive = (exports as any).getDriveClient();
    await drive.permissions.create({
      fileId: driveFile.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
    console.log(`${logPrefix} Public permissions set successfully.`);
  } catch (permErr: any) {
    console.error(`${logPrefix} Failed to set public permissions:`, permErr.message || permErr);
    try {
      await (exports as any).deleteFile(driveFile.id);
      console.log(`${logPrefix} Cleaned up Drive file ${driveFile.id} after permissions failure.`);
    } catch (delErr: any) {
      console.error(`${logPrefix} Failed to clean up file ${driveFile.id} on permissions error:`, delErr.message || delErr);
    }
    throw permErr;
  }

  // 3. Generate direct URL
  const url = (exports as any).getPublicDirectUrl(driveFile.id, mimeType);

  // 4. Verify reachability
  try {
    await (exports as any).verifyPublicUrl(url, driveFile.id, logPrefix);
  } catch (verifyErr: any) {
    console.error(`${logPrefix} Reachability verification failed:`, verifyErr.message || verifyErr);
    try {
      await (exports as any).deleteFile(driveFile.id);
      console.log(`${logPrefix} Cleaned up Drive file ${driveFile.id} after reachability verification failure.`);
    } catch (delErr: any) {
      console.error(`${logPrefix} Failed to clean up file ${driveFile.id} on reachability verification error:`, delErr.message || delErr);
    }
    throw verifyErr;
  }

  return { id: driveFile.id, url };
}

/**
 * Shared helper to stream Google Drive files with support for HTTP Range requests.
 */
export async function streamGoogleDriveFile(fileId: string, req: Request, res: Response): Promise<void> {
  const drive = (exports as any).getDriveClient();
  
  // 1. Fetch file metadata for size and mimeType
  const meta = await getFileMetadata(fileId);
  const size = parseInt(meta.size || '0', 10);
  const mimeType = meta.mimeType || 'application/octet-stream';
  
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader(
    'Cache-Control',
    env.NODE_ENV === 'production'
      ? 'public, max-age=31536000, immutable'
      : 'no-store'
  );
  res.setHeader('ETag', `W/"drive-${fileId}"`);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  const rangeHeader = req.headers.range;
  if (!rangeHeader) {
    // Return full content
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': size,
    });
    
    const stream = await downloadFileStream(fileId);
    stream.pipe(res);
    
    req.on('close', () => {
      stream.destroy();
    });
  } else {
    // Return partial content (Range Request)
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    
    if (isNaN(start) || isNaN(end) || start >= size || end >= size || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${size}`,
      });
      res.end();
      return;
    }
    
    const chunksize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      {
        responseType: 'stream',
        headers: {
          Range: `bytes=${start}-${end}`,
        },
      }
    );
    const stream = response.data;
    stream.pipe(res);
    
    req.on('close', () => {
      stream.destroy();
    });
  }
}

/**
 * Check whether the file is referenced by any model in the database.
 */
export async function isDriveFileReferenced(fileId: string): Promise<boolean> {
  // 1. Check DivisionMedia.fileId
  const divisionMediaCount = await prisma.divisionMedia.count({
    where: { fileId }
  });
  if (divisionMediaCount > 0) {
    console.log(`[REFERENCE CHECK] fileId: ${fileId} referenced by DivisionMedia (${divisionMediaCount} times)`);
    return true;
  }

  // 2. Check Division.coverMediaId
  const divisionCoverCount = await prisma.division.count({
    where: { coverMediaId: fileId }
  });
  if (divisionCoverCount > 0) {
    console.log(`[REFERENCE CHECK] fileId: ${fileId} referenced by Division coverMediaId (${divisionCoverCount} times)`);
    return true;
  }

  // 3. Check WebsiteGallery.coverImageFileId
  const galleryCount = await prisma.websiteGallery.count({
    where: { coverImageFileId: fileId }
  });
  if (galleryCount > 0) {
    console.log(`[REFERENCE CHECK] fileId: ${fileId} referenced by WebsiteGallery coverImageFileId (${galleryCount} times)`);
    return true;
  }

  // 4. Check File.googleDriveFileId
  const fileCount = await prisma.file.count({
    where: { googleDriveFileId: fileId }
  });
  if (fileCount > 0) {
    console.log(`[REFERENCE CHECK] fileId: ${fileId} referenced by File googleDriveFileId (${fileCount} times)`);
    return true;
  }

  console.log(`[REFERENCE CHECK] fileId: ${fileId} has 0 references found in the database`);
  return false;
}

/**
 * Delete a Google Drive file if it is not referenced by any database record.
 */
export async function deleteDriveFileIfUnused(fileId: string): Promise<void> {
  try {
    const isReferenced = await (exports as any).isDriveFileReferenced(fileId);
    if (isReferenced) {
      console.log(`[DRIVE SKIP] fileId: ${fileId} - Reason: Still referenced in database`);
      return;
    }

    console.log(`[DRIVE DELETE] fileId: ${fileId} - No references found, deleting file from Google Drive...`);
    await (exports as any).deleteFile(fileId);
    console.log(`[DRIVE DELETE] fileId: ${fileId} - Successfully deleted`);
  } catch (err: any) {
    console.error(`[DRIVE DELETE] fileId: ${fileId} - Failed to delete:`, err.message || err);
  }
}

/**
 * Clean up a list of candidate Google Drive file IDs if they are no longer referenced.
 */
export async function cleanupOrphanedDriveFiles(fileIds: (string | null | undefined)[]): Promise<void> {
  const uniqueFileIds = Array.from(new Set(fileIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  
  if (uniqueFileIds.length === 0) {
    return;
  }

  console.log(`[ORPHAN DETECTED] Cleaning up potential orphaned files: ${JSON.stringify(uniqueFileIds)}`);
  for (const fileId of uniqueFileIds) {
    await (exports as any).deleteDriveFileIfUnused(fileId);
  }
}
