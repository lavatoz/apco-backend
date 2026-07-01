import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role, WorkflowStageType, WorkflowStageStatus } from '@prisma/client';

const STAGES_ORDER = [
  WorkflowStageType.CLIENT_ONBOARDING,
  WorkflowStageType.AGREEMENT,
  WorkflowStageType.ADVANCE_PAYMENT,
  WorkflowStageType.PRE_PRODUCTION,
  WorkflowStageType.SHOOT,
  WorkflowStageType.POST_PRODUCTION,
  WorkflowStageType.EDITING,
  WorkflowStageType.DELIVERY,
  WorkflowStageType.PROJECT_CLOSURE,
];

/**
 * Map WorkflowStageType to legacy Project.stage string for backward compatibility
 */
function getLegacyStageName(type: WorkflowStageType): string {
  switch (type) {
    case WorkflowStageType.CLIENT_ONBOARDING:
      return 'Booked';
    case WorkflowStageType.AGREEMENT:
      return 'Agreement Signed';
    case WorkflowStageType.ADVANCE_PAYMENT:
      return 'Advance Paid';
    case WorkflowStageType.PRE_PRODUCTION:
      return 'Team Assigned';
    case WorkflowStageType.SHOOT:
      return 'Shoot Completed';
    case WorkflowStageType.POST_PRODUCTION:
      return 'Selection Received';
    case WorkflowStageType.EDITING:
      return 'Editing';
    case WorkflowStageType.DELIVERY:
      return 'Delivery Ready';
    case WorkflowStageType.PROJECT_CLOSURE:
      return 'Delivered';
    default:
      return 'Booked';
  }
}

/**
 * Validate that a user has access to a project
 */
async function verifyProjectAccess(projectId: string, user: { id: string; role: Role; email: string }) {
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

  if (user.role === Role.Client) {
    if (project.client.email !== user.email) {
      throw new AppError('Access denied to this project profile.', 403);
    }
  } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
    const isAssigned = project.staffAssignments.some((a) => a.userId === user.id);
    if (!isAssigned) {
      throw new AppError('Access denied. You are not assigned to this project.', 403);
    }
  }

  return project;
}

/**
 * GET /projects/:id/workflow
 * Fetches all workflow stages for a project sorted by displayOrder
 * Calculates project progress dynamically: Completed Stages / Total Stages * 100
 */
export async function getProjectWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;

    // 1. Verify project access
    await verifyProjectAccess(projectId, user);

    // 2. Fetch stages
    const stages = await prisma.workflowStage.findMany({
      where: { projectId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        attachments: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (stages.length === 0) {
      res.status(200).json({ progress: 0, stages: [] });
      return;
    }

    // 3. Dynamic Progress Calculation: Completed Stages / Total Stages * 100
    const completedCount = stages.filter((s) => s.status === WorkflowStageStatus.COMPLETED).length;
    const progress = Math.round((completedCount / stages.length) * 100);

    res.status(200).json({ progress, stages });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /projects/:id/workflow
 * Automatically create default workflow stages for a project
 */
export async function initializeProjectWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const user = req.user!;

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can initialize workflows.', 403);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });

    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    const createdStages: any[] = [];

    // Create the default 9 stages inside a transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < STAGES_ORDER.length; i++) {
        const stageType = STAGES_ORDER[i];

        // Check if stage already exists
        const existing = await tx.workflowStage.findUnique({
          where: {
            projectId_stageType: {
              projectId,
              stageType,
            },
          },
        });

        if (!existing) {
          const newStage = await tx.workflowStage.create({
            data: {
              projectId,
              stageType,
              displayOrder: i,
              status: i === 0 ? WorkflowStageStatus.IN_PROGRESS : WorkflowStageStatus.PENDING,
              startedAt: i === 0 ? new Date() : null,
            },
          });
          createdStages.push(newStage);
        } else {
          createdStages.push(existing);
        }
      }
    });

    res.status(201).json(createdStages);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /projects/:id/workflow/:stageId
 * Updates status, owner, notes, and records changes in activities log
 */
export async function updateProjectWorkflowStage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, stageId } = req.params;
    const user = req.user!;
    const { status, ownerId, notes, remarks, fileIds } = req.body;

    // 1. Verify project access
    const project = await verifyProjectAccess(projectId, user);

    // 2. Fetch the target workflow stage
    const stage = await prisma.workflowStage.findFirst({
      where: { id: stageId, projectId },
    });

    if (!stage) {
      throw new AppError('Workflow stage not found.', 404);
    }

    // 3. Permission Checks
    // Managers/Admins: full access
    // Clients: read-only (error)
    // Staff: update only assigned stages (stage.ownerId === user.id)
    if (user.role === Role.Client) {
      throw new AppError('Clients are not authorized to update workflow stages.', 403);
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      if (stage.ownerId !== user.id) {
        throw new AppError('You are only authorized to update workflow stages assigned to you.', 403);
      }
    }

    // 4. Determine status change and timestamps
    let newStatus: WorkflowStageStatus = stage.status;
    let startedAt: Date | null = stage.startedAt;
    let completedAt: Date | null = stage.completedAt;

    if (status) {
      const upperStatus = status.toUpperCase().replace(' ', '_') as WorkflowStageStatus;
      if (Object.values(WorkflowStageStatus).includes(upperStatus)) {
        newStatus = upperStatus;
        if (newStatus === WorkflowStageStatus.IN_PROGRESS && !startedAt) {
          startedAt = new Date();
        } else if (newStatus === WorkflowStageStatus.COMPLETED) {
          if (!startedAt) startedAt = new Date();
          completedAt = new Date();
        } else if (newStatus === WorkflowStageStatus.PENDING) {
          startedAt = null;
          completedAt = null;
        }
      } else {
        throw new AppError(`Invalid status: ${status}. Must be Pending, In Progress, or Completed.`, 400);
      }
    }

    // 5. Update stage and log audit in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create new attachments if fileIds are provided
      if (fileIds && Array.isArray(fileIds)) {
        for (const fileId of fileIds) {
          const fileRecord = await tx.file.findUnique({
            where: { id: fileId },
          });
          if (fileRecord) {
            await tx.workflowStageAttachment.create({
              data: {
                workflowStageId: stage.id,
                fileId,
                fileName: fileRecord.originalName,
                uploadedBy: user.id,
              },
            });
          }
        }
      }

      // Update WorkflowStage record
      const updatedStage = await tx.workflowStage.update({
        where: { id: stage.id },
        data: {
          status: newStatus,
          ownerId: ownerId !== undefined ? ownerId : stage.ownerId,
          notes: notes !== undefined ? notes : stage.notes,
          startedAt,
          completedAt,
        },
      });

      // Log WorkflowActivity if status changed
      if (newStatus !== stage.status) {
        await tx.workflowActivity.create({
          data: {
            workflowStageId: stage.id,
            changedBy: user.id,
            oldStatus: stage.status,
            newStatus,
            remarks: remarks || `Status changed from ${stage.status} to ${newStatus}`,
          },
        });

        // Backward compatibility: update legacy Project.stage
        if (newStatus === WorkflowStageStatus.COMPLETED || newStatus === WorkflowStageStatus.IN_PROGRESS) {
          // Find the highest active or completed stage in the project
          const allStages = await tx.workflowStage.findMany({
            where: { projectId },
            orderBy: { displayOrder: 'asc' },
          });

          // Find latest completed/in-progress stage
          let latestStage = allStages[0];
          for (const s of allStages) {
            if (s.id === stage.id) {
              // Use the pending updated state
              s.status = newStatus;
            }
            if (s.status === WorkflowStageStatus.COMPLETED || s.status === WorkflowStageStatus.IN_PROGRESS) {
              latestStage = s;
            }
          }

          const legacyStageName = getLegacyStageName(latestStage.stageType);
          await tx.project.update({
            where: { id: projectId },
            data: { stage: legacyStageName },
          });

          // Trigger automatic tasks if stage becomes COMPLETED
          if (newStatus === WorkflowStageStatus.COMPLETED) {
            const taskBlueprints: { title: string; priority: string }[] = [];
            
            if (stage.stageType === WorkflowStageType.ADVANCE_PAYMENT) {
              taskBlueprints.push({ title: 'Confirm Shoot Schedule', priority: 'High' });
            } else if (stage.stageType === WorkflowStageType.SHOOT) {
              taskBlueprints.push({ title: 'Collect Media', priority: 'High' });
            } else if (stage.stageType === WorkflowStageType.POST_PRODUCTION) {
              taskBlueprints.push({ title: 'Start Editing', priority: 'High' });
            } else if (stage.stageType === WorkflowStageType.EDITING) {
              taskBlueprints.push({ title: 'Prepare Deliverables', priority: 'Medium' });
            } else if (stage.stageType === WorkflowStageType.DELIVERY) {
              taskBlueprints.push({ title: 'Send Delivery Notification', priority: 'High' });
            }

            if (taskBlueprints.length > 0) {
              const brandName = project.client?.companyName || 'Artisans';
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);

              const assignments = await tx.staffAssignment.findMany({
                where: { projectId },
                include: { user: true },
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

                await tx.task.create({
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
              }
            }
          }
        }
      }

      return updatedStage;
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /projects/:id/workflow/:stageId/attachment/:attachmentId
 * Deletes the association/link of an attachment on a stage
 */
export async function deleteWorkflowStageAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id: projectId, stageId, attachmentId } = req.params;
    const user = req.user!;

    // 1. Verify project access
    await verifyProjectAccess(projectId, user);

    // 2. Verify stage exists
    const stage = await prisma.workflowStage.findFirst({
      where: { id: stageId, projectId },
    });

    if (!stage) {
      throw new AppError('Workflow stage not found.', 404);
    }

    // 3. Permission checks
    if (user.role === Role.Client) {
      throw new AppError('Clients are not authorized to delete workflow attachments.', 403);
    } else if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      if (stage.ownerId !== user.id) {
        throw new AppError('You can only delete attachments on workflow stages assigned to you.', 403);
      }
    }

    // 4. Verify attachment exists
    const attachment = await prisma.workflowStageAttachment.findFirst({
      where: { id: attachmentId, workflowStageId: stageId },
    });

    if (!attachment) {
      throw new AppError('Attachment not found.', 404);
    }

    // 5. Delete link record (do not delete File row or underlying GDrive file)
    await prisma.workflowStageAttachment.delete({
      where: { id: attachmentId },
    });

    res.status(200).json({ message: 'Attachment association deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
