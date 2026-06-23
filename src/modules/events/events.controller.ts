import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { Role } from '@prisma/client';

export async function getEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    let events;

    if (user.role === Role.Client) {
      const client = await prisma.client.findFirst({
        where: { email: user.email, deletedAt: null },
      });
      if (!client) {
        res.status(200).json([]);
        return;
      }
      events = await prisma.event.findMany({
        where: { clientId: client.id },
        orderBy: { date: 'asc' },
      });
    } else {
      events = await prisma.event.findMany({
        orderBy: { date: 'asc' },
      });
    }

    res.status(200).json(events);
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create events manually.', 403);
    }

    const event = await prisma.event.create({
      data: {
        id: body.id || `event_${Date.now()}`,
        clientId: body.clientId,
        name: body.name,
        date: new Date(body.date),
        startTime: body.startTime || null,
        endTime: body.endTime || null,
        progress: body.progress || 0,
        actualCompletedAt: body.actualCompletedAt ? new Date(body.actualCompletedAt) : null,
        brideLocation: body.brideLocation || null,
        groomLocation: body.groomLocation || null,
        venueLocation: body.venueLocation || null,
        notes: body.notes || null,
        status: body.status || 'Scheduled',
      },
    });

    await logAudit({
      userId: user.id,
      action: 'EVENT_CREATE',
      details: { eventId: event.id, name: event.name },
      ...meta,
    });

    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can update events.', 403);
    }

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      throw new AppError('Event not found.', 404);
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : event.name,
        date: body.date !== undefined ? new Date(body.date) : event.date,
        startTime: body.startTime !== undefined ? body.startTime : event.startTime,
        endTime: body.endTime !== undefined ? body.endTime : event.endTime,
        progress: body.progress !== undefined ? body.progress : event.progress,
        actualCompletedAt: body.actualCompletedAt !== undefined ? (body.actualCompletedAt ? new Date(body.actualCompletedAt) : null) : event.actualCompletedAt,
        brideLocation: body.brideLocation !== undefined ? body.brideLocation : event.brideLocation,
        groomLocation: body.groomLocation !== undefined ? body.groomLocation : event.groomLocation,
        venueLocation: body.venueLocation !== undefined ? body.venueLocation : event.venueLocation,
        notes: body.notes !== undefined ? body.notes : event.notes,
        status: body.status !== undefined ? body.status : event.status,
      },
    });

    await logAudit({
      userId: user.id,
      action: 'EVENT_UPDATE',
      details: { eventId: id, name: updatedEvent.name },
      ...meta,
    });

    res.status(200).json(updatedEvent);
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete events.', 403);
    }

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      throw new AppError('Event not found.', 404);
    }

    await prisma.event.delete({
      where: { id },
    });

    await logAudit({
      userId: user.id,
      action: 'EVENT_DELETE',
      details: { eventId: id, name: event.name },
      ...meta,
    });

    res.status(200).json({ message: 'Event deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
