import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import crypto from 'crypto';

/**
 * List clients with role-based and query-level protection
 */
export async function getClients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    let whereClause: any = { deletedAt: null };

    // Query level leakage protection:
    // If user is a Client, they can ONLY see their own Client profile corresponding to their email.
    if (user.role === Role.Client) {
      whereClause.email = user.email;
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json(clients);
  } catch (error) {
    next(error);
  }
}

/**
 * Get client by ID with query-level check
 */
export async function getClientById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const client = await prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
    });


    if (!client) {
      throw new AppError('Client not found.', 404);
    }

    // Protection: Client role can only read their own profile
    if (user.role === Role.Client && client.email !== user.email) {
      throw new AppError('You do not have permission to access this client configuration.', 403);
    }

    res.status(200).json(client);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new client
 */
export async function createClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager mutating access
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can create new client records.', 403);
    }

    // Check duplicate active client email
    const existing = await prisma.client.findFirst({
      where: { email: body.email, deletedAt: null },
    });

    if (existing) {
      throw new AppError('A client with this email already exists.', 400);
    }

    // Check duplicate user email
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      throw new AppError('A user account with this email address already exists.', 400);
    }

    const nameParts = (body.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Client';
    const lastName = nameParts.slice(1).join(' ') || 'User';
    const setupToken = crypto.randomBytes(32).toString('hex');

    const { events, ...clientData } = body;

    const client = await prisma.$transaction(async (tx) => {
      // 1. Create client record
      const newClient = await tx.client.create({
        data: clientData,
      });

      // 2. Provision User record with Pending Activation status
      await tx.user.create({
        data: {
          email: newClient.email,
          passwordHash: null,
          firstName,
          lastName,
          role: Role.Client,
          mustChangePassword: true,
          emailVerified: true,
          setupToken,
          status: 'Pending Activation',
          linkedClientId: newClient.id,
        },
      });

      // 3. Create events if any
      if (events && events.length > 0) {
        await tx.event.createMany({
          data: events.map((ev: any) => ({
            id: ev.id,
            clientId: newClient.id,
            name: ev.name,
            date: new Date(ev.date),
            startTime: ev.startTime || null,
            endTime: ev.endTime || null,
            progress: ev.progress || 0,
            actualCompletedAt: ev.actualCompletedAt ? new Date(ev.actualCompletedAt) : null,
            brideLocation: ev.brideLocation || null,
            groomLocation: ev.groomLocation || null,
            venueLocation: ev.venueLocation || null,
            notes: ev.notes || null,
            status: ev.status || 'Scheduled',
          })),
        });
      }

      // 4. Provision default Project record
      await tx.project.create({
        data: {
          name: `${newClient.name}'s Project`,
          status: 'Draft',
          clientId: newClient.id,
          stage: 'Booked',
        },
      });

      return newClient;
    });

    await logAudit({
      userId: user.id,
      action: 'CLIENT_CREATE',
      details: { clientId: client.id, email: client.email },
      ...meta,
    });

    const fullCreatedClient = await prisma.client.findFirst({
      where: { id: client.id },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
    });

    res.status(201).json(fullCreatedClient);
  } catch (error) {
    next(error);
  }
}

/**
 * Update client details
 */
export async function updateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const body = req.body;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can update client records.', 403);
    }

    const existing = await prisma.client.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('Client record not found.', 404);
    }

    const { events, ...clientData } = body;

    const client = await prisma.$transaction(async (tx) => {
      // 1. Update client record
      const updatedClient = await tx.client.update({
        where: { id },
        data: clientData,
      });

      // 2. Sync corresponding User record if email or name changes
      if (clientData.email || clientData.name) {
        const userUpdateData: any = {};
        if (clientData.email) userUpdateData.email = clientData.email;
        if (clientData.name) {
          const nameParts = clientData.name.trim().split(/\s+/);
          userUpdateData.firstName = nameParts[0] || 'Client';
          userUpdateData.lastName = nameParts.slice(1).join(' ') || 'User';
        }

        // Try to update by linkedClientId first, fallback to email match
        await tx.user.updateMany({
          where: {
            OR: [
              { linkedClientId: id },
              { email: existing.email, role: Role.Client }
            ]
          },
          data: userUpdateData,
        });
      }

      // 3. Sync events
      if (events) {
        // Delete all existing events for this client
        await tx.event.deleteMany({
          where: { clientId: id },
        });

        // Create new ones
        if (events.length > 0) {
          await tx.event.createMany({
            data: events.map((ev: any) => ({
              id: ev.id,
              clientId: id,
              name: ev.name,
              date: new Date(ev.date),
              startTime: ev.startTime || null,
              endTime: ev.endTime || null,
              progress: ev.progress || 0,
              actualCompletedAt: ev.actualCompletedAt ? new Date(ev.actualCompletedAt) : null,
              brideLocation: ev.brideLocation || null,
              groomLocation: ev.groomLocation || null,
              venueLocation: ev.venueLocation || null,
              notes: ev.notes || null,
              status: ev.status || 'Scheduled',
            })),
          });
        }
      }

      return updatedClient;
    });

    await logAudit({
      userId: user.id,
      action: 'CLIENT_UPDATE',
      details: { clientId: id, email: client.email },
      ...meta,
    });

    const fullUpdatedClient = await prisma.client.findFirst({
      where: { id: client.id },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
    });

    res.status(200).json(fullUpdatedClient);
  } catch (error) {
    next(error);
  }
}

/**
 * Soft delete client record
 */
export async function deleteClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;
    const meta = extractReqMeta(req);

    // Enforce Admin/Manager
    if (user.role !== Role.SystemAdmin && user.role !== Role.Manager) {
      throw new AppError('Only administrators or managers can delete client records.', 403);
    }

    const existing = await prisma.client.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError('Client record not found.', 404);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Soft-delete Client
      await tx.client.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 2. Lock and deactivate corresponding User
      const clientUser = await tx.user.findFirst({
        where: {
          OR: [
            { linkedClientId: id },
            { email: existing.email, role: Role.Client }
          ]
        },
      });

      if (clientUser) {
        await tx.user.update({
          where: { id: clientUser.id },
          data: {
            lockedUntil: new Date('2099-12-31T23:59:59Z'),
            status: 'Inactive',
          },
        });

        // Revoke active sessions & tokens
        await tx.refreshToken.updateMany({
          where: { userId: clientUser.id },
          data: { isRevoked: true },
        });

        await tx.userSession.deleteMany({
          where: { userId: clientUser.id },
        });
      }
    });

    await logAudit({
      userId: user.id,
      action: 'CLIENT_DELETE',
      details: { clientId: id, email: existing.email },
      ...meta,
    });

    res.status(200).json({ message: 'Client soft-deleted successfully.' });
  } catch (error) {
    next(error);
  }
}
