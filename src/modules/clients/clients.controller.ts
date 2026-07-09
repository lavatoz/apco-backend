import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logAudit, extractReqMeta } from '../../services/audit.service';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';

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

    const fullCreatedClient = await ClientsService.createClient(body, user);

    if (fullCreatedClient) {
      await logAudit({
        userId: user.id,
        action: 'CLIENT_CREATE',
        details: { clientId: fullCreatedClient.id, email: fullCreatedClient.email },
        ...meta,
      });
    }

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

    const fullUpdatedClient = await ClientsService.updateClient(id, body, user, existing);

    if (fullUpdatedClient) {
      await logAudit({
        userId: user.id,
        action: 'CLIENT_UPDATE',
        details: { clientId: id, email: fullUpdatedClient.email },
        ...meta,
      });
    }

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
