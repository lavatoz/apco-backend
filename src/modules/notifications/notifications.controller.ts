import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/error';

/**
 * Get all notifications for the authenticated user
 */
export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new AppError('Notification not found.', 404);
    }

    if (notification.userId !== user.id) {
      throw new AppError('Access denied.', 403);
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Mark all user notifications as read
 */
export async function markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a single notification
 */
export async function deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user!;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new AppError('Notification not found.', 404);
    }

    if (notification.userId !== user.id) {
      throw new AppError('Access denied.', 403);
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Notification deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete all notifications for the authenticated user
 */
export async function deleteAllNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    await prisma.notification.deleteMany({
      where: { userId: user.id },
    });

    res.status(200).json({ message: 'All notifications deleted successfully.' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get count of unread notifications for the authenticated user
 */
export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    const count = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });

    res.status(200).json({ count });
  } catch (error) {
    next(error);
  }
}

/**
 * Register or update a device token for push notifications
 */
export async function registerDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, deviceId, platform } = req.body;
    const user = req.user!;

    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId: user.id,
        deviceId: deviceId !== undefined ? deviceId : undefined,
        platform: platform !== undefined ? platform : undefined,
        lastUsedAt: new Date()
      },
      create: {
        token,
        userId: user.id,
        deviceId: deviceId || null,
        platform: platform || null,
        lastUsedAt: new Date()
      }
    });

    res.status(200).json({
      message: 'Device token registered successfully.',
      deviceToken
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove/unregister a device token
 */
export async function deleteDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    const user = req.user!;

    const deleteResult = await prisma.deviceToken.deleteMany({
      where: {
        token,
        userId: user.id
      }
    });

    res.status(200).json({
      message: 'Device token deleted successfully.',
      deletedCount: deleteResult.count
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Send a test push notification to the authenticated user's registered devices
 */
export async function testPushNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const { PushNotificationService } = await import('../../services/push-notification.service');

    await PushNotificationService.sendToUser(user.id, {
      title: 'APCO Test',
      body: 'Push notifications are working successfully.',
    });

    res.status(200).json({
      message: 'Test push notification dispatched successfully.'
    });
  } catch (error) {
    next(error);
  }
}


