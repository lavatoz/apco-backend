import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { NotificationService } from '../../services/notification.service';

/**
 * Get approval requests with client filtering
 */
export async function getApprovals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    let approvals;

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      approvals = await prisma.approval.findMany({
        where: { clientName: client.name },
        orderBy: { submissionDate: 'desc' },
      });
    } else {
      // Staff / Managers / Admins see all approvals
      approvals = await prisma.approval.findMany({
        orderBy: { submissionDate: 'desc' },
      });
    }

    res.status(200).json(approvals);
  } catch (error) {
    next(error);
  }
}

/**
 * Create approval request
 */
export async function createApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    const approval = await prisma.approval.create({
      data: {
        type: body.type,
        targetId: body.targetId,
        targetType: body.targetType,
        clientName: body.clientName,
        brandName: body.brandName || null,
        amount: body.amount,
        status: 'Pending Approval',
        notes: body.notes || null,
        metadata: body.metadata || null,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'APPROVAL_SUBMIT',
      details: { approvalId: approval.id, targetId: approval.targetId, type: approval.type },
      ...meta,
    });

    try {
      await NotificationService.emitToRole(Role.SystemAdmin, {
        title: 'New Approval Submission',
        message: `A new approval request has been submitted for ${approval.clientName} (Amount: $${approval.amount}).`
      });
      await NotificationService.emitToRole(Role.Manager, {
        title: 'New Approval Submission',
        message: `A new approval request has been submitted for ${approval.clientName} (Amount: $${approval.amount}).`
      });
    } catch (err) {
      console.error('Failed to notify staff about new approval request:', err);
    }

    res.status(201).json(approval);
  } catch (error) {
    next(error);
  }
}

/**
 * Verify approval request (Approve/Reject)
 */
export async function verifyApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { status, notes } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can verify approvals.', 403);
    }

    if (status !== 'Approved' && status !== 'Rejected') {
      throw new AppError('Invalid verification status.', 400);
    }

    const existingApproval = await prisma.approval.findUnique({
      where: { id },
    });

    if (!existingApproval) {
      throw new AppError('Approval record not found.', 404);
    }

    // Process status update and target state transition in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.approval.update({
        where: { id },
        data: {
          status,
          notes: notes !== undefined ? notes : existingApproval.notes,
          approvedBy: status === 'Approved' ? `${user.firstName} ${user.lastName}` : null,
          approvedDate: status === 'Approved' ? new Date() : null,
          rejectedBy: status === 'Rejected' ? `${user.firstName} ${user.lastName}` : null,
          rejectedDate: status === 'Rejected' ? new Date() : null,
        },
      });

      // Cascade state changes to corresponding business documents if Approved
      if (status === 'Approved') {
        if (existingApproval.targetType === 'invoice') {
          await tx.invoice.update({
            where: { id: existingApproval.targetId },
            data: { status: 'Paid' },
          });
        } else if (existingApproval.targetType === 'quotation') {
          await tx.quotation.update({
            where: { id: existingApproval.targetId },
            data: { status: 'Approved' },
          });
        } else if (existingApproval.targetType === 'expense') {
          // If expense model status exists, update it. For now expense has no status field.
        }
      }

      return updated;
    });

    await logAudit({
      userId: user.id,
      action: status === 'Approved' ? 'APPROVAL_APPROVE' : 'APPROVAL_REJECT',
      details: { approvalId: id, targetId: existingApproval.targetId, status },
      ...meta,
    });

    try {
      const client = await prisma.client.findFirst({
        where: { name: existingApproval.clientName, deletedAt: null }
      });
      if (client) {
        const clientUser = await prisma.user.findFirst({
          where: { email: client.email }
        });
        if (clientUser) {
          await NotificationService.emitNotification(clientUser.id, {
            title: `Approval Decision: ${status}`,
            message: `Your request for ${existingApproval.type} has been ${status.toLowerCase()} by the production team.`,
          });
        }
      }
    } catch (err) {
      console.error('Failed to notify client about approval decision:', err);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete approval request
 */
export async function deleteApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete approvals.', 403);
    }

    const existing = await prisma.approval.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Approval record not found.', 404);
    }

    await prisma.approval.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'APPROVAL_DELETE',
      details: { approvalId: id },
      ...meta,
    });

    res.status(200).json({ message: 'Approval request removed successfully.' });
  } catch (error) {
    next(error);
  }
}
