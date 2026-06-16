import { prisma } from '../config/database';

interface AuditLogParams {
  userId?: string | null;
  action: string;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Log action to AuditLog table
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        requestId: params.requestId || null,
      },
    });
  } catch (error) {
    console.error('❌ Failed to write audit log:', error);
  }
}

/**
 * Extracts audit parameters from an Express request object
 */
export function extractReqMeta(req: any) {
  return {
    ipAddress: req?.ip || req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || null,
    userAgent: req?.headers['user-agent'] || null,
    requestId: req?.headers['x-request-id'] || req?.requestId || null,
  };
}
