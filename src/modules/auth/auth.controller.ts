import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { Role } from '@prisma/client';
import { verifyPassword, hashPassword } from '../../utils/hash';
import { 
  signAccessToken, 
  hashToken, 
  generateRandomToken 
} from '../../utils/jwt';
import { 
  generateMfaSecret, 
  generateQrCodeDataUrl, 
  verifyMfaToken, 
  generateBackupCodes, 
  verifyAndConsumeBackupCode 
} from '../../services/mfa.service';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../services/email.service';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logSecurityEvent } from '../../services/security-event.service';
import { AppError } from '../../middleware/error';
import { env } from '../../config/env';

/**
 * Creates user session and signs JWT tokens
 */
async function createTokensAndSession(
  userId: string,
  userRole: string,
  req: Request
): Promise<{ accessToken: string; refreshToken: string }> {
  // 1. Generate token keys
  const accessToken = signAccessToken({ userId, role: userRole });
  const rawRefreshToken = generateRandomToken();
  const tokenHash = hashToken(rawRefreshToken);
  
  // 30 days expiration
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // 2. Save Refresh Token in DB
  const dbRefreshToken = await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  // 3. Create Session tracking record
  const meta = extractReqMeta(req);
  const rawDevice = req.headers['sec-ch-ua'] || req.headers['user-agent'] || 'Unknown Device';
  const deviceName = Array.isArray(rawDevice) ? rawDevice.join(', ') : rawDevice;

  await prisma.userSession.create({
    data: {
      userId,
      refreshTokenId: dbRefreshToken.id,
      deviceName: deviceName.slice(0, 200),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
  };
}

/**
 * Endpoint: Login User
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const meta = extractReqMeta(req);

    console.log(`[AUTH_DEBUG] Login attempt for email: ${email}`);
    // Fetch user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`[AUTH_DEBUG] User not found for email: ${email}`);
      // Return ambiguous error to prevent user enumeration attacks
      throw new AppError('Invalid email or password.', 401);
    }

    console.log(`[AUTH_DEBUG] User found: id=${user.id}, email=${user.email}, role=${user.role}, status=${user.status}, emailVerified=${user.emailVerified}, mustChangePassword=${user.mustChangePassword}`);

    // Check account lockout status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'ACCOUNT_LOCKED',
        details: { message: 'Attempt to log in while account is locked.' },
        ...meta,
      });
      throw new AppError('This account is temporarily locked due to multiple failed attempts. Please try again later.', 403);
    } else if (user.lockedUntil && user.lockedUntil <= new Date()) {
      // Lock expired, reset failed attempts
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Verify password
    if (!user.passwordHash) {
      throw new AppError('This account is pending activation. Please complete setup using your invitation link.', 401);
    }

    console.log(`[AUTH_DEBUG] Verifying password. Stored hash exists: ${!!user.passwordHash}`);
    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    console.log(`[AUTH_DEBUG] Password verification result: ${isPasswordValid}`);

    if (!isPasswordValid) {
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const dataUpdate: any = { failedLoginAttempts: newFailedAttempts };

      if (newFailedAttempts >= 5) {
        dataUpdate.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
        dataUpdate.failedLoginAttempts = 0; // reset attempts counter on lock
        
        await logSecurityEvent({
          userId: user.id,
          eventType: 'ACCOUNT_LOCKED',
          details: { message: 'Account locked due to 5 failed login attempts.' },
          ...meta,
        });
      } else {
        await logSecurityEvent({
          userId: user.id,
          eventType: 'FAILED_LOGIN',
          details: { attempts: newFailedAttempts },
          ...meta,
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: dataUpdate,
      });

      throw new AppError('Invalid email or password.', 401);
    }

    // Reset failed attempts on success
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // GATE 1: Email verification required before login
    if (!user.emailVerified) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'FAILED_LOGIN',
        details: { message: 'Login blocked: email address not verified.' },
        ...meta,
      });
      res.status(403).json({
        emailNotVerified: true,
        message: 'Your email address has not been verified. Please check your inbox or request a new verification email.',
      });
      return;
    }

    // GATE 2: MFA required for SystemAdmin and Manager roles
    const mfaRequiredRoles = ['SystemAdmin', 'Manager'];
    const shouldEnforceMfa = env.NODE_ENV === 'production' || env.NODE_ENV === 'test' || !env.BYPASS_MFA;
    if (shouldEnforceMfa && mfaRequiredRoles.includes(user.role) && !user.mfaEnabled) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'FAILED_LOGIN',
        details: { message: `Login blocked: MFA setup required for role ${user.role}.` },
        ...meta,
      });
      const tempToken = jwt.sign(
        { userId: user.id, purpose: 'mfa_setup' },
        env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      res.status(403).json({
        mfaSetupRequired: true,
        tempToken,
        message: 'Multi-factor authentication is required before login.',
      });
      return;
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      // Generate short-lived temp token (5 minutes) for MFA page authorization
      const tempToken = jwt.sign(
        { userId: user.id, purpose: 'mfa_verification' },
        env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      res.status(200).json({
        mfaRequired: true,
        tempToken,
      });
      return;
    }

    // Create session and return tokens
    const { accessToken, refreshToken } = await createTokensAndSession(user.id, user.role, req);

    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      details: { mfaUsed: false },
      ...meta,
    });

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Verify MFA during Login
 */
export async function verifyMfaLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tempToken, code } = req.body;
    const meta = extractReqMeta(req);

    // Verify temp token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, env.JWT_SECRET);
      if (decoded.purpose !== 'mfa_verification') {
        throw new Error();
      }
    } catch {
      throw new AppError('Invalid or expired temporary authentication token.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new AppError('MFA verification is not configured for this user.', 400);
    }

    // Check TOTP code or backup code
    let isCodeValid = verifyMfaToken(code, user.mfaSecret);
    let isBackupUsed = false;

    if (!isCodeValid && user.backupCodes) {
      // Check backup codes
      const backupCodesList = user.backupCodes as string[];
      const { isValid, updatedHashedCodes } = await verifyAndConsumeBackupCode(code, backupCodesList);
      
      if (isValid && updatedHashedCodes) {
        isCodeValid = true;
        isBackupUsed = true;
        
        // Update user backup codes list
        await prisma.user.update({
          where: { id: user.id },
          data: { backupCodes: updatedHashedCodes },
        });
      }
    }

    if (!isCodeValid) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'MFA_FAILURE',
        details: { message: 'Incorrect MFA token submitted.' },
        ...meta,
      });
      throw new AppError('Invalid MFA code.', 401);
    }

    // Login successful
    const { accessToken, refreshToken } = await createTokensAndSession(user.id, user.role, req);

    await logSecurityEvent({
      userId: user.id,
      eventType: 'MFA_SUCCESS',
      details: { backupUsed: isBackupUsed },
      ...meta,
    });

    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      details: { mfaUsed: true, backupUsed: isBackupUsed },
      ...meta,
    });

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Initialize MFA Setup (Generate secret & QR)
 */
export async function setupMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Generate secret and qr
    const { secret, otpauthUrl } = generateMfaSecret(user.email);
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

    // Save secret (but keep mfaEnabled false until verified)
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: secret, mfaEnabled: false },
    });

    await logSecurityEvent({
      userId: user.id,
      eventType: 'MFA_SETUP_STARTED',
      details: { message: 'User initiated MFA setup.' },
      ...meta,
    });

    await logAudit({
      userId: user.id,
      action: 'MFA_SETUP_INIT',
      ...meta,
    });

    res.status(200).json({
      secret,
      qrCodeDataUrl,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Enable MFA (Verify code, create backup codes, activate)
 */
export async function enableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code } = req.body;
    const userContext = req.user!;
    const meta = extractReqMeta(req);

    const dbUser = await prisma.user.findUnique({
      where: { id: userContext.id },
    });

    if (!dbUser || !dbUser.mfaSecret) {
      throw new AppError('MFA setup was not initialized.', 400);
    }

    // Verify TOTP code
    const isCodeValid = verifyMfaToken(code, dbUser.mfaSecret);
    if (!isCodeValid) {
      await logSecurityEvent({
        userId: dbUser.id,
        eventType: 'MFA_SETUP_FAILED',
        details: { message: 'MFA verification failed during enable step.' },
        ...meta,
      });
      throw new AppError('Invalid MFA code. Verification failed.', 400);
    }

    // Generate Backup Codes
    const { rawCodes, hashedCodes } = await generateBackupCodes();

    // Enable MFA
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        mfaEnabled: true,
        backupCodes: hashedCodes,
      },
    });

    await logSecurityEvent({
      userId: dbUser.id,
      eventType: 'MFA_ENABLED',
      details: { message: 'MFA fully enabled for user.' },
      ...meta,
    });

    await logAudit({
      userId: dbUser.id,
      action: 'MFA_ENABLE',
      ...meta,
    });

    res.status(200).json({
      message: 'MFA enabled successfully.',
      backupCodes: rawCodes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Refresh Token Rotation
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const meta = extractReqMeta(req);

    if (!refreshToken) {
      throw new AppError('Refresh token is required.', 400);
    }

    const tokenHash = hashToken(refreshToken);

    // Locate active refresh token
    const dbToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // REUSE DETECTION: If token not found in active tokens list, check if it was revoked / reused
    if (!dbToken) {
      // Find if this token hash was already parent token of some other token (which indicates rotation occurred, but client is resending it)
      const reusedTokenFamily = await prisma.refreshToken.findFirst({
        where: { parentTokenHash: tokenHash },
      });

      if (reusedTokenFamily) {
        // Attack detected! Revoke all tokens in family
        await prisma.refreshToken.updateMany({
          where: { userId: reusedTokenFamily.userId },
          data: { isRevoked: true },
        });

        // Delete active sessions
        await prisma.userSession.deleteMany({
          where: { userId: reusedTokenFamily.userId },
        });

        await logSecurityEvent({
          userId: reusedTokenFamily.userId,
          eventType: 'REFRESH_TOKEN_REUSE',
          details: { message: 'Refresh token reuse detected. Revoking entire token family.' },
          ...meta,
        });
      }

      throw new AppError('Invalid refresh token.', 401);
    }

    // Validate expiration
    if (dbToken.isRevoked || dbToken.expiresAt < new Date()) {
      // Revoke family
      await prisma.refreshToken.updateMany({
        where: { userId: dbToken.userId },
        data: { isRevoked: true },
      });
      throw new AppError('Refresh token has expired or is invalid.', 401);
    }

    // Rotate tokens (Invalidate current, generate new)
    await prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { isRevoked: true },
    });

    const newAccessToken = signAccessToken({ userId: dbToken.userId, role: dbToken.user.role });
    const newRawRefreshToken = generateRandomToken();
    const newHash = hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Save rotated refresh token pointing to current token
    const rotatedToken = await prisma.refreshToken.create({
      data: {
        tokenHash: newHash,
        userId: dbToken.userId,
        parentTokenHash: tokenHash,
        expiresAt,
      },
    });

    // Update session link
    await prisma.userSession.updateMany({
      where: { refreshTokenId: dbToken.id },
      data: { 
        refreshTokenId: rotatedToken.id,
        lastSeenAt: new Date(),
      },
    });

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Logout User
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const meta = extractReqMeta(req);

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      const dbToken = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (dbToken) {
        // Delete refresh token and session
        await prisma.refreshToken.delete({
          where: { id: dbToken.id },
        });

        await logSecurityEvent({
          userId: dbToken.userId,
          eventType: 'SESSION_REVOCATION',
          details: { message: 'User logged out and session revoked.' },
          ...meta,
        });

        await logAudit({
          userId: dbToken.userId,
          action: 'LOGOUT',
          ...meta,
        });
      }
    }

    res.status(200).json({
      message: 'Successfully logged out.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Change Password (Requires Password Reset rules)
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    const userContext = req.user!;
    const meta = extractReqMeta(req);

    const user = await prisma.user.findUnique({
      where: { id: userContext.id },
    });

    if (!user) {
      throw new AppError('User not found.', 401);
    }

    // Verify current password
    if (!user.passwordHash) {
      throw new AppError('This account does not have a password configured.', 400);
    }
    const isPassValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isPassValid) {
      throw new AppError('Incorrect current password.', 400);
    }

    // Hash and update new password
    const newHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    await logSecurityEvent({
      userId: user.id,
      eventType: 'PASSWORD_RESET',
      details: { message: 'Password updated successfully.' },
      ...meta,
    });

    await logAudit({
      userId: user.id,
      action: 'PASSWORD_CHANGE',
      ...meta,
    });

    res.status(200).json({
      message: 'Password changed successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Request Password Reset
 */
export async function requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    const meta = extractReqMeta(req);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Generate secure token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      
      // Token expires in 1 hour
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: tokenHash,
          resetTokenExpires,
        },
      });

      // Send email
      await sendPasswordResetEmail(user.email, rawToken);

      await logSecurityEvent({
        userId: user.id,
        eventType: 'PASSWORD_RESET',
        details: { message: 'Password reset flow initiated.' },
        ...meta,
      });

      await logAudit({
        userId: user.id,
        action: 'PASSWORD_RESET_REQUEST',
        ...meta,
      });
    } else {
      // Timing attack counter-measure
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Return generic success to prevent email enumeration
    res.status(200).json({
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Confirm Password Reset
 */
export async function confirmPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    const meta = extractReqMeta(req);
    const tokenHash = hashToken(token);

    // Find valid token user
    const user = await prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetTokenExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired password reset token.', 400);
    }

    // Hash password and reset lockout limits
    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await logSecurityEvent({
      userId: user.id,
      eventType: 'PASSWORD_RESET',
      details: { message: 'Password reset completed successfully.' },
      ...meta,
    });

    await logAudit({
      userId: user.id,
      action: 'PASSWORD_RESET_CONFIRM',
      ...meta,
    });

    res.status(200).json({
      message: 'Your password has been successfully reset.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Request Email Verification Link
 */
export async function requestEmailVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userContext = req.user!;
    const meta = extractReqMeta(req);

    const user = await prisma.user.findUnique({
      where: { id: userContext.id },
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    if (user.emailVerified) {
      throw new AppError('Email address is already verified.', 400);
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: tokenHash,
      },
    });

    await sendVerificationEmail(user.email, rawToken);

    await logAudit({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_REQUEST',
      ...meta,
    });

    res.status(200).json({
      message: 'Verification email has been sent.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Confirm Email Verification
 */
export async function confirmEmailVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    const meta = extractReqMeta(req);
    const tokenHash = hashToken(token);

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: tokenHash,
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired email verification token.', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_CONFIRM',
      ...meta,
    });

    res.status(200).json({
      message: 'Your email has been successfully verified.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Public Resend Email Verification
 * POST /auth/email-verification/resend
 * Rate-limited. Accepts email only. Always returns generic success to prevent enumeration.
 */
export async function resendVerificationEmailPublic(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    const meta = extractReqMeta(req);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Generic response prevents email enumeration
    const genericResponse = {
      message: 'If an account exists with that email and is not yet verified, a new verification email has been sent.',
    };

    if (!user || user.emailVerified) {
      // Timing attack countermeasure — consistent delay
      await new Promise((resolve) => setTimeout(resolve, 250));
      res.status(200).json(genericResponse);
      return;
    }

    // Generate a fresh verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: tokenHash },
    });

    await sendVerificationEmail(user.email, rawToken);

    await logAudit({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_RESEND',
      details: { source: 'public_resend' },
      ...meta,
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
}

/**
 * Endpoint: Activate Client User via setupToken
 * POST /auth/activate-client
 */
export async function activateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    const meta = extractReqMeta(req);

    if (!token || !password) {
      throw new AppError('Token and password are required.', 400);
    }

    // Find valid setupToken user
    const user = await prisma.user.findFirst({
      where: {
        setupToken: token,
        role: Role.Client,
        status: 'Pending Activation',
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired setup token.', 400);
    }

    // Hash password and set status to Active
    const passwordHash = await hashPassword(password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        setupToken: null,
        status: 'Active',
        mustChangePassword: false,
        emailVerified: true,
      },
    });

    await logSecurityEvent({
      userId: user.id,
      eventType: 'PASSWORD_RESET',
      details: { message: 'Client account activated successfully.' },
      ...meta,
    });

    await logAudit({
      userId: user.id,
      action: 'CLIENT_ACTIVATE',
      ...meta,
    });

    res.status(200).json({
      message: 'Your account has been successfully activated.',
    });
  } catch (error) {
    next(error);
  }
}

