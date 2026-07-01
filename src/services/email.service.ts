import { Resend } from 'resend';
import { env } from '../config/env';

// Clear logging on startup to indicate key presence without printing it
console.log(`[RESEND INIT] API Key present in env: ${!!env.RESEND_API_KEY}`);

let resendClient: Resend | null = null;

if (env.RESEND_API_KEY) {
  // Use the configured API key to initialize the Resend client (even if placeholder/mock)
  resendClient = new Resend(env.RESEND_API_KEY);
  console.log('[RESEND INIT] Resend client initialized.');
} else {
  console.warn('⚠️ Resend API Key is not configured.');
}

/**
 * Resolves the sender email address based on configuration and environment
 */
function getSenderEmail(): string {
  if (env.RESEND_FROM_EMAIL) {
    return env.RESEND_FROM_EMAIL;
  }
  // Replace current sender with onboarding@resend.dev during dev/test mode
  return 'APCO Security <onboarding@resend.dev>';
}

/**
 * Sends a password reset email to the user
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetLink = `${env.APP_URL}/auth/reset-password?token=${token}`;
  const subject = 'Reset Your APCO Password';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -1px rgba(0,0,0,0.03);overflow:hidden;">
          <tr>
            <td style="padding:40px 30px;">
              <!-- Header Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:30px;text-align:center;">
                <tr>
                  <td align="center">
                    <!-- TODO: Reintroduce the company logo here after deployment using a public HTTPS URL -->
                    <div style="font-size:20px;font-weight:700;color:#111827;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      Artisans Production Company
                    </div>
                    <div style="font-size:12px;color:#6b7280;letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      Professional Wedding & Event Management Platform
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Content Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Reset Your Password</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:16px;">
                    <p style="margin:0;font-size:16px;font-weight:600;color:#1f2937;line-height:1.4;">Password Reset Request</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:20px;">
                    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">We received a request to reset your password for your Artisans account.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">Please click the link below to set a new password. This link is valid for 1 hour.</p>
                  </td>
                </tr>
                <!-- Action Button -->
                <tr>
                  <td align="center" style="padding-bottom:30px;">
                    <a href="${resetLink}" style="display:inline-block;background-color:#000000;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;border:1px solid #000000;text-align:center;min-width:150px;">Reset Password</a>
                  </td>
                </tr>
                <!-- Information Section -->
                <tr>
                  <td style="padding:20px;background-color:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;">
                    <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#6b7280;line-height:1.6;">
                      <li style="margin-bottom:8px;">This password reset link expires in 1 hour.</li>
                      <li>If you did not request this, you can safely ignore this email.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Footer Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e7eb;text-align:center;">
                <tr>
                  <td style="font-size:13px;font-weight:600;color:#374151;padding-bottom:4px;">
                    Artisans Production Company
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#6b7280;padding-bottom:16px;">
                    Professional Wedding & Event Production Platform
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#9ca3af;padding-bottom:4px;">
                    Need help? <a href="mailto:support@artisansproductioncompany.com" style="color:#2563eb;text-decoration:none;">support@artisansproductioncompany.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#9ca3af;">
                    &copy; 2026 Artisans Production Company. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const fromEmail = getSenderEmail();
  console.log(`[PASSWORD RESET EMAIL] Sending email...`);
  console.log(`[PASSWORD RESET EMAIL] API Key loaded: ${!!env.RESEND_API_KEY}`);
  console.log(`[PASSWORD RESET EMAIL] Sender email: ${fromEmail}`);
  console.log(`[PASSWORD RESET EMAIL] Recipient email: ${email}`);

  if (env.NODE_ENV === 'test') {
    console.log(`[PASSWORD RESET EMAIL] Running in TEST mode. Bypassing real Resend call.`);
    console.log('--- [MOCK EMAIL OUTBOX] ---');
    console.log(`To: ${email}`);
    console.log(`Type: Password Reset`);
    console.log(`Action Link: ${resetLink}`);
    console.log('---------------------------');
    return;
  }

  if (!resendClient) {
    const error = new Error('Resend client is not initialized because RESEND_API_KEY is missing.');
    console.error(`[PASSWORD RESET EMAIL] Failed: ${error.message}`);
    throw error;
  }

  try {
    const response = await resendClient.emails.send({
      from: fromEmail,
      to: email,
      subject,
      html,
    });

    if (response.error) {
      const errorObj = response.error;
      const errorMsg = typeof errorObj === 'object' ? JSON.stringify(errorObj) : String(errorObj);
      const error = new Error(`Resend API Error: ${errorMsg}`);
      console.error(`[PASSWORD RESET EMAIL] Failed: ${error.message}`);
      throw error;
    }

    console.log(`[PASSWORD RESET EMAIL] Resend response ID: ${response.data?.id || 'N/A'}`);
    console.log(`✉️ Password reset email sent to ${email} (via Resend)`);
  } catch (error: any) {
    console.error(`[PASSWORD RESET EMAIL] Failed: ${error.message || error}`);
    throw error;
  }
}

/**
 * Sends an email verification link to the user
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationLink = `${env.APP_URL}/api/auth/email-verification/confirm?token=${token}`;
  const subject = 'Verify Your APCO Email Address';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email Address</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6;padding:40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -1px rgba(0,0,0,0.03);overflow:hidden;">
          <tr>
            <td style="padding:40px 30px;">
              <!-- Header Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:30px;text-align:center;">
                <tr>
                  <td align="center">
                    <!-- TODO: Reintroduce the company logo here after deployment using a public HTTPS URL -->
                    <div style="font-size:20px;font-weight:700;color:#111827;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      Artisans Production Company
                    </div>
                    <div style="font-size:12px;color:#6b7280;letter-spacing:0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                      Professional Wedding & Event Management Platform
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Content Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">Verify Your Email Address</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:16px;">
                    <p style="margin:0;font-size:16px;font-weight:600;color:#1f2937;line-height:1.4;">Welcome to Artisans Production Company</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:20px;">
                    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">Thank you for creating your account.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">Please verify your email address to activate your account and securely access the Artisans platform.</p>
                  </td>
                </tr>
                <!-- Action Button -->
                <tr>
                  <td align="center" style="padding-bottom:30px;">
                    <a href="${verificationLink}" style="display:inline-block;background-color:#000000;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;border:1px solid #000000;text-align:center;min-width:150px;">Verify Email</a>
                  </td>
                </tr>
                <!-- Information Section -->
                <tr>
                  <td style="padding:20px;background-color:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;">
                    <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#6b7280;line-height:1.6;">
                      <li style="margin-bottom:8px;">This verification link expires in 24 hours.</li>
                      <li>If you did not create this account, you can safely ignore this email.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Footer Section -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e7eb;text-align:center;">
                <tr>
                  <td style="font-size:13px;font-weight:600;color:#374151;padding-bottom:4px;">
                    Artisans Production Company
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#6b7280;padding-bottom:16px;">
                    Professional Wedding & Event Production Platform
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#9ca3af;padding-bottom:4px;">
                    Need help? <a href="mailto:support@artisansproductioncompany.com" style="color:#2563eb;text-decoration:none;">support@artisansproductioncompany.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:#9ca3af;">
                    &copy; 2026 Artisans Production Company. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const fromEmail = getSenderEmail();
  console.log(`[EMAIL VERIFICATION] Sending email...`);
  console.log(`[EMAIL VERIFICATION] API Key loaded: ${!!env.RESEND_API_KEY}`);
  console.log(`[EMAIL VERIFICATION] Sender email: ${fromEmail}`);
  console.log(`[EMAIL VERIFICATION] Recipient email: ${email}`);

  if (env.NODE_ENV === 'test') {
    console.log(`[EMAIL VERIFICATION] Running in TEST mode. Bypassing real Resend call.`);
    console.log('--- [MOCK EMAIL OUTBOX] ---');
    console.log(`To: ${email}`);
    console.log(`Type: Email Verification`);
    console.log(`Action Link: ${verificationLink}`);
    console.log('---------------------------');
    return;
  }

  if (!resendClient) {
    const error = new Error('Resend client is not initialized because RESEND_API_KEY is missing.');
    console.error(`[EMAIL VERIFICATION] Failed: ${error.message}`);
    throw error;
  }

  try {
    const response = await resendClient.emails.send({
      from: fromEmail,
      to: email,
      subject,
      html,
    });
    
    if (response.error) {
      const errorObj = response.error;
      const errorMsg = typeof errorObj === 'object' ? JSON.stringify(errorObj) : String(errorObj);
      const error = new Error(`Resend API Error: ${errorMsg}`);
      console.error(`[EMAIL VERIFICATION] Failed: ${error.message}`);
      throw error;
    }

    console.log(`[EMAIL VERIFICATION] Resend response ID: ${response.data?.id || 'N/A'}`);
    console.log(`✉️ Verification email sent to ${email} (via Resend)`);
  } catch (error: any) {
    console.error(`[EMAIL VERIFICATION] Failed: ${error.message || error}`);
    throw error;
  }
}

