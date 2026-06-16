import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { AppError } from './error';
import jwt from 'jsonwebtoken';
import { logSecurityEvent } from '../services/security-event.service';
import { extractReqMeta } from '../services/audit.service';

// Extend Express Request interface to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: Role;
        mfaEnabled: boolean;
        emailVerified: boolean;
        mustChangePassword: boolean;
        linkedClientId?: string | null;
      };
    }
  }
}

/**
 * Middleware to authenticate requests using JWT Access Token
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication credentials were not provided.', 401);
    }

    const token = authHeader.split(' ')[1];
    let payload;
    
    try {
      payload = verifyAccessToken(token);
    } catch (error: any) {
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.purpose === 'mfa_setup' && error.name === 'TokenExpiredError') {
          const meta = extractReqMeta(req);
          await logSecurityEvent({
            userId: decoded.userId,
            eventType: 'MFA_SETUP_TOKEN_EXPIRED',
            details: { message: 'MFA setup temporary token expired.' },
            ...meta,
          });
        }
      } catch (decodeErr) {
        // ignore decode errors
      }
      throw new AppError('Invalid or expired access token.', 401);
    }

    // Check if the token is a temporary setup token
    if (payload && (payload as any).purpose === 'mfa_setup') {
      const allowedPaths = ['/auth/mfa/setup', '/auth/mfa/enable', '/mfa/setup', '/mfa/enable'];
      const isAllowed = allowedPaths.some(p => req.originalUrl.endsWith(p) || req.path.endsWith(p));
      if (!isAllowed) {
        throw new AppError('Access Denied: Complete multi-factor authentication setup first.', 403);
      }
    }

    // Verify user exists and is not locked
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mfaEnabled: true,
        emailVerified: true,
        mustChangePassword: true,
        lockedUntil: true,
        linkedClientId: true,
      },
    });

    if (!user) {
      throw new AppError('User account not found.', 401);
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('This account is temporarily locked due to multiple failed login attempts.', 403);
    }

    // Bind user context
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      linkedClientId: user.linkedClientId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to restrict route to a specific role
 */
export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication is required.', 401));
    }
    if (req.user.role !== role) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }
    next();
  };
}

/**
 * Middleware to restrict route to any of the specified roles
 */
export function requireAnyRole(roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication is required.', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }
    next();
  };
}
