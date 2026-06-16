import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { createNotification } from '../../services/notification.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { createProjectFolderStructure } from '../../services/google-drive.service';

/**
 * List projects with strict query-level leakage protection
 */
export async function getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    let whereClause: any = { deletedAt: null };

    // Query-level RBAC check:
    if (user.role === Role.Client) {
      let clientId = user.linkedClientId;

      if (!clientId) {
        // Fallback to email lookup if linkedClientId is missing
        const client = await prisma.client.findFirst({
          where: { email: user.email, deletedAt: null },
        });
        if (client) {
          clientId = client.id;
        }
      }

      if (!clientId) {
        // Client record doesn't exist yet, return empty list
        res.status(200).json([]);
        return;
      }
      whereClause.clientId = clientId;
    } else if (
      user.role !== Role.SystemAdmin && 
      user.role !== Role.Manager
    ) {
      // Other staff (Photographer, Editor, Assistant, etc.) only see projects they are assigned to
      whereClause.staffAssignments = {
        some: { userId: user.id },
      };
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        client: {
          select: { id: true, name: true, email: true, companyName: true },
        },
        staffAssignments: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(projects);
  } catch (error) {
    next(error);
  }
}

/**
 * Get single project with RBAC access check
 */
export async function getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        client: true,
        staffAssignments: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Access check:
    if (user.role === Role.Client) {
      if (project.client.email !== user.email) {
        throw new AppError('Access denied to this project profile.', 403);
      }
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      const isAssigned = project.staffAssignments.some((a) => a.userId === user.id);
      if (!isAssigned) {
        throw new AppError('You are not assigned to this project.', 403);
      }
    }

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new project
 */
export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { name, description, status, clientId } = req.body;
    const meta = extractReqMeta(req);

    // Mutation restricted to Admin / Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can initialize projects.', 403);
    }

    // Verify client exists
    const client = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
    });
    if (!client) {
      throw new AppError('Client record not found.', 400);
    }

    // Auto-provision Google Drive folder structures
    let folderStructure: any = {};
    try {
      folderStructure = await createProjectFolderStructure(client.name, name);
    } catch (driveError) {
      console.error('Google Drive folder structure provisioning failed:', driveError);
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        status,
        clientId,
        driveFolderId: folderStructure.driveFolderId || null,
        galleryFolderId: folderStructure.galleryFolderId || null,
        deliverablesFolderId: folderStructure.deliverablesFolderId || null,
        agreementsFolderId: folderStructure.agreementsFolderId || null,
        invoicesFolderId: folderStructure.invoicesFolderId || null,
        quotationsFolderId: folderStructure.quotationsFolderId || null,
      },
    });

    // Automatically generate workflow events for project creation
    await logWorkflowEvent({
      projectId: project.id,
      eventType: 'PROJECT_CREATED',
      description: `Project "${name}" was created successfully.`,
      payload: { name, clientId },
    });

    if (folderStructure.driveFolderId) {
      await logWorkflowEvent({
        projectId: project.id,
        eventType: 'PROJECT_STORAGE_INITIALIZED',
        description: `Google Drive storage initialized for project "${name}".`,
        payload: folderStructure,
      });
    }

    await logAudit({
      userId: user.id,
      action: 'PROJECT_CREATE',
      details: { projectId: project.id, name },
      ...meta,
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
}

/**
 * Update project details (Enforces milestone timeline updates)
 */
export async function updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    // Admin/Manager only
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify project configurations.', 403);
    }

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    const updated = await prisma.project.update({
      where: { id },
      data: body,
    });

    // Check status change milestones to log workflow events
    if (body.status && body.status !== project.status) {
      const isCompleted = body.status.toLowerCase() === 'completed';
      
      await logWorkflowEvent({
        projectId: id,
        eventType: isCompleted ? 'PROJECT_COMPLETED' : 'MILESTONE_UPDATED',
        description: `Project status transitioned from "${project.status}" to "${body.status}".`,
        payload: { previousStatus: project.status, newStatus: body.status },
      });

      // Send alert notification to client
      const client = await prisma.client.findUnique({
        where: { id: project.clientId },
      });
      if (client) {
        const clientUser = await prisma.user.findUnique({
          where: { email: client.email },
        });
        if (clientUser) {
          await createNotification(
            clientUser.id,
            `Project Progress Alert`,
            `Your project "${project.name}" has transitioned to status: ${body.status}.`
          );
        }
      }
    }

    await logAudit({
      userId: user.id,
      action: 'PROJECT_UPDATE',
      details: { projectId: id, fieldsUpdated: Object.keys(body) },
      ...meta,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Assign staff member to a project
 */
export async function assignStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { userId, role } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can assign staff.', 403);
    }

    // Check project exists
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!targetUser) {
      throw new AppError('Target user not found.', 404);
    }

    // Check duplicate assignment
    const existing = await prisma.staffAssignment.findFirst({
      where: { projectId, userId },
    });
    if (existing) {
      throw new AppError('User is already assigned to this project.', 400);
    }

    const assignment = await prisma.staffAssignment.create({
      data: {
        projectId,
        userId,
        role,
      },
    });

    // Notify staff member
    await createNotification(
      userId,
      'New Project Assignment',
      `You have been assigned as a ${role} on the project "${project.name}".`
    );

    // Automatically generate workflow events for staff assignments
    await logWorkflowEvent({
      projectId,
      eventType: 'STAFF_ASSIGNED',
      description: `Staff member was assigned to the project as a ${role}.`,
      payload: { staffAssignmentId: assignment.id, userId, role },
    });

    await logAudit({
      userId: user.id,
      action: 'PROJECT_ASSIGN_STAFF',
      details: { projectId, staffUserId: userId, assignmentRole: role },
      ...meta,
    });

    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
}

/**
 * Remove staff assignment
 */
export async function removeStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { userId } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can remove staff assignments.', 403);
    }

    const assignment = await prisma.staffAssignment.findFirst({
      where: { projectId, userId },
    });

    if (!assignment) {
      throw new AppError('Staff assignment not found.', 404);
    }

    await prisma.staffAssignment.delete({
      where: { id: assignment.id },
    });

    // Automatically generate workflow events for staff removal
    await logWorkflowEvent({
      projectId,
      eventType: 'STAFF_REMOVED',
      description: 'Staff member was removed from the project.',
      payload: { staffUserId: userId },
    });

    await logAudit({
      userId: user.id,
      action: 'PROJECT_REMOVE_STAFF',
      details: { projectId, staffUserId: userId },
      ...meta,
    });

    res.status(200).json({ message: 'Staff assignment removed successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Soft delete project
 */
export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete projects.', 403);
    }

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: user.id,
      action: 'PROJECT_DELETE',
      details: { projectId: id, name: project.name },
      ...meta,
    });

    res.status(200).json({ message: 'Project soft-deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Update project workflow stage and auto-provision tasks & logs in a transaction
 */
export async function updateProjectStage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { stage, reason } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can progress workflow stages.', 403);
    }

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { client: true },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Define standard tasks to generate based on the new stage
    const taskBlueprints: { title: string; priority: string }[] = [];
    if (stage === 'Team Assigned') {
      taskBlueprints.push({ title: 'Confirm Shoot Schedule', priority: 'High' });
    } else if (stage === 'Shoot Completed') {
      taskBlueprints.push({ title: 'Collect Media', priority: 'High' });
    } else if (stage === 'Selection Received') {
      taskBlueprints.push({ title: 'Start Editing', priority: 'High' });
    } else if (stage === 'Editing') {
      taskBlueprints.push({ title: 'Prepare Deliverables', priority: 'Medium' });
    } else if (stage === 'Delivery Ready') {
      taskBlueprints.push({ title: 'Send Delivery Notification', priority: 'High' });
    }

    // Run stage update, workflow log, and task creations inside a single Prisma Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update project stage
      const updatedProject = await tx.project.update({
        where: { id },
        data: { stage },
      });

      // 2. Log workflow event (timeline)
      const eventDescription = `Project stage advanced to "${stage}". Reason: ${reason || 'N/A'}`;
      const workflowEvent = await tx.workflowEvent.create({
        data: {
          projectId: id,
          eventType: 'STAGE_ADVANCED',
          description: eventDescription,
          payload: { previousStage: project.stage, newStage: stage, reason },
        },
      });

      // 3. Create automatic tasks
      const createdTasks = [];
      const brandName = project.client.companyName || 'Artisans';
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Due 7 days from now

      for (const bp of taskBlueprints) {
        const t = await tx.task.create({
          data: {
            title: `${bp.title} (${project.name})`,
            assignee: 'Unassigned',
            dueDate,
            status: 'Pending',
            brand: brandName,
            priority: bp.priority,
            clientId: project.clientId,
            projectId: project.id,
          },
        });
        createdTasks.push(t);
      }

      return { updatedProject, workflowEvent, createdTasks };
    });

    // Notify client if client user exists
    const clientUser = await prisma.user.findUnique({
      where: { email: project.client.email },
    });
    if (clientUser) {
      await createNotification(
        clientUser.id,
        `Stage Advanced: ${stage}`,
        `Your project "${project.name}" has transitioned to stage: ${stage}.`
      );
    }

    await logAudit({
      userId: user.id,
      action: 'PROJECT_STAGE_UPDATE',
      details: { projectId: id, previousStage: project.stage, newStage: stage, reason },
      ...meta,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

