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

