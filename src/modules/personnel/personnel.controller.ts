import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { logAudit, extractReqMeta } from '../../services/audit.service';

/**
 * Get all personnel from registry
 */
export async function getPersonnel(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const personnel = await prisma.personnel.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json(personnel);
  } catch (error) {
    next(error);
  }
}

/**
 * Get personnel member by ID
 */
export async function getPersonnelById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const person = await prisma.personnel.findUnique({
      where: { id },
    });

    if (!person) {
      throw new AppError('Personnel not found.', 404);
    }

    res.status(200).json(person);
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
