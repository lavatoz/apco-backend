import crypto from 'crypto';
import { prisma } from '../config/database';

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
 * Simulates applying visual security tags (Watermark / Metadata injection / Encryption config hooks)
 */
export async function securePdfDocument(
  fileBuffer: Buffer,
  _options: { watermarkText?: string; encrypt?: boolean; password?: string }
): Promise<{ securedBuffer: Buffer; fingerprint: string }> {
  // Real implementations would use pdf-lib or pdfkit.
  // For the backend foundation, we return the calculated fingerprint.
  const fingerprint = calculateDocumentHash(fileBuffer);
  
  return {
    securedBuffer: fileBuffer, // Placeholder for the actual modified buffer
    fingerprint,
  };
}
