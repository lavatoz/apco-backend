import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import {
  assignPersonnelToEvent,
  removePersonnelFromEvent,
  removeAssignmentById,
} from '../../services/team-assignment.service';

/**
 * Get all personnel from registry (including assigned events)
 */
export async function getPersonnel(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const personnelList = await prisma.personnel.findMany({
      orderBy: { name: 'asc' },
      include: {
        assignments: {
          include: {
            event: true,
          },
        },
      },
    });

    const response = personnelList.map((person) => {
      const assignedEvents = person.assignments.map((a) => ({
        id: a.event.id,
        name: a.event.name,
        title: a.event.name,
      }));
      const { assignments, ...rest } = person;
      return {
        ...rest,
        assignedEvents,
      };
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

/**
 * Get personnel member by ID (wrapped response including assignedEvents)
 */
export async function getPersonnelById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const person = await prisma.personnel.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!person) {
      throw new AppError('Personnel not found.', 404);
    }

    const assignedEvents = person.assignments.map((a) => ({
      id: a.event.id,
      name: a.event.name,
      title: a.event.name,
    }));

    const { assignments, ...rest } = person;

    res.status(200).json({
      personnel: {
        ...rest,
        assignedEvents,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add personnel member to registry
 */
export async function createPersonnel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can add personnel to registry.', 403);
    }

    const person = await prisma.personnel.create({
      data: {
        name: body.name,
        role: body.role,
        phone: body.phone || null,
        email: body.email || null,
        rate: body.rate || null,
        status: body.status || 'Active',
      },
    });

    await logAudit({
      userId: user.id,
      action: 'PERSONNEL_CREATE',
      details: { personnelId: person.id, name: person.name, role: person.role },
      ...meta,
    });

    res.status(201).json(person);
  } catch (error) {
    next(error);
  }
}

/**
 * Update personnel profile
 */
export async function updatePersonnel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify personnel records.', 403);
    }

    const existing = await prisma.personnel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Personnel record not found.', 404);
    }

    const updated = await prisma.personnel.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : existing.name,
        role: body.role !== undefined ? body.role : existing.role,
        phone: body.phone !== undefined ? body.phone : existing.phone,
        email: body.email !== undefined ? body.email : existing.email,
        rate: body.rate !== undefined ? body.rate : existing.rate,
        status: body.status !== undefined ? body.status : existing.status,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'PERSONNEL_UPDATE',
      details: { personnelId: id, name: updated.name },
      ...meta,
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Remove personnel member from registry
 */
export async function deletePersonnel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can remove personnel records.', 403);
    }

    const existing = await prisma.personnel.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Personnel record not found.', 404);
    }

    await prisma.personnel.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'PERSONNEL_DELETE',
      details: { personnelId: id, name: existing.name },
      ...meta,
    });

    res.status(200).json({ message: 'Personnel member removed from registry successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Assign an event to a personnel member
 */
export async function assignEventToPersonnel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { personnelId, eventId, notes } = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can assign events to personnel.', 403);
    }

    const assignment = await assignPersonnelToEvent(personnelId, eventId, user.id, notes);

    await logAudit({
      userId: user.id,
      action: 'PERSONNEL_ASSIGN',
      details: { assignmentId: assignment.id, personnelId, eventId },
      ...meta,
    });

    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
}

/**
 * Remove an event assignment from a personnel member
 */
export async function removeEventAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can modify personnel event assignments.', 403);
    }

    const { id } = req.params;
    const { personnelId, eventId } = req.body;

    if (id) {
      const assignment = await removeAssignmentById(id);
      await logAudit({
        userId: user.id,
        action: 'PERSONNEL_UNASSIGN',
        details: { assignmentId: id, personnelId: assignment.personnelId, eventId: assignment.eventId },
        ...meta,
      });
      res.status(200).json({ message: 'Personnel assignment removed successfully.' });
      return;
    }

    const targetPersonnelId = personnelId || (req.query.personnelId as string);
    const targetEventId = eventId || (req.query.eventId as string);

    if (targetPersonnelId && targetEventId) {
      const assignment = await removePersonnelFromEvent(targetPersonnelId, targetEventId);
      await logAudit({
        userId: user.id,
        action: 'PERSONNEL_UNASSIGN',
        details: { assignmentId: assignment.id, personnelId: targetPersonnelId, eventId: targetEventId },
        ...meta,
      });
      res.status(200).json({ message: 'Personnel assignment removed successfully.' });
      return;
    }

    throw new AppError('Assignment ID or personnelId/eventId parameters are required.', 400);
  } catch (error) {
    next(error);
  }
}
