import { google } from 'googleapis';
import { env } from '../config/env';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

let driveInstance: any = null;

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

  let auth: InstanceType<typeof google.auth.GoogleAuth>;

  // Production: use JSON credentials from environment variable
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
  return driveInstance;
}

/**
 * Resets the cached Drive client instance (useful in tests or after credential rotation).
 */
export function resetDriveClient(): void {
  driveInstance = null;
}

/**
 * Health check verification method for Google Drive connection
 */
export async function authenticateDrive(): Promise<any> {
  const drive = getDriveClient();
  // Call files.get on root folder to test credentials
  await drive.files.get({
    fileId: env.GOOGLE_DRIVE_FOLDER_ID,
    fields: 'id, name',
  });
  return drive;
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
  const drive = getDriveClient();
  const rootId = env.GOOGLE_DRIVE_FOLDER_ID;

  // 1. Check if client folder already exists
  const escapedClientName = clientName.replace(/'/g, "\\'");
  const clientQuery = `name = '${escapedClientName}' and mimeType = 'application/vnd.google-apps.folder' and '${rootId}' in parents and trashed = false`;
  
  const clientList = await drive.files.list({
    q: clientQuery,
    spaces: 'drive',
    fields: 'files(id, name)',
  });

  let clientFolderId = clientList.data.files?.[0]?.id;
  if (!clientFolderId) {
    clientFolderId = await createFolder(clientName, rootId);
  }

  // 2. Create Project Folder under Client Folder
  const projectFolderId = await createFolder(projectName, clientFolderId);

  // 3. Create subfolders under Project Folder
  const agreementsFolderId = await createFolder('Agreements', projectFolderId);
  const quotationsFolderId = await createFolder('Quotations', projectFolderId);
  const invoicesFolderId = await createFolder('Invoices', projectFolderId);
  const galleryFolderId = await createFolder('Gallery', projectFolderId);
  const deliverablesFolderId = await createFolder('Deliverables', projectFolderId);
  const rawUploadsFolderId = await createFolder('Raw Uploads', projectFolderId);

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
  const drive = getDriveClient();
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
  const drive = getDriveClient();
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
