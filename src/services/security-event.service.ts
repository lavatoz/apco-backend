import { prisma } from '../config/database';

interface SecurityEventParams {
  userId?: string | null;
  eventType: 'FAILED_LOGIN' | 'ACCOUNT_LOCK' | 'ACCOUNT_LOCKED' | 'PASSWORD_RESET' | 'MFA_FAILURE' | 'MFA_SUCCESS' | 'REFRESH_TOKEN_REUSE' | 'SUSPICIOUS_ACCESS' | 'SESSION_REVOCATION' | 'MFA_SETUP_STARTED' | 'MFA_ENABLED' | 'MFA_SETUP_FAILED' | 'MFA_SETUP_TOKEN_EXPIRED';
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Log action to SecurityEvent table
 */
export async function logSecurityEvent(params: SecurityEventParams): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId: params.userId || null,
        eventType: params.eventType,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        requestId: params.requestId || null,
      },
    });
  } catch (error) {
    console.error('❌ Failed to write security event log:', error);
  }
}
