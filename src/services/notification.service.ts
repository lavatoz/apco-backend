import { prisma } from '../config/database';
import { Role } from '@prisma/client';

export interface NotificationPayload {
  title: string;
  message: string;
  metadata?: any;
}

export interface NotificationTransport {
  name: string;
  send(userId: string, payload: NotificationPayload): Promise<any>;
}

class NotificationServiceImpl {
  private transports: NotificationTransport[] = [];

  constructor() {
    // Register the default DB transport
    this.registerTransport({
      name: 'Database',
      send: async (userId: string, payload: NotificationPayload) => {
        return prisma.notification.create({
          data: {
            userId,
            title: payload.title,
            message: payload.message,
          },
        });
      },
    });

    // Register the Push transport (integrated FCM)
    this.registerTransport({
      name: 'Push',
      send: async (userId: string, payload: NotificationPayload) => {
        try {
          const { PushNotificationService } = await import('./push-notification.service');
          
          let data: Record<string, string> | undefined = undefined;
          if (payload.metadata) {
            data = {};
            for (const [key, value] of Object.entries(payload.metadata)) {
              if (value !== null && value !== undefined) {
                data[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
              }
            }
          }

          await PushNotificationService.sendToUser(userId, {
            title: payload.title,
            body: payload.message,
            data,
          });
        } catch (error) {
          console.error(`[NotificationService] Push transport failed for user ${userId}:`, error);
        }
      },
    });
  }

  /**
   * Register a new notification delivery transport (e.g. WebSocket, Email, SMS, Push)
   */
  registerTransport(transport: NotificationTransport) {
    this.transports.push(transport);
  }

  /**
   * Emits notification to a single user using all registered transports
   */
  async emitNotification(userId: string, payload: NotificationPayload): Promise<any> {
    let dbResult = null;
    for (const transport of this.transports) {
      try {
        const res = await transport.send(userId, payload);
        if (transport.name === 'Database') {
          dbResult = res;
        }
      } catch (error) {
        console.error(`Transport ${transport.name} failed to deliver notification to ${userId}:`, error);
      }
    }
    return dbResult;
  }

  /**
   * Emits notification to all active users matching a specific role
   */
  async emitToRole(role: Role, payload: NotificationPayload): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        where: { role, lockedUntil: null },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      await this.emitToUsers(userIds, payload);
    } catch (error) {
      console.error(`Failed to emit notification to role ${role}:`, error);
    }
  }

  /**
   * Emits notification to multiple users
   */
  async emitToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
    await Promise.all(
      userIds.map((userId) => this.emitNotification(userId, payload))
    );
  }
}

export const NotificationService = new NotificationServiceImpl();

/**
 * Backward-compatible helper to log/create a database notification
 */
export async function createNotification(userId: string, title: string, message: string) {
  return NotificationService.emitNotification(userId, { title, message });
}

/**
 * Backward-compatible helper to broadcast to roles
 */
export async function broadcastToRoles(roles: Role[], title: string, message: string) {
  for (const role of roles) {
    await NotificationService.emitToRole(role, { title, message });
  }
}
