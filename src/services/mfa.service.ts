import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import argon2 from 'argon2';

// Set service name for authenticator apps
authenticator.options = { window: 1 }; // Allow slightly out-of-sync clocks (±30 seconds)

/**
 * Generates an MFA secret and an otpauth URL for QR code scan.
 */
export function generateMfaSecret(email: string): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, 'APCO System', secret);
  return { secret, otpauthUrl };
}

/**
 * Generates a base64 Data URL for the QR code representation of the otpauth URL.
 */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  try {
    return await QRCode.toDataURL(otpauthUrl);
  } catch (error) {
    console.error('❌ Failed to generate MFA QR Code:', error);
    throw new Error('MFA QR code generation failed.');
  }
}

/**
 * Verifies a TOTP token against the user's secret.
 */
export function verifyMfaToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('MFA token verification error:', error);
    return false;
  }
}

/**
 * Generates 8 random secure backup codes and returns raw codes and their Argon2 hashes.
 */
export async function generateBackupCodes(count = 8): Promise<{ rawCodes: string[]; hashedCodes: string[] }> {
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 12-char alphanumeric backup code (e.g. "abcd-1234-efgh")
    const segment1 = crypto.randomBytes(2).toString('hex');
    const segment2 = crypto.randomBytes(2).toString('hex');
    const segment3 = crypto.randomBytes(2).toString('hex');
    const code = `${segment1}-${segment2}-${segment3}`;
    rawCodes.push(code);

    // Hash the backup code using Argon2
    const hash = await argon2.hash(code, {
      type: argon2.argon2id,
      memoryCost: 19456, // smaller cost than passwords since we verify them in bulk or one-off
      timeCost: 2,
    });
    hashedCodes.push(hash);
  }

  return { rawCodes, hashedCodes };
}

/**
 * Verifies if a backup code matches any of the stored hashed backup codes.
 * If matched, returns the code index and updates the array by removing it.
 */
export async function verifyAndConsumeBackupCode(
  rawCode: string,
  hashedCodes: string[]
): Promise<{ isValid: boolean; updatedHashedCodes?: string[] }> {
  try {
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await argon2.verify(hashedCodes[i], rawCode);
      if (isMatch) {
        // Remove the consumed backup code
        const updatedHashedCodes = [...hashedCodes];
        updatedHashedCodes.splice(i, 1);
        return { isValid: true, updatedHashedCodes };
      }
    }
    return { isValid: false };
  } catch (error) {
    console.error('Backup code verification error:', error);
    return { isValid: false };
  }
}
