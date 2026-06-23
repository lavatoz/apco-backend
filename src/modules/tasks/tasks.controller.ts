import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { NotificationService } from '../../services/notification.service';

/**
 * Get tasks with role-based visibility rules
 */
export async function getTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    let tasks;

    if (user.role === Role.Client) {
      // Find client profile mapped to email
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      tasks = await prisma.task.findMany({
        where: { clientId: client.id },
        include: { 
          event: true,
          client: true,
          project: {
            include: {
              staffAssignments: true
            }
          }
        },
        orderBy: { dueDate: 'asc' },
      });
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      // Staff roles: See tasks assigned to them, or tasks for projects they are assigned to
      const assignments = await prisma.staffAssignment.findMany({
        where: { userId: user.id },
      });
      const projectIds = assignments.map((a) => a.projectId);

      tasks = await prisma.task.findMany({
        where: {
          OR: [
            { assignedUserId: user.id },
            { projectId: { in: projectIds } },
          ],
        },
        include: { 
          event: true,
          client: true,
          project: {
            include: {
              staffAssignments: true
            }
          }
        },
        orderBy: { dueDate: 'asc' },
      });
    } else {
      // Admin/Manager: Full access
      tasks = await prisma.task.findMany({
        include: { 
          event: true,
          client: true,
          project: {
            include: {
              staffAssignments: true
            }
          }
        },
        orderBy: { dueDate: 'asc' },
      });
    }

    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
}

/**
 * Get task by ID
 */
export async function getTaskById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    // Role check
    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client || task.clientId !== client.id) {
        throw new AppError('Access denied.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      const assignment = await prisma.staffAssignment.findFirst({
        where: { userId: user.id, projectId: task.projectId || undefined },
      });
      if (!assignment && task.assignedUserId !== user.id) {
        throw new AppError('Access denied.', 403);
      }
    }

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new task manually
 */
export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create tasks manually.', 403);
    }

    let assignedUserId = body.assignedUserId || null;
    let assignee = body.assignee || 'Unassigned';

    if (body.projectId && body.eventId && !assignedUserId) {
      const assignment = await prisma.staffAssignment.findFirst({
        where: {
          projectId: body.projectId,
          eventIds: { has: body.eventId },
        },
        include: { user: true },
      });
      if (assignment) {
        assignedUserId = assignment.userId;
        assignee = `${assignment.user.firstName} ${assignment.user.lastName}`.trim();
      }
    }

    if (assignedUserId && (!assignee || assignee === 'Unassigned')) {
      const u = await prisma.user.findUnique({
        where: { id: assignedUserId },
      });
      if (u) {
        assignee = `${u.firstName} ${u.lastName}`.trim();
      }
    }

    const task = await prisma.task.create({
      data: {
        title: body.title,
        assignee,
        dueDate: new Date(body.dueDate),
        status: body.status || 'Pending',
        brand: body.brand,
        priority: body.priority || 'High',
        clientId: body.clientId || null,
        projectId: body.projectId || null,
        assignedUserId,
        eventId: body.eventId || null,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'TASK_CREATE',
      details: { taskId: task.id, title: task.title },
      ...meta,
    });

    if (task.assignedUserId) {
      try {
        await NotificationService.emitNotification(task.assignedUserId, {
          title: 'New Task Assigned',
          message: `You have been assigned a new task: "${task.title}". Due: ${new Date(task.dueDate).toLocaleDateString()}.`,
        });
      } catch (err) {
        console.error('Failed to send task assignment notification:', err);
      }
    }

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
}

/**
 * Update a task
 */
export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    // Role validation
    const isAdminOrManager = user.role === Role.SystemAdmin || user.role === Role.Manager;
    const isAssigned = task.assignedUserId === user.id;
    let isProjectStaff = false;

    if (!isAdminOrManager && !isAssigned && task.projectId) {
      const assignment = await prisma.staffAssignment.findFirst({
        where: {
          userId: user.id,
          projectId: task.projectId,
        },
      });
      if (assignment) {
        isProjectStaff = true;
      }
    }

    if (!isAdminOrManager && !isAssigned && !isProjectStaff) {
      throw new AppError('You do not have permission to modify this task.', 403);
    }

    // Prepare update data: Staff can only update status
    let updateData: any = {};
    if (isAdminOrManager) {
      let assignedUserId = body.assignedUserId !== undefined ? body.assignedUserId : task.assignedUserId;
      let assignee = body.assignee !== undefined ? body.assignee : task.assignee;
      const projectId = body.projectId !== undefined ? body.projectId : task.projectId;
      const eventId = body.eventId !== undefined ? body.eventId : task.eventId;

      if (projectId && eventId && !assignedUserId) {
        const assignment = await prisma.staffAssignment.findFirst({
          where: {
            projectId,
            eventIds: { has: eventId },
          },
          include: { user: true },
        });
        if (assignment) {
          assignedUserId = assignment.userId;
          assignee = `${assignment.user.firstName} ${assignment.user.lastName}`.trim();
        }
      }

      if (assignedUserId && (!assignee || assignee === 'Unassigned')) {
        const u = await prisma.user.findUnique({
          where: { id: assignedUserId },
        });
        if (u) {
          assignee = `${u.firstName} ${u.lastName}`.trim();
        }
      }

      updateData = {
        title: body.title !== undefined ? body.title : task.title,
        assignee,
        dueDate: body.dueDate !== undefined ? new Date(body.dueDate) : task.dueDate,
        status: body.status !== undefined ? body.status : task.status,
        brand: body.brand !== undefined ? body.brand : task.brand,
        priority: body.priority !== undefined ? body.priority : task.priority,
        clientId: body.clientId !== undefined ? body.clientId : task.clientId,
        projectId,
        assignedUserId,
        eventId,
      };
    } else {
      updateData = {
        status: body.status !== undefined ? body.status : task.status,
      };
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: user.id,
      action: 'TASK_UPDATE',
      details: { taskId: id, status: updatedTask.status },
      ...meta,
    });

    if (updatedTask.assignedUserId && updatedTask.assignedUserId !== task.assignedUserId) {
      try {
        await NotificationService.emitNotification(updatedTask.assignedUserId, {
          title: 'Task Assigned to You',
          message: `You have been assigned to the task: "${updatedTask.title}".`,
        });
      } catch (err) {
        console.error('Failed to send task assignment notification:', err);
      }
    }

    res.status(200).json(updatedTask);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a task
 */
export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can purge tasks.', 403);
    }

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      throw new AppError('Task not found.', 404);
    }

    await prisma.task.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'TASK_DELETE',
      details: { taskId: id, title: task.title },
      ...meta,
    });

    res.status(200).json({ message: 'Task deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
