import { prisma } from '../../config/database';
import { DisplayIdGenerator } from '../../services/display-id.service';
import { Role } from '@prisma/client';
import crypto from 'crypto';
import { AppError } from '../../middleware/error';

export class ClientsService {
  static async createClient(body: any, _currentUser: any) {
    // Business Validation
    const existing = await prisma.client.findFirst({
      where: { email: body.email, deletedAt: null },
    });

    if (existing) {
      throw new AppError('A client with this email already exists.', 400);
    }

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

    // Run inside database transaction
    const client = await prisma.$transaction(async (tx) => {
      // 1. Generate unique sequential client display ID
      const clientCode = await DisplayIdGenerator.getNextId('CLI', tx);

      // 2. Create client record
      const newClient = await tx.client.create({
        data: {
          ...clientData,
          clientCode,
        },
      });

      // 3. Provision User record with Pending Activation status
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

      // 4. Create events if any
      if (events && events.length > 0) {
        const eventsData = [];
        for (const ev of events) {
          const eventCode = await DisplayIdGenerator.getNextId('EVT', tx);
          eventsData.push({
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
            eventCode,
          });
        }
        await tx.event.createMany({
          data: eventsData,
        });
      }

      // 5. Provision default Project record
      const projectCode = await DisplayIdGenerator.getNextId('PRJ', tx);
      await tx.project.create({
        data: {
          name: `${newClient.name}'s Project`,
          status: 'Draft',
          clientId: newClient.id,
          projectCode,
          stage: 'Booked',
        },
      });

      return newClient;
    });

    // Fetch and return the fully populated client
    return prisma.client.findFirst({
      where: { id: client.id },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
    });
  }

  static async updateClient(id: string, body: any, _currentUser: any, existingClient: any) {
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

        await tx.user.updateMany({
          where: {
            OR: [
              { linkedClientId: id },
              { email: existingClient.email, role: Role.Client }
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
          const eventsData = [];
          for (const ev of events) {
            // Preserve eventCode if it exists in the payload, otherwise generate a new one
            const eventCode = ev.eventCode || await DisplayIdGenerator.getNextId('EVT', tx);
            eventsData.push({
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
              eventCode,
            });
          }
          await tx.event.createMany({
            data: eventsData,
          });
        }
      }

      return updatedClient;
    });

    return prisma.client.findFirst({
      where: { id: client.id },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
      },
    });
  }
}
