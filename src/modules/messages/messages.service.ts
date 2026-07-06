import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';
import { Role } from '@prisma/client';
import { NotificationService } from '../../services/notification.service';

export class MessagesService {
  /**
   * Check if a user has permission to access a project's messages
   */
  static async checkProjectAccess(projectId: string, user: any) {
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

    let hasAccess = false;
    if (user.role === Role.SystemAdmin || user.role === Role.Manager) {
      hasAccess = true;
    } else if (user.role === Role.Client) {
      if (user.linkedClientId === project.clientId || project.client.email === user.email) {
        hasAccess = true;
      }
    } else {
      const isAssigned = project.staffAssignments.some((a) => a.userId === user.id);
      if (isAssigned) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      throw new AppError('Access denied to this project conversation.', 403);
    }

    return project;
  }

  /**
   * Fetch all messages for a project (ordered by createdAt ascending)
   * Supports limit and cursor pagination options for future extensions.
   */
  static async getMessages(
    projectId: string,
    user: any,
    pagination: { limit?: number; cursor?: string } = {}
  ) {
    // 1. Verify access
    await this.checkProjectAccess(projectId, user);

    // 2. Build query options
    const queryOptions: any = {
      where: {
        projectId,
        deletedAt: null, // soft delete support
      },
      orderBy: {
        createdAt: 'asc', // chronological order
      },
    };

    if (pagination.limit !== undefined) {
      queryOptions.take = pagination.limit;
    }

    if (pagination.cursor !== undefined) {
      queryOptions.skip = 1;
      queryOptions.cursor = {
        id: pagination.cursor,
      };
    }

    return prisma.projectMessage.findMany(queryOptions);
  }

  /**
   * Create a new message in a project and trigger notifications
   */
  static async createMessage(projectId: string, user: any, messageText: string) {
    // 1. Verify access and get project data
    const project = await this.checkProjectAccess(projectId, user);

    // 2. Create and persist the message
    const newMessage = await prisma.projectMessage.create({
      data: {
        projectId,
        senderId: user.id,
        message: messageText.trim(),
      },
    });

    // 3. Notification triggers using NotificationService
    if (user.role === Role.Client) {
      // Message from Client -> send to assigned Staff
      const staffUserIds = project.staffAssignments.map((a) => a.userId);
      if (staffUserIds.length > 0) {
        await NotificationService.emitToUsers(staffUserIds, {
          title: `New client message in project ${project.name}`,
          message: `${user.firstName} ${user.lastName}: ${newMessage.message}`,
          metadata: {
            projectId,
            messageId: newMessage.id,
            type: 'project_message',
          },
        });
      }
    } else {
      // Message from Staff -> send to linked Client User
      const clientUser = await prisma.user.findFirst({
        where: {
          OR: [
            { linkedClientId: project.clientId },
            { email: project.client.email },
          ],
          status: 'Active',
        },
      });

      if (clientUser) {
        await NotificationService.emitNotification(clientUser.id, {
          title: `New message in project ${project.name}`,
          message: `${user.firstName} ${user.lastName}: ${newMessage.message}`,
          metadata: {
            projectId,
            messageId: newMessage.id,
            type: 'project_message',
          },
        });
      }
    }

    return newMessage;
  }
}
