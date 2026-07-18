import { authenticator } from 'otplib';
import QRCode from 'qrcode';

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

