import crypto from 'crypto';
import { prisma } from '../config/database';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

export interface DocumentMetadata {
  documentId: string;
  fingerprint: string;
  issuedTo: string;
  issuedAt: Date;
  signerName: string;
}

/**
 * Computes SHA-256 hash of a file buffer to act as a unique fingerprint.
 */
export function calculateDocumentHash(fileBuffer: Buffer): string {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Verifies a document's current hash against its registered database fingerprint.
 */
export async function verifyDocumentIntegrity(fileId: string, currentBuffer: Buffer): Promise<{
  isValid: boolean;
  registeredHash?: string;
  currentHash: string;
}> {
  const fileRecord = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!fileRecord || fileRecord.deletedAt) {
    throw new Error('Document record not found.');
  }

  const currentHash = calculateDocumentHash(currentBuffer);
  const isValid = fileRecord.hash === currentHash;

  return {
    isValid,
    registeredHash: fileRecord.hash,
    currentHash,
  };
}

/**
 * Generates structured verification metadata for QR code inclusion.
 */
export function generateVerificationMetadata(
  documentId: string,
  fingerprint: string,
  issuedTo: string,
  signerName = 'APCO System'
): DocumentMetadata {
  return {
    documentId,
    fingerprint,
    issuedTo,
    issuedAt: new Date(),
    signerName,
  };
}

/**
 * Encrypts a PDF document using AES-256 with the specified passwords.
 */
export async function encryptPdfDocument(
  fileBuffer: Buffer,
  userPassword: string,
  ownerPassword?: string
): Promise<Buffer> {
  const encryptedBytes = await encryptPDF(new Uint8Array(fileBuffer), userPassword, {
    algorithm: 'AES-256',
    ownerPassword: ownerPassword || undefined,
    allowCopying: false,
    allowModifying: false,
    allowPrinting: true,
  });
  return Buffer.from(encryptedBytes);
}

/**
 * Applies visual security tags (Watermark / Metadata injection) and encrypts the document
 * using AES-256 if password protection is enabled in the settings or explicitly requested.
 */
export async function securePdfDocument(
  fileBuffer: Buffer,
  options?: { watermarkText?: string; encrypt?: boolean; password?: string }
): Promise<{ securedBuffer: Buffer; fingerprint: string }> {
  let securedBuffer = fileBuffer;

  // Read settings from the GlobalSetting database table
  const settings = await prisma.globalSetting.findMany();
  const dbOwnerPassword = settings.find(s => s.key === 'pdfOwnerPassword')?.value;
  const dbPasswordMode = settings.find(s => s.key === 'pdfPasswordMode')?.value || 'open-password';
  const dbUserPassword = settings.find(s => s.key === 'pdfUserPassword')?.value;

  // Encryption is enabled if pdfOwnerPassword is set in DB, OR options.encrypt is explicitly true
  const isEncryptionEnabled = !!(dbOwnerPassword && dbOwnerPassword.trim() !== '');
  const shouldEncrypt = options?.encrypt !== undefined ? options.encrypt : isEncryptionEnabled;

  // Determine user/owner passwords matching the mode
  const ownerPassword = dbOwnerPassword || 'Artisans@2026';
  const useOpenPassword = dbPasswordMode === 'open-password';
  
  let userPassword = '';
  if (useOpenPassword) {
    userPassword = dbUserPassword || dbOwnerPassword || '';
  }

  // Override userPassword if explicitly supplied in options
  const actualUserPassword = options?.password !== undefined ? options.password : userPassword;

  // Logs as requested by the user
  console.log(`[securePdfDocument] pdfPasswordMode: ${dbPasswordMode}`);
  console.log(`[securePdfDocument] pdfUserPassword: ${dbUserPassword}`);
  console.log(`[securePdfDocument] pdfOwnerPassword: ${dbOwnerPassword}`);
  console.log(`[securePdfDocument] userPassword (passed to encryptPDF): ${actualUserPassword}`);
  console.log(`[securePdfDocument] ownerPassword (passed to encryptPDF): ${ownerPassword}`);

  if (shouldEncrypt) {
    try {
      securedBuffer = await encryptPdfDocument(fileBuffer, actualUserPassword, ownerPassword);
      console.log(`[securePdfDocument] PDF buffer size after encryption: ${securedBuffer.length} bytes`);
    } catch (error: any) {
      console.error('❌ PDF Encryption failed:', error);
      throw new Error(`PDF encryption failed: ${error.message || error}`);
    }
  }

  // Calculate fingerprint on the final secured buffer
  const fingerprint = calculateDocumentHash(securedBuffer);
  
  return {
    securedBuffer,
    fingerprint,
  };
}
