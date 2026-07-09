import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { logWorkflowEvent } from '../../services/workflow.service';
import { createNotification } from '../../services/notification.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { ProjectsService } from './projects.service';

/**
 * Synchronize task assignments for a project.
 */
export async function syncTasksForProject(projectId: string, tx: any): Promise<void> {
  const tasks = await tx.task.findMany({
    where: { projectId },
  });
  const assignments = await tx.staffAssignment.findMany({
    where: { projectId },
    include: { user: true },
  });

  const operationalRoles = ['Photographer', 'Videographer', 'DroneOperator', 'Assistant'];

  for (const task of tasks) {
    if (task.eventId) {
      // Check if the current assignee is still valid for this event
      let currentAssigneeValid = false;
      if (task.assignedUserId) {
        const currentAssigneeAssignment = assignments.find(
          (a: any) => a.userId === task.assignedUserId && a.eventIds.includes(task.eventId)
        );
        if (currentAssigneeAssignment && operationalRoles.includes(currentAssigneeAssignment.role)) {
          currentAssigneeValid = true;
        }
      }

      if (!currentAssigneeValid) {
        // Find a new staff assignment for this event
        const matched = assignments.find(
          (a: any) => a.eventIds.includes(task.eventId) && operationalRoles.includes(a.role)
        );

        if (matched) {
          let name = 'Unassigned';
          if (matched.user) {
            name = `${matched.user.firstName} ${matched.user.lastName}`.trim();
          } else {
            try {
              const u = await tx.user.findUnique({ where: { id: matched.userId } });
              if (u) {
                name = `${u.firstName} ${u.lastName}`.trim();
              }
            } catch (err) {
              // ignore lookup errors in testing
            }
          }
          await tx.task.update({
            where: { id: task.id },
            data: {
              assignedUserId: matched.userId,
              assignee: name || 'Unassigned',
            },
          });
        } else {
          await tx.task.update({
            where: { id: task.id },
            data: {
              assignedUserId: null,
              assignee: 'Unassigned',
            },
          });
        }
      }
    } else {
      // Task does not have an eventId (project-level task)
      if (task.assignedUserId) {
        const isStillAssigned = assignments.some((a: any) => a.userId === task.assignedUserId);
        if (!isStillAssigned) {
          let nextAssigneeId: string | null = null;
          let nextAssigneeName = 'Unassigned';

          let matched: any = null;
          if (task.title.includes('Confirm Shoot Schedule') || task.title.includes('Collect Media')) {
            matched = assignments.find(
              (a: any) => a.role === 'Photographer' || a.role === 'Videographer' || a.role === 'DroneOperator'
            );
          } else if (task.title.includes('Start Editing') || task.title.includes('Prepare Deliverables')) {
            matched = assignments.find((a: any) => a.role === 'Editor');
          }

          if (!matched && assignments.length > 0) {
            matched = assignments[0];
          }

          if (matched) {
            nextAssigneeId = matched.userId;
            if (matched.user) {
              nextAssigneeName = `${matched.user.firstName} ${matched.user.lastName}`.trim();
            } else {
              try {
                const u = await tx.user.findUnique({ where: { id: matched.userId } });
                if (u) {
                  nextAssigneeName = `${u.firstName} ${u.lastName}`.trim();
                }
              } catch (err) {
                // ignore lookup errors in testing
              }
            }
          }

          await tx.task.update({
            where: { id: task.id },
            data: {
              assignedUserId: nextAssigneeId,
              assignee: nextAssigneeName,
            },
          });
        }
      }
    }
  }
}

/**
 * Ensure coordination tasks exist for assigned eventIds, and automatically assign them if role matches.
 */
export async function ensureCoordinationTasksForEventIds(
  projectId: string,
  userId: string,
  eventIds: string[],
  tx: any
): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) return;

  let isOperationalShootRole = false;
  let targetUser: any = null;
  try {
    targetUser = await tx.user.findUnique({
      where: { id: userId },
    });
    if (targetUser) {
      isOperationalShootRole =
        targetUser.role === Role.Photographer ||
        targetUser.role === Role.Videographer ||
        targetUser.role === Role.DroneOperator ||
        targetUser.role === Role.Assistant;
    }
  } catch (err) {
    // ignore lookup errors in testing
  }

  const brandName = project.client?.companyName || 'Artisans';

  for (const eventId of eventIds) {
    const existingTask = await tx.task.findFirst({
      where: { projectId, eventId },
    });

    if (!existingTask) {
      const event = await tx.event.findFirst({
        where: { id: eventId },
      });
      if (event) {
        const title = `Coordination for ${event.name} - ${project.name}`;
        let assignedUserId: string | null = null;
        let assigneeName = 'Unassigned';

        if (isOperationalShootRole && targetUser) {
          assignedUserId = userId;
          assigneeName = `${targetUser.firstName} ${targetUser.lastName}`.trim();
        }

        await tx.task.create({
          data: {
            title,
            dueDate: event.date,
            priority: 'High',
            status: 'Pending',
            brand: brandName,
            clientId: project.clientId,
            projectId: project.id,
            eventId: event.id,
            assignedUserId,
            assignee: assigneeName,
          },
        });
      }
    } else {
      if (isOperationalShootRole && targetUser && !existingTask.assignedUserId) {
        const assigneeName = `${targetUser.firstName} ${targetUser.lastName}`.trim();
        await tx.task.update({
          where: { id: existingTask.id },
          data: {
            assignedUserId: userId,
            assignee: assigneeName,
          },
        });
      }
    }
  }
}

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
          select: { 
            id: true, 
            name: true, 
            email: true, 
            phone: true,
            address: true,
            companyName: true,
            events: {
              orderBy: { date: 'asc' },
            },
          },
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
        client: {
          include: {
            events: {
              orderBy: { date: 'asc' },
            },
          },
        },
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

    const { project, folderStructure } = await ProjectsService.createProject(
      name,
      description,
      status,
      clientId
    );

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
    const { userId, role, eventId } = req.body;
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

    const assignment = await prisma.$transaction(async (tx) => {
      let currentAssignment = await tx.staffAssignment.findFirst({
        where: { projectId, userId },
      });

      if (currentAssignment) {
        // Reuse the existing record
        let updatedEventIds = [...currentAssignment.eventIds];
        if (eventId && !updatedEventIds.includes(eventId)) {
          updatedEventIds.push(eventId);
        }

        currentAssignment = await tx.staffAssignment.update({
          where: { id: currentAssignment.id },
          data: {
            role,
            eventIds: updatedEventIds,
          },
        });
      } else {
        // Create new record
        const initialEventIds = eventId ? [eventId] : [];
        currentAssignment = await tx.staffAssignment.create({
          data: {
            projectId,
            userId,
            role,
            eventIds: initialEventIds,
          },
        });
      }

      // Generate missing coordination tasks for assigned eventIds
      await ensureCoordinationTasksForEventIds(projectId, userId, currentAssignment.eventIds, tx);

      // Sync tasks
      await syncTasksForProject(projectId, tx);

      return currentAssignment;
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

    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.delete({
        where: { id: assignment.id },
      });

      // Sync tasks: unassign/re-assign tasks for this project
      await syncTasksForProject(projectId, tx);
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
 * Update assigned event IDs for a staff assignment
 */
export async function updateStaffAssignedEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, userId } = req.params;
    const { eventIds } = req.body;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can update staff event assignments.', 403);
    }

    // Verify project exists
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    // Verify staff assignment exists
    const staffAssignment = await prisma.staffAssignment.findFirst({
      where: { projectId, userId },
    });
    if (!staffAssignment) {
      throw new AppError('Staff assignment not found.', 404);
    }

    // Verify that all eventIds exist and belong to this project's client
    if (eventIds && eventIds.length > 0) {
      const validEvents = await prisma.event.findMany({
        where: {
          id: { in: eventIds },
          clientId: project.clientId,
        },
      });
      if (validEvents.length !== eventIds.length) {
        throw new AppError('One or more event IDs are invalid or do not belong to this project\'s client.', 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.staffAssignment.update({
        where: { id: staffAssignment.id },
        data: { eventIds },
      });

      // Automatically generate missing coordination tasks for these eventIds
      await ensureCoordinationTasksForEventIds(projectId, userId, eventIds, tx);

      // Sync tasks
      await syncTasksForProject(projectId, tx);

      return record;
    });

    await logWorkflowEvent({
      projectId,
      eventType: 'STAFF_EVENTS_UPDATED',
      description: `Assigned events updated for staff member on project.`,
      payload: { staffAssignmentId: staffAssignment.id, userId, eventIds },
    });

    await logAudit({
      userId: user.id,
      action: 'PROJECT_STAFF_EVENTS_UPDATE',
      details: { projectId, staffUserId: userId, eventIds },
      ...meta,
    });

    res.status(200).json(updated);
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

      const assignments = await tx.staffAssignment.findMany({
        where: { projectId: id },
        include: {
          user: true,
        },
      });

      for (const bp of taskBlueprints) {
        let assignedUserId: string | null = null;
        let assigneeName = 'Unassigned';

        if (assignments.length > 0) {
          let matchedAssignment = null;
          if (bp.title === 'Confirm Shoot Schedule' || bp.title === 'Collect Media') {
            matchedAssignment = assignments.find(
              (a) => a.role === 'Photographer' || a.role === 'Videographer' || a.role === 'DroneOperator'
            );
          } else if (bp.title === 'Start Editing' || bp.title === 'Prepare Deliverables') {
            matchedAssignment = assignments.find((a) => a.role === 'Editor');
          }

          if (!matchedAssignment) {
            matchedAssignment = assignments[0];
          }

          if (matchedAssignment) {
            assignedUserId = matchedAssignment.userId;
            const u = matchedAssignment.user;
            assigneeName = (u ? `${u.firstName} ${u.lastName}`.trim() : '') || 'Unassigned';
          }
        }

        const t = await tx.task.create({
          data: {
            title: `${bp.title} (${project.name})`,
            assignee: assigneeName,
            dueDate,
            status: 'Pending',
            brand: brandName,
            priority: bp.priority,
            clientId: project.clientId,
            projectId: project.id,
            assignedUserId,
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

