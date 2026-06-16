import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';

/**
 * Get project timeline (workflow events) with access verification
 */
export async function getProjectTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;
    const user = req.user!;

    // Fetch project with Client & Staff Assignments to verify access permission
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        client: true,
        staffAssignments: true,
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Access control check:
    if (user.role === Role.Client) {
      if (project.client.email !== user.email) {
        throw new AppError('Access denied. This project is not associated with your account.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      const isAssigned = project.staffAssignments.some((a) => a.userId === user.id);
      if (!isAssigned) {
        throw new AppError('Access denied. You are not assigned to this project.', 403);
      }
    }

    // Fetch timeline events
    const events = await prisma.workflowEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
}
