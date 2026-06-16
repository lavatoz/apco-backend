import { Resend } from 'resend';
import { env } from '../config/env';

let resendClient: Resend | null = null;

if (env.RESEND_API_KEY && env.RESEND_API_KEY !== 're_123456789') {
  resendClient = new Resend(env.RESEND_API_KEY);
} else {
  console.warn('⚠️ Resend API Key is not configured. Email service will run in MOCK mode (logging to console).');
}

/**
 * Sends a password reset email to the user
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetLink = `${env.APP_URL}/auth/reset-password?token=${token}`;
  const subject = 'Reset Your APCO Password';
  const html = `
    <h1>Password Reset Request</h1>
    <p>We received a request to reset your password for your APCO account.</p>
    <p>Please click the link below to set a new password. This link is valid for 1 hour.</p>
    <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background-color:#0070f3;color:white;text-decoration:none;border-radius:5px;">Reset Password</a>
    <p>If you did not request this, you can safely ignore this email.</p>
    <br/>
    <p>Verification Token (Raw): <code>${token}</code></p>
  `;

  if (resendClient) {
    try {
      await resendClient.emails.send({
        from: 'APCO Security <security@apco.local>',
        to: email,
        subject,
        html,
      });
      console.log(`✉️ Password reset email sent to ${email} (via Resend)`);
    } catch (error) {
      console.error('❌ Failed to send password reset email via Resend:', error);
      // Fallback logging
      logMockEmail(email, 'Password Reset', resetLink);
    }
  } else {
    logMockEmail(email, 'Password Reset', resetLink);
  }
}

/**
 * Sends an email verification link to the user
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationLink = `${env.APP_URL}/auth/verify-email?token=${token}`;
  const subject = 'Verify Your APCO Email Address';
  const html = `
    <h1>Welcome to APCO</h1>
    <p>Please verify your email address to complete registration.</p>
    <p>Click the link below to verify your email:</p>
    <a href="${verificationLink}" style="display:inline-block;padding:10px 20px;background-color:#0070f3;color:white;text-decoration:none;border-radius:5px;">Verify Email</a>
    <p>If you did not create an account, you can ignore this email.</p>
    <br/>
    <p>Verification Token (Raw): <code>${token}</code></p>
  `;

  if (resendClient) {
    try {
      await resendClient.emails.send({
        from: 'APCO Security <security@apco.local>',
        to: email,
        subject,
        html,
      });
      console.log(`✉️ Verification email sent to ${email} (via Resend)`);
    } catch (error) {
      console.error('❌ Failed to send verification email via Resend:', error);
      logMockEmail(email, 'Email Verification', verificationLink);
    }
  } else {
    logMockEmail(email, 'Email Verification', verificationLink);
  }
}

function logMockEmail(to: string, type: string, link: string) {
  console.log('--- [MOCK EMAIL OUTBOX] ---');
  console.log(`To: ${to}`);
  console.log(`Type: ${type}`);
  console.log(`Action Link: ${link}`);
  console.log('---------------------------');
}
